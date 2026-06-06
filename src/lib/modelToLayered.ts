import * as THREE from "three";
import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import { findNearestColor } from "./color";
import type { BeadColor, LayeredPattern, ModelOrientation, ModelPreviewData, Rgb } from "../types";

type Triangle = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  colorId: string;
};

type ParsedModel = {
  triangles: Triangle[];
  palette: BeadColor[];
};

type SliceSegment = {
  start: THREE.Vector2;
  end: THREE.Vector2;
  colorId: string;
};

type RowIntersection = {
  x: number;
  colorId: string;
};

type ThreeMfPackage = Record<string, Uint8Array>;

type ThreeMfObject = {
  id: string;
  vertices: THREE.Vector3[];
  triangles: ThreeMfTriangle[];
  components: ThreeMfComponent[];
};

type ThreeMfTriangle = {
  vertices: [number, number, number];
  paintColor: string | null;
};

type ThreeMfComponent = {
  objectId: string;
  path: string | null;
  transform: THREE.Matrix4;
};

type ThreeMfBuildItem = {
  objectId: string;
  transform: THREE.Matrix4;
};

type BambuProjectColorData = {
  filamentColors: BeadColor[];
  partExtruders: Map<string, number>;
};

type ModelSliceSettings = {
  width: number;
  height: number;
  beadPitchMm: number;
  beadHeightMm: number;
  targetLayers: number;
  colorId: string;
  orientation?: ModelOrientation;
};

type ModelPreviewSettings = {
  colorId: string;
};

const EPSILON = 1e-6;
const colorCache = new Map<string, string>();
const bambuPaintColorExtruderIndices = new Map([
  ["4", 0],
  ["8", 1],
  ["0C", 2],
  ["1C", 3],
]);

export async function modelFileToPreviewData(file: File, settings: ModelPreviewSettings): Promise<ModelPreviewData> {
  const { fileType, parsedModel } = await parseModelFile(file, settings.colorId);
  if (parsedModel.triangles.length === 0) {
    throw new Error("模型中没有可预览的三角面");
  }

  const bounds = getBounds(parsedModel.triangles);

  return {
    fileName: file.name,
    fileType,
    triangleCount: parsedModel.triangles.length,
    palette: parsedModel.palette,
    bounds: serializeBounds(bounds),
    triangles: parsedModel.triangles.map(serializeTriangle),
  };
}

export async function modelFileToLayeredPattern(file: File, settings: ModelSliceSettings): Promise<LayeredPattern> {
  const sliceSettings = normalizeModelSliceSettings(settings);
  const { fileType, parsedModel } = await parseModelFile(file, sliceSettings.colorId);
  const rawTriangles = orientTriangles(parsedModel.triangles, sliceSettings.orientation);

  if (rawTriangles.length === 0) {
    throw new Error("模型中没有可切片的三角面");
  }

  const triangles = normalizeTriangles(rawTriangles, sliceSettings);
  const layerCount = getLayerCount(triangles, sliceSettings);
  const layers = [];

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const cells = sliceLayer(triangles, layerIndex, sliceSettings);
    if (cells.some(Boolean)) {
      layers.push({
        index: layerIndex,
        name: `Layer ${layerIndex + 1}`,
        cells,
      });
    }
  }

  if (layers.length === 0) {
    throw new Error("没有生成有效层，请尝试放大模型或降低层高");
  }

  return {
    version: 1,
    kind: "layered-model",
    width: sliceSettings.width,
    height: sliceSettings.height,
    sourceModel: {
      fileName: file.name,
      fileType,
      scale: getScale(rawTriangles, sliceSettings),
      layerHeightMm: sliceSettings.beadHeightMm,
      beadPitchMm: sliceSettings.beadPitchMm,
      beadHeightMm: sliceSettings.beadHeightMm,
      targetLayers: sliceSettings.targetLayers,
      orientation: sliceSettings.orientation,
    },
    layers,
    palette: parsedModel.palette,
  };
}

function normalizeModelSliceSettings(settings: ModelSliceSettings): ModelSliceSettings {
  return {
    ...settings,
    width: Math.max(1, Math.round(settings.width)),
    height: Math.max(1, Math.round(settings.height)),
    beadPitchMm: clampPositive(settings.beadPitchMm, 2.6),
    beadHeightMm: clampPositive(settings.beadHeightMm, 3),
    targetLayers: Math.max(0, Math.round(settings.targetLayers)),
    orientation: normalizeModelOrientation(settings.orientation),
  };
}

