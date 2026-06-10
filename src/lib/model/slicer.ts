import * as THREE from "three";
import { getBounds } from "./geometry";
import { EPSILON, type ModelSliceSettings, type RowIntersection, type SliceSegment, type Triangle } from "./types";

export function getLayerCount(triangles: Triangle[], settings: ModelSliceSettings): number {
  const bounds = getBounds(triangles);
  const height = Math.max(0, bounds.max.z - bounds.min.z);
  return Math.max(1, Math.ceil(height / settings.beadHeightMm - EPSILON));
}

export function sliceLayers(
  triangles: Triangle[],
  layerCount: number,
  settings: ModelSliceSettings,
  onLayerComplete?: (layerIndex: number) => void,
): Array<Array<string | null>> {
  const buckets = bucketTrianglesByLayer(triangles, layerCount, settings.beadHeightMm);
  const layers: Array<Array<string | null>> = [];

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    layers.push(sliceLayer(buckets[layerIndex] ?? [], layerIndex, settings));
    onLayerComplete?.(layerIndex);
  }

  return layers;
}

export function sliceLayer(
  triangles: Triangle[],
  layerIndex: number,
  settings: ModelSliceSettings,
): Array<string | null> {
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

export function intersectTriangleAtZ(triangle: Triangle, z: number): SliceSegment | null {
  const points = [triangle.a, triangle.b, triangle.c];
  const intersections: THREE.Vector2[] = [];

  for (let i = 0; i < 3; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % 3];
    if (!start || !end) continue;
    if (z < Math.min(start.z, end.z) || z > Math.max(start.z, end.z)) continue;
    if (Math.abs(start.z - end.z) < EPSILON) continue;

    const t = (z - start.z) / (end.z - start.z);
    const point = new THREE.Vector2(start.x + t * (end.x - start.x), start.y + t * (end.y - start.y));

    if (!intersections.some((existing) => existing.distanceToSquared(point) < EPSILON)) {
      intersections.push(point);
    }
  }

  if (intersections.length < 2) return null;
  const first = intersections[0];
  const second = intersections[1];
  return first && second ? { start: first, end: second, colorId: triangle.colorId } : null;
}

function bucketTrianglesByLayer(triangles: Triangle[], layerCount: number, beadHeightMm: number): Triangle[][] {
  const buckets = Array.from({ length: layerCount }, () => [] as Triangle[]);

  for (const triangle of triangles) {
    const minZ = Math.min(triangle.a.z, triangle.b.z, triangle.c.z);
    const maxZ = Math.max(triangle.a.z, triangle.b.z, triangle.c.z);
    const startLayer = Math.max(0, Math.ceil((minZ - beadHeightMm / 2 - EPSILON) / beadHeightMm));
    const endLayer = Math.min(layerCount - 1, Math.floor((maxZ - beadHeightMm / 2 + EPSILON) / beadHeightMm));
    if (endLayer < 0 || startLayer >= layerCount) continue;

    for (let layerIndex = startLayer; layerIndex <= endLayer; layerIndex += 1) {
      buckets[layerIndex]?.push(triangle);
    }
  }

  return buckets;
}

function getCellColorId(x: number, left: RowIntersection, right: RowIntersection): string {
  if (left.colorId === right.colorId) return left.colorId;
  return Math.abs(x - left.x) <= Math.abs(right.x - x) ? left.colorId : right.colorId;
}
