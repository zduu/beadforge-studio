import * as THREE from "three";
import { EPSILON, type ModelSliceSettings, type Triangle } from "./types";
import { normalizeModelOrientation } from "./settings";

export function orientTriangles(triangles: Triangle[], orientation: ModelSliceSettings["orientation"]): Triangle[] {
  const normalizedOrientation = normalizeModelOrientation(orientation);
  if (
    normalizedOrientation.rotateXDeg === 0 &&
    normalizedOrientation.rotateYDeg === 0 &&
    normalizedOrientation.rotateZDeg === 0
  ) {
    return triangles;
  }

  const bounds = getBounds(triangles);
  const center = bounds.getCenter(new THREE.Vector3());
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(normalizedOrientation.rotateXDeg),
      THREE.MathUtils.degToRad(normalizedOrientation.rotateYDeg),
      THREE.MathUtils.degToRad(normalizedOrientation.rotateZDeg),
      "XYZ",
    ),
  );
  const orientPoint = (point: THREE.Vector3) => point.clone().sub(center).applyMatrix4(matrix);

  return triangles.map((triangle) => ({
    a: orientPoint(triangle.a),
    b: orientPoint(triangle.b),
    c: orientPoint(triangle.c),
    colorId: triangle.colorId,
  }));
}

export function normalizeTriangles(triangles: Triangle[], settings: ModelSliceSettings): Triangle[] {
  const bounds = getBounds(triangles);
  const scale = getScale(triangles, settings);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  const targetWidth = settings.width * settings.beadPitchMm;
  const targetHeight = settings.height * settings.beadPitchMm;

  const normalize = (point: THREE.Vector3) =>
    new THREE.Vector3(
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

export function getScale(triangles: Triangle[], settings: ModelSliceSettings): number {
  return getScaleDetails(triangles, settings).scale;
}

export function getScaleDetails(triangles: Triangle[], settings: ModelSliceSettings) {
  const bounds = getBounds(triangles);
  const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
  const scaleX = size.x > EPSILON ? (settings.width * settings.beadPitchMm) / size.x : Number.POSITIVE_INFINITY;
  const scaleY = size.y > EPSILON ? (settings.height * settings.beadPitchMm) / size.y : Number.POSITIVE_INFINITY;
  const baseScale = Math.min(scaleX, scaleY);
  const normalizedBaseScale = Number.isFinite(baseScale) && baseScale > EPSILON ? baseScale : 1;
  const naturalLayerCount = getLayerCountForScale(size.z, normalizedBaseScale, settings.beadHeightMm);
  const defaultLayerSpan = size.z > EPSILON ? (size.z * normalizedBaseScale) / settings.beadHeightMm : 0;
  const scale =
    settings.targetLayers > 0 && defaultLayerSpan > EPSILON
      ? normalizedBaseScale * (settings.targetLayers / defaultLayerSpan)
      : normalizedBaseScale;
  const normalizedScale = Number.isFinite(scale) && scale > EPSILON ? scale : 1;
  return {
    scale: normalizedScale,
    naturalLayerCount,
    scaledSize: size.clone().multiplyScalar(normalizedScale),
  };
}

export function getBounds(triangles: Triangle[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const triangle of triangles) {
    bounds.expandByPoint(triangle.a);
    bounds.expandByPoint(triangle.b);
    bounds.expandByPoint(triangle.c);
  }
  return bounds;
}

export function getLayerCountForScale(height: number, scale: number, beadHeightMm: number): number {
  return Math.max(1, Math.ceil((Math.max(0, height) * scale) / beadHeightMm - EPSILON));
}