async function parseModelFile(file: File, fallbackColorId: string) {
  const fileType = getModelFileType(file.name);
  const buffer = await file.arrayBuffer();
  const parsedModel = fileType === "stl"
    ? trianglesFromStl(buffer, fallbackColorId)
    : trianglesFrom3mf(buffer, fallbackColorId);
  return { fileType, parsedModel };
}

function serializeTriangle(triangle: Triangle) {
  return {
    a: serializeVector(triangle.a),
    b: serializeVector(triangle.b),
    c: serializeVector(triangle.c),
    colorId: triangle.colorId,
  };
}

function serializeBounds(bounds: THREE.Box3): ModelPreviewData["bounds"] {
  return {
    min: serializeVector(bounds.min),
    max: serializeVector(bounds.max),
  };
}

function serializeVector(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function normalizeModelOrientation(orientation: ModelOrientation | undefined): ModelOrientation {
  return {
    rotateXDeg: normalizeRotationDegrees(orientation?.rotateXDeg ?? 0),
    rotateYDeg: normalizeRotationDegrees(orientation?.rotateYDeg ?? 0),
    rotateZDeg: normalizeRotationDegrees(orientation?.rotateZDeg ?? 0),
  };
}

function normalizeRotationDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function orientTriangles(triangles: Triangle[], orientation: ModelOrientation | undefined): Triangle[] {
  const normalizedOrientation = normalizeModelOrientation(orientation);
  if (
    normalizedOrientation.rotateXDeg === 0
    && normalizedOrientation.rotateYDeg === 0
    && normalizedOrientation.rotateZDeg === 0
  ) {
    return triangles;
  }

  const bounds = getBounds(triangles);
  const center = bounds.getCenter(new THREE.Vector3());
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(normalizedOrientation.rotateXDeg),
    THREE.MathUtils.degToRad(normalizedOrientation.rotateYDeg),
    THREE.MathUtils.degToRad(normalizedOrientation.rotateZDeg),
    "XYZ",
  ));
  const orientPoint = (point: THREE.Vector3) => point.clone().sub(center).applyMatrix4(matrix);

  return triangles.map((triangle) => ({
    a: orientPoint(triangle.a),
    b: orientPoint(triangle.b),
    c: orientPoint(triangle.c),
    colorId: triangle.colorId,
  }));
}

function getModelFileType(fileName: string): "stl" | "3mf" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".stl")) return "stl";
  if (lower.endsWith(".3mf")) return "3mf";
  throw new Error("目前仅支持 STL 和 3MF 文件");
}

function trianglesFromStl(buffer: ArrayBuffer, fallbackColorId: string): ParsedModel {
  const geometry = new STLLoader().parse(buffer);
  return {
    triangles: trianglesFromGeometry(geometry, new THREE.Matrix4(), fallbackColorId),
    palette: bambuPlaBasicColors,
  };
}

function trianglesFrom3mf(buffer: ArrayBuffer, fallbackColorId: string): ParsedModel {
  const archiveModel = trianglesFrom3mfArchive(buffer, fallbackColorId);
  if (archiveModel && archiveModel.triangles.length > 0) return archiveModel;

  if (typeof DOMParser === "undefined") {
    throw new Error("当前浏览器线程无法解析此 3MF 格式，请尝试从 Bambu Studio 重新导出 3MF");
  }

  const group = new ThreeMFLoader().parse(buffer);
  const triangles: Triangle[] = [];
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    appendTriangles(triangles, trianglesFromGeometry(object.geometry, object.matrixWorld, fallbackColorId, object.material));
  });

  return { triangles, palette: bambuPlaBasicColors };
}

function trianglesFrom3mfArchive(buffer: ArrayBuffer, fallbackColorId: string): ParsedModel | null {
  let archive: ThreeMfPackage;
  try {
    archive = unzipSync(new Uint8Array(buffer));
  } catch {
    return null;
  }

  const projectColorData = getBambuProjectColorData(archive, fallbackColorId);
  const rootModel = parseThreeMfModel(archive, "3D/3dmodel.model");
  if (!rootModel) return null;

  const objectModelCache = new Map<string, ReturnType<typeof parseThreeMfModel>>();
  const triangles: Triangle[] = [];

  for (const buildItem of rootModel.build) {
    appendBambuObjectTriangles({
      archive,
      cache: objectModelCache,
      model: rootModel,
      objectId: buildItem.objectId,
      matrix: buildItem.transform,
      colorId: fallbackColorId,
      projectColorData,
      triangles,
    });
  }

  return {
    triangles,
    palette: projectColorData ? mergePalettes(bambuPlaBasicColors, projectColorData.filamentColors) : bambuPlaBasicColors,
  };
}

