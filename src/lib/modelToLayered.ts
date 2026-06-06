import * as THREE from "three";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import type { LayeredPattern } from "../types";

type Triangle = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
};

type ModelSliceSettings = {
  width: number;
  height: number;
  beadPitchMm: number;
  beadHeightMm: number;
  maxLayers: number;
  colorId: string;
};

const EPSILON = 1e-6;

export async function modelFileToLayeredPattern(file: File, settings: ModelSliceSettings): Promise<LayeredPattern> {
  const fileType = getModelFileType(file.name);
  const buffer = await file.arrayBuffer();
  const rawTriangles = fileType === "stl"
    ? trianglesFromStl(buffer)
    : trianglesFrom3mf(buffer);

  if (rawTriangles.length === 0) {
    throw new Error("模型中没有可切片的三角面");
  }

  const triangles = normalizeTriangles(rawTriangles, settings);
  const layerCount = getLayerCount(triangles, settings);
  const layers = [];

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const cells = sliceLayer(triangles, layerIndex, settings);
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
    width: settings.width,
    height: settings.height,
    sourceModel: {
      fileName: file.name,
      fileType,
      scale: getScale(rawTriangles, settings),
      layerHeightMm: settings.beadHeightMm,
      beadPitchMm: settings.beadPitchMm,
      beadHeightMm: settings.beadHeightMm,
    },
    layers,
    palette: bambuPlaBasicColors,
  };
}

function getModelFileType(fileName: string): "stl" | "3mf" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".stl")) return "stl";
  if (lower.endsWith(".3mf")) return "3mf";
  throw new Error("目前仅支持 STL 和 3MF 文件");
}

function trianglesFromStl(buffer: ArrayBuffer): Triangle[] {
  const geometry = new STLLoader().parse(buffer);
  return trianglesFromGeometry(geometry, new THREE.Matrix4());
}

function trianglesFrom3mf(buffer: ArrayBuffer): Triangle[] {
  const group = new ThreeMFLoader().parse(buffer);
  const triangles: Triangle[] = [];

  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    triangles.push(...trianglesFromGeometry(object.geometry, object.matrixWorld));
  });

  return triangles;
}

function trianglesFromGeometry(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): Triangle[] {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangles: Triangle[] = [];

  if (!position) return triangles;

  const getVertex = (vertexIndex: number) => new THREE.Vector3(
    position.getX(vertexIndex),
    position.getY(vertexIndex),
    position.getZ(vertexIndex),
  ).applyMatrix4(matrix);

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      triangles.push({
        a: getVertex(index.getX(i)),
        b: getVertex(index.getX(i + 1)),
        c: getVertex(index.getX(i + 2)),
      });
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      triangles.push({ a: getVertex(i), b: getVertex(i + 1), c: getVertex(i + 2) });
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
  }));
}

function getScale(triangles: Triangle[], settings: ModelSliceSettings): number {
  const bounds = getBounds(triangles);
  const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
  const scaleX = size.x > EPSILON ? (settings.width * settings.beadPitchMm) / size.x : Number.POSITIVE_INFINITY;
  const scaleY = size.y > EPSILON ? (settings.height * settings.beadPitchMm) / size.y : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
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
  return Math.max(1, Math.min(settings.maxLayers, Math.ceil(height / settings.beadHeightMm)));
}

function sliceLayer(triangles: Triangle[], layerIndex: number, settings: ModelSliceSettings): Array<string | null> {
  const z = layerIndex * settings.beadHeightMm + settings.beadHeightMm / 2;
  const segments = triangles
    .map((triangle) => intersectTriangleAtZ(triangle, z))
    .filter((segment): segment is [THREE.Vector2, THREE.Vector2] => Boolean(segment));
  const cells = new Array<string | null>(settings.width * settings.height).fill(null);

  for (let row = 0; row < settings.height; row += 1) {
    const y = row * settings.beadPitchMm + settings.beadPitchMm / 2;
    const intersections: number[] = [];

    for (const [start, end] of segments) {
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      if (Math.abs(start.y - end.y) < EPSILON || y < minY || y >= maxY) continue;

      const t = (y - start.y) / (end.y - start.y);
      intersections.push(start.x + t * (end.x - start.x));
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.min(intersections[i], intersections[i + 1]);
      const right = Math.max(intersections[i], intersections[i + 1]);

      for (let column = 0; column < settings.width; column += 1) {
        const x = column * settings.beadPitchMm + settings.beadPitchMm / 2;
        if (x >= left && x <= right) {
          cells[row * settings.width + column] = settings.colorId;
        }
      }
    }
  }

  return cells;
}

function intersectTriangleAtZ(triangle: Triangle, z: number): [THREE.Vector2, THREE.Vector2] | null {
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
  return first && second ? [first, second] : null;
}
