import * as THREE from "three";
import type { ModelBoundsSummary, ModelPreviewData } from "../../types";
import type { Triangle } from "./types";

export function serializeTriangle(triangle: Triangle) {
  return {
    a: serializeVector(triangle.a),
    b: serializeVector(triangle.b),
    c: serializeVector(triangle.c),
    colorId: triangle.colorId,
  };
}

export function serializeBounds(bounds: THREE.Box3): ModelPreviewData["bounds"] {
  return {
    min: serializeVector(bounds.min),
    max: serializeVector(bounds.max),
  };
}

export function serializeBoundsSummary(bounds: THREE.Box3): ModelBoundsSummary {
  return {
    min: serializeVector(bounds.min),
    max: serializeVector(bounds.max),
    size: serializeVector(bounds.getSize(new THREE.Vector3())),
  };
}

export function serializeVector(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}