function appendBambuObjectTriangles({
  archive,
  cache,
  model,
  objectId,
  matrix,
  colorId,
  projectColorData,
  triangles,
}: {
  archive: ThreeMfPackage;
  cache: Map<string, ReturnType<typeof parseThreeMfModel>>;
  model: NonNullable<ReturnType<typeof parseThreeMfModel>>;
  objectId: string;
  matrix: THREE.Matrix4;
  colorId: string;
  projectColorData: BambuProjectColorData | null;
  triangles: Triangle[];
}) {
  const object = model.objects.get(objectId);
  if (!object) return;
  const objectColorId = getBambuPartColorId(object.id, colorId, projectColorData);

  if (object.triangles.length > 0) {
    appendThreeMfMeshTriangles(triangles, object, matrix, objectColorId, projectColorData);
    return;
  }

  for (const component of object.components) {
    const nextMatrix = new THREE.Matrix4().multiplyMatrices(matrix, component.transform);
    const componentColorId = getBambuPartColorId(component.objectId, objectColorId, projectColorData);

    if (component.path) {
      const modelPath = normalizeThreeMfPath(component.path);
      let componentModel = cache.get(modelPath);
      if (!componentModel) {
        componentModel = parseThreeMfModel(archive, modelPath);
        cache.set(modelPath, componentModel);
      }
      if (componentModel) {
        appendBambuObjectTriangles({
          archive,
          cache,
          model: componentModel,
          objectId: component.objectId,
          matrix: nextMatrix,
          colorId: componentColorId,
          projectColorData,
          triangles,
        });
      }
      continue;
    }

    appendBambuObjectTriangles({
      archive,
      cache,
      model,
      objectId: component.objectId,
      matrix: nextMatrix,
      colorId: componentColorId,
      projectColorData,
      triangles,
    });
  }
}

function appendThreeMfMeshTriangles(target: Triangle[], object: ThreeMfObject, matrix: THREE.Matrix4, colorId: string, projectColorData: BambuProjectColorData | null) {
  for (const triangle of object.triangles) {
    const [aIndex, bIndex, cIndex] = triangle.vertices;
    const a = object.vertices[aIndex];
    const b = object.vertices[bIndex];
    const c = object.vertices[cIndex];
    if (!a || !b || !c) continue;

    target.push({
      a: a.clone().applyMatrix4(matrix),
      b: b.clone().applyMatrix4(matrix),
      c: c.clone().applyMatrix4(matrix),
      colorId: getBambuPaintColorId(triangle.paintColor, colorId, projectColorData),
    });
  }
}

function getBambuProjectColorData(archive: ThreeMfPackage, fallbackColorId: string): BambuProjectColorData | null {
  const projectSettingsText = decodeArchiveText(archive, "Metadata/project_settings.config");
  const modelSettingsText = decodeArchiveText(archive, "Metadata/model_settings.config");
  if (!projectSettingsText || !modelSettingsText) return null;

  const projectSettings = parseJsonObject(projectSettingsText);
  if (!projectSettings) return null;

  const filamentColorValues = Array.isArray(projectSettings.filament_colour) ? projectSettings.filament_colour : [];
  const filamentIds = Array.isArray(projectSettings.filament_ids) ? projectSettings.filament_ids : [];
  const filamentColors = filamentColorValues.map((hex, index) => createThreeMfFilamentColor(hex, index, filamentIds[index], fallbackColorId));
  if (filamentColors.length === 0) return null;

  const partExtruders = new Map<string, number>();
  for (const objectNode of findXmlElements(modelSettingsText, "object")) {
    const objectId = objectNode.attributes.get("id");
    if (!objectId) continue;

    const extruder = findMetadataValue(objectNode.body, "extruder");
    const extruderIndex = parseExtruderIndex(extruder);
    if (extruderIndex !== null) {
      partExtruders.set(objectId, extruderIndex);
    }
  }

  for (const partNode of findXmlElements(modelSettingsText, "part")) {
    const partId = partNode.attributes.get("id");
    if (!partId) continue;

    const extruder = findMetadataValue(partNode.body, "extruder");
    const extruderIndex = parseExtruderIndex(extruder);
    if (extruderIndex !== null) {
      partExtruders.set(partId, extruderIndex);
    }
  }

  return { filamentColors, partExtruders };
}

