import * as THREE from "three";
import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { bambuPlaBasicColors } from "../../data/bambuPlaBasic";
import { getBambuPaintColorId, getBambuPartColorId, getBambuProjectColorData, mergePalettes } from "./bambuColors";
import { appendTriangles, trianglesFromGeometry } from "./stlParser";
import { normalizeThreeMfPath, parseThreeMfModel } from "./threeMfParser";
import type {
  BambuProjectColorData,
  ModelProcessingOptions,
  ParsedModel,
  ThreeMfObject,
  ThreeMfPackage,
  Triangle,
} from "./types";

export function trianglesFrom3mf(
  buffer: ArrayBuffer,
  fallbackColorId: string,
  options: ModelProcessingOptions = {},
): ParsedModel {
  const archiveModel = trianglesFrom3mfArchive(buffer, fallbackColorId, options);
  if (archiveModel && archiveModel.triangles.length > 0) return archiveModel;

  if (typeof DOMParser === "undefined") {
    throw new Error("当前浏览器线程无法解析此 3MF 格式，请尝试从 Bambu Studio 重新导出 3MF");
  }

  options.onProgress?.({ stage: "parsing", message: "正在解析通用 3MF 模型" });
  const group = new ThreeMFLoader().parse(buffer);
  const triangles: Triangle[] = [];
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    appendTriangles(
      triangles,
      trianglesFromGeometry(object.geometry, object.matrixWorld, fallbackColorId, object.material),
    );
  });

  return { triangles, palette: bambuPlaBasicColors };
}

export function trianglesFrom3mfArchive(
  buffer: ArrayBuffer,
  fallbackColorId: string,
  options: ModelProcessingOptions = {},
): ParsedModel | null {
  let archive: ThreeMfPackage;
  try {
    options.onProgress?.({ stage: "decompressing", message: "正在解压 3MF 包" });
    archive = unzipSync(new Uint8Array(buffer));
  } catch {
    return null;
  }

  options.onProgress?.({ stage: "parsing", message: "正在读取 Bambu 3MF 颜色与几何" });
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
    palette: projectColorData
      ? mergePalettes(bambuPlaBasicColors, projectColorData.filamentColors)
      : bambuPlaBasicColors,
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

function appendThreeMfMeshTriangles(
  target: Triangle[],
  object: ThreeMfObject,
  matrix: THREE.Matrix4,
  colorId: string,
  projectColorData: BambuProjectColorData | null,
) {
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