function getBambuPartColorId(partId: string, fallbackColorId: string, projectColorData: BambuProjectColorData | null): string {
  if (!projectColorData) return fallbackColorId;
  const extruderIndex = projectColorData.partExtruders.get(partId);
  if (extruderIndex === undefined) return fallbackColorId;
  return projectColorData.filamentColors[extruderIndex]?.id ?? fallbackColorId;
}

function getBambuPaintColorId(paintColor: string | null, fallbackColorId: string, projectColorData: BambuProjectColorData | null): string {
  if (!projectColorData) return fallbackColorId;
  const code = getBambuPaintColorCode(paintColor);
  if (!code) return fallbackColorId;

  const extruderIndex = bambuPaintColorExtruderIndices.get(code);
  if (extruderIndex === undefined) return fallbackColorId;

  return projectColorData.filamentColors[extruderIndex]?.id ?? fallbackColorId;
}

function createThreeMfFilamentColor(value: unknown, index: number, materialId: unknown, fallbackColorId: string): BeadColor {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    return bambuPlaBasicColors.find((color) => color.id === fallbackColorId) ?? bambuPlaBasicColors[0];
  }

  const normalizedHex = value.toUpperCase();
  const code = `3MF-${index + 1}`;
  return {
    id: `3mf-filament-${index + 1}-${normalizedHex.slice(1).toLowerCase()}`,
    brand: "Bambu Lab",
    filamentType: "3MF Filament",
    code,
    name: `3MF Filament ${index + 1}`,
    nameZh: `3MF 耗材 ${index + 1}`,
    hex: normalizedHex,
    materialId: typeof materialId === "string" ? materialId : undefined,
  };
}

function mergePalettes(basePalette: BeadColor[], projectPalette: BeadColor[]): BeadColor[] {
  const colors = new Map<string, BeadColor>();
  for (const color of basePalette) colors.set(color.id, color);
  for (const color of projectPalette) colors.set(color.id, color);
  return [...colors.values()];
}

function getBambuPaintColorCode(paintColor: string | null): string | null {
  if (!paintColor) return null;
  const normalized = paintColor.trim().toUpperCase();
  if (!normalized) return null;

  for (let index = 0; index < normalized.length; index += 1) {
    const twoCharacterCode = normalized.slice(index, index + 2);
    if (bambuPaintColorExtruderIndices.has(twoCharacterCode)) return twoCharacterCode;

    const oneCharacterCode = normalized[index];
    if (oneCharacterCode && bambuPaintColorExtruderIndices.has(oneCharacterCode)) return oneCharacterCode;
  }

  return null;
}

function parseExtruderIndex(value: string | null): number | null {
  if (!value) return null;
  const extruderIndex = Number.parseInt(value, 10) - 1;
  return Number.isFinite(extruderIndex) && extruderIndex >= 0 ? extruderIndex : null;
}

function parseThreeMfModel(archive: ThreeMfPackage, path: string) {
  const modelText = decodeArchiveText(archive, path);
  if (!modelText) return null;

  const objects = new Map<string, ThreeMfObject>();
  const build: ThreeMfBuildItem[] = [];

  for (const objectNode of findXmlElements(getXmlElementBody(modelText, "resources") ?? modelText, "object")) {
    const id = objectNode.attributes.get("id");
    if (!id) continue;

    const vertices: THREE.Vector3[] = [];
    const triangles: ThreeMfTriangle[] = [];
    const components: ThreeMfComponent[] = [];

    for (const vertexNode of findXmlStartTags(getXmlElementBody(objectNode.body, "vertices") ?? "", "vertex")) {
      vertices.push(new THREE.Vector3(
        parseFloatAttribute(vertexNode.attributes, "x"),
        parseFloatAttribute(vertexNode.attributes, "y"),
        parseFloatAttribute(vertexNode.attributes, "z"),
      ));
    }

    for (const triangleNode of findXmlStartTags(getXmlElementBody(objectNode.body, "triangles") ?? "", "triangle")) {
      triangles.push({
        vertices: [
          parseIntAttribute(triangleNode.attributes, "v1"),
          parseIntAttribute(triangleNode.attributes, "v2"),
          parseIntAttribute(triangleNode.attributes, "v3"),
        ],
        paintColor: triangleNode.attributes.get("paint_color") ?? null,
      });
    }

    for (const componentNode of findXmlStartTags(getXmlElementBody(objectNode.body, "components") ?? "", "component")) {
      const componentObjectId = componentNode.attributes.get("objectid");
      if (!componentObjectId) continue;

      components.push({
        objectId: componentObjectId,
        path: componentNode.attributes.get("p:path") ?? null,
        transform: parseThreeMfTransform(componentNode.attributes.get("transform") ?? null),
      });
    }

    objects.set(id, { id, vertices, triangles, components });
  }

  for (const itemNode of findXmlStartTags(getXmlElementBody(modelText, "build") ?? "", "item")) {
    const objectId = itemNode.attributes.get("objectid");
    if (!objectId) continue;
    build.push({ objectId, transform: parseThreeMfTransform(itemNode.attributes.get("transform") ?? null) });
  }

  return { objects, build };
}

function decodeArchiveText(archive: ThreeMfPackage, path: string): string | null {
  const file = archive[path];
  return file ? new TextDecoder().decode(file) : null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function findMetadataValue(xml: string, key: string): string | null {
  for (const metadataNode of findXmlStartTags(xml, "metadata")) {
    if (metadataNode.attributes.get("key") === key) {
      return metadataNode.attributes.get("value") ?? null;
    }
  }
  return null;
}

function parseFloatAttribute(attributes: Map<string, string>, name: string): number {
  const value = Number.parseFloat(attributes.get(name) ?? "0");
  return Number.isFinite(value) ? value : 0;
}

function parseIntAttribute(attributes: Map<string, string>, name: string): number {
  const value = Number.parseInt(attributes.get(name) ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

function getXmlElementBody(xml: string, tagName: string): string | null {
  return findXmlElements(xml, tagName)[0]?.body ?? null;
}

function findXmlElements(xml: string, tagName: string): Array<{ attributes: Map<string, string>; body: string }> {
  const elements: Array<{ attributes: Map<string, string>; body: string }> = [];
  const openTagPattern = createXmlOpenTagPattern(tagName);
  let match: RegExpExecArray | null;

  while ((match = openTagPattern.exec(xml))) {
    const openTag = match[0];
    const openTagEnd = openTagPattern.lastIndex;
    const attributes = parseXmlAttributes(openTag);
    if (/\/\s*>$/.test(openTag)) {
      elements.push({ attributes, body: "" });
      continue;
    }

    const closeTagPattern = createXmlCloseTagPattern(tagName);
    closeTagPattern.lastIndex = openTagEnd;
    const closeMatch = closeTagPattern.exec(xml);
    if (!closeMatch) continue;

    elements.push({
      attributes,
      body: xml.slice(openTagEnd, closeMatch.index),
    });
    openTagPattern.lastIndex = closeTagPattern.lastIndex;
  }

  return elements;
}

function findXmlStartTags(xml: string, tagName: string): Array<{ attributes: Map<string, string> }> {
  const tags: Array<{ attributes: Map<string, string> }> = [];
  const openTagPattern = createXmlOpenTagPattern(tagName);
  let match: RegExpExecArray | null;
  while ((match = openTagPattern.exec(xml))) {
    tags.push({ attributes: parseXmlAttributes(match[0]) });
  }
  return tags;
}

function createXmlOpenTagPattern(tagName: string): RegExp {
  return new RegExp(`<(?:[\\w.-]+:)?${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
}

function createXmlCloseTagPattern(tagName: string): RegExp {
  return new RegExp(`</(?:[\\w.-]+:)?${escapeRegExp(tagName)}\\s*>`, "gi");
}

function parseXmlAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tag))) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? "";
    if (name) attributes.set(name, decodeXmlEntities(value));
  }

  return attributes;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseThreeMfTransform(transform: string | null): THREE.Matrix4 {
  if (!transform) return new THREE.Matrix4();

  const values = transform.trim().split(/\s+/).map((value) => Number.parseFloat(value));
  if (values.length === 12 && values.every(Number.isFinite)) {
    const matrix = new THREE.Matrix4();
    matrix.set(
      values[0], values[3], values[6], values[9],
      values[1], values[4], values[7], values[10],
      values[2], values[5], values[8], values[11],
      0, 0, 0, 1,
    );
    return matrix;
  }

  if (values.length === 16 && values.every(Number.isFinite)) {
    return new THREE.Matrix4().fromArray(values).transpose();
  }

  return new THREE.Matrix4();
}

function normalizeThreeMfPath(path: string): string {
  return path.replace(/^\//, "");
}

function appendTriangles(target: Triangle[], source: Triangle[]) {
  for (const triangle of source) {
    target.push(triangle);
  }
}

function trianglesFromGeometry(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  fallbackColorId: string,
  material?: THREE.Material | THREE.Material[],
): Triangle[] {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const color = geometry.getAttribute("color");
  const triangles: Triangle[] = [];

  if (!position) return triangles;

  const materialColorId = getMaterialColorId(material, fallbackColorId);

  const getVertex = (vertexIndex: number) => new THREE.Vector3(
    position.getX(vertexIndex),
    position.getY(vertexIndex),
    position.getZ(vertexIndex),
  ).applyMatrix4(matrix);

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const aIndex = index.getX(i);
      const bIndex = index.getX(i + 1);
      const cIndex = index.getX(i + 2);
      triangles.push({
        a: getVertex(aIndex),
        b: getVertex(bIndex),
        c: getVertex(cIndex),
        colorId: getTriangleColorId(color, aIndex, bIndex, cIndex, materialColorId),
      });
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      triangles.push({
        a: getVertex(i),
        b: getVertex(i + 1),
        c: getVertex(i + 2),
        colorId: getTriangleColorId(color, i, i + 1, i + 2, materialColorId),
      });
    }
  }

  return triangles;
}

function normalizeTriangles(triangles: Triangle[], settings: ModelSliceSettings): Triangle[] {
  const bounds = getBounds(triangles);
  const scale = getScale(triangles, settings);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  const targetWidth = settings.width * settings.beadPitchMm;
  const targetHeight = settings.height * settings.beadPitchMm;

  const normalize = (point: THREE.Vector3) => new THREE.Vector3(
    (point.x - centerX) * scale + targetWidth / 2,
    (point.y - centerY) * scale + targetHeight / 2,
    (point.z - bounds.min.z) * scale,
  );

  return triangles.map((triangle) => ({
    a: normalize(triangle.a),
    b: normalize(triangle.b),
    c: normalize(triangle.c),
    colorId: triangle.colorId,
  }));
}

function getScale(triangles: Triangle[], settings: ModelSliceSettings): number {
  const bounds = getBounds(triangles);
  const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
  const scaleX = size.x > EPSILON ? (settings.width * settings.beadPitchMm) / size.x : Number.POSITIVE_INFINITY;
  const scaleY = size.y > EPSILON ? (settings.height * settings.beadPitchMm) / size.y : Number.POSITIVE_INFINITY;
  const baseScale = Math.min(scaleX, scaleY);
  const defaultLayerSpan = size.z > EPSILON ? (size.z * baseScale) / settings.beadHeightMm : 0;
  const scale = settings.targetLayers > 0 && defaultLayerSpan > EPSILON
    ? baseScale * (settings.targetLayers / defaultLayerSpan)
    : baseScale;
  return Number.isFinite(scale) && scale > EPSILON ? scale : 1;
}

function getBounds(triangles: Triangle[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const triangle of triangles) {
    bounds.expandByPoint(triangle.a);
    bounds.expandByPoint(triangle.b);
    bounds.expandByPoint(triangle.c);
  }
  return bounds;
}

function getLayerCount(triangles: Triangle[], settings: ModelSliceSettings): number {
  const bounds = getBounds(triangles);
  const height = Math.max(0, bounds.max.z - bounds.min.z);
  return getLayerCountForScale(height, 1, settings.beadHeightMm);
}

function getLayerCountForScale(height: number, scale: number, beadHeightMm: number): number {
  return Math.max(1, Math.ceil(((Math.max(0, height) * scale) / beadHeightMm) - EPSILON));
}

function sliceLayer(triangles: Triangle[], layerIndex: number, settings: ModelSliceSettings): Array<string | null> {
  const z = layerIndex * settings.beadHeightMm + settings.beadHeightMm / 2;
  const segments = triangles
    .map((triangle) => intersectTriangleAtZ(triangle, z))
    .filter((segment): segment is SliceSegment => Boolean(segment));
  const cells = new Array<string | null>(settings.width * settings.height).fill(null);

  for (let row = 0; row < settings.height; row += 1) {
    const y = row * settings.beadPitchMm + settings.beadPitchMm / 2;
    const intersections: RowIntersection[] = [];

    for (const { start, end, colorId } of segments) {
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      if (Math.abs(start.y - end.y) < EPSILON || y < minY || y >= maxY) continue;

      const t = (y - start.y) / (end.y - start.y);
      intersections.push({ x: start.x + t * (end.x - start.x), colorId });
    }

    intersections.sort((a, b) => a.x - b.x);

    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const first = intersections[i];
      const second = intersections[i + 1];
      if (!first || !second) continue;

      const left = first.x <= second.x ? first : second;
      const right = first.x <= second.x ? second : first;

      for (let column = 0; column < settings.width; column += 1) {
        const x = column * settings.beadPitchMm + settings.beadPitchMm / 2;
        if (x >= left.x && x <= right.x) {
          cells[row * settings.width + column] = getCellColorId(x, left, right);
        }
      }
    }
  }

  return cells;
}

function intersectTriangleAtZ(triangle: Triangle, z: number): SliceSegment | null {
  const points = [triangle.a, triangle.b, triangle.c];
  const intersections: THREE.Vector2[] = [];

  for (let i = 0; i < 3; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % 3];
    if (!start || !end) continue;
    if ((z < Math.min(start.z, end.z)) || (z > Math.max(start.z, end.z))) continue;
    if (Math.abs(start.z - end.z) < EPSILON) continue;

    const t = (z - start.z) / (end.z - start.z);
    const point = new THREE.Vector2(
      start.x + t * (end.x - start.x),
      start.y + t * (end.y - start.y),
    );

    if (!intersections.some((existing) => existing.distanceToSquared(point) < EPSILON)) {
      intersections.push(point);
    }
  }

  if (intersections.length < 2) return null;
  const first = intersections[0];
  const second = intersections[1];
  return first && second ? { start: first, end: second, colorId: triangle.colorId } : null;
}

function getCellColorId(x: number, left: RowIntersection, right: RowIntersection): string {
  if (left.colorId === right.colorId) return left.colorId;
  return Math.abs(x - left.x) <= Math.abs(right.x - x) ? left.colorId : right.colorId;
}

function getMaterialColorId(material: THREE.Material | THREE.Material[] | undefined, fallbackColorId: string): string {
  const firstMaterial = Array.isArray(material) ? material[0] : material;
  if (!firstMaterial || !("color" in firstMaterial)) return fallbackColorId;

  const color = firstMaterial.color;
  if (!(color instanceof THREE.Color)) return fallbackColorId;

  return nearestBambuColorId(threeColorToRgb(color));
}

function getTriangleColorId(
  color: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  aIndex: number,
  bIndex: number,
  cIndex: number,
  fallbackColorId: string,
): string {
  if (!color) return fallbackColorId;

  const rgb = {
    r: ((color.getX(aIndex) + color.getX(bIndex) + color.getX(cIndex)) / 3),
    g: ((color.getY(aIndex) + color.getY(bIndex) + color.getY(cIndex)) / 3),
    b: ((color.getZ(aIndex) + color.getZ(bIndex) + color.getZ(cIndex)) / 3),
  };

  return nearestBambuColorId(threeLinearRgbToRgb(rgb));
}

function getColorCacheKey(rgb: Rgb): string {
  return `${rgb.r},${rgb.g},${rgb.b}`;
}

function nearestBambuColorId(rgb: Rgb): string {
  const key = getColorCacheKey(rgb);
  const cached = colorCache.get(key);
  if (cached) return cached;

  const color = findNearestColor(rgb, bambuPlaBasicColors);
  colorCache.set(key, color.id);
  return color.id;
}

function threeColorToRgb(color: THREE.Color): Rgb {
  return threeLinearRgbToRgb({ r: color.r, g: color.g, b: color.b });
}

function threeLinearRgbToRgb(rgb: { r: number; g: number; b: number }): Rgb {
  const color = new THREE.Color(rgb.r, rgb.g, rgb.b).convertLinearToSRGB();
  return {
    r: Math.round(clampUnit(color.r) * 255),
    g: Math.round(clampUnit(color.g) * 255),
    b: Math.round(clampUnit(color.b) * 255),
  };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > EPSILON ? value : fallback;
}
