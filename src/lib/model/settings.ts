import type { ModelOrientation, ModelSupportSettings } from "../../types";
import { EPSILON, type ModelSliceSettings } from "./types";

export function normalizeModelSliceSettings(settings: ModelSliceSettings): ModelSliceSettings {
  return {
    ...settings,
    width: Math.max(1, Math.round(settings.width)),
    height: Math.max(1, Math.round(settings.height)),
    beadPitchMm: clampPositive(settings.beadPitchMm, 2.6),
    beadHeightMm: clampPositive(settings.beadHeightMm, 3),
    targetLayers: Math.max(0, Math.round(settings.targetLayers)),
    orientation: normalizeModelOrientation(settings.orientation),
    support: normalizeModelSupportSettings(settings.support),
  };
}

export function normalizeModelSupportSettings(settings: ModelSupportSettings | undefined): ModelSupportSettings {
  return {
    enabled: Boolean(settings?.enabled),
    colorId:
      typeof settings?.colorId === "string" && settings.colorId ? settings.colorId : "bambu-pla-basic-jade-white",
  };
}

export function normalizeModelOrientation(orientation: ModelOrientation | undefined): ModelOrientation {
  return {
    rotateXDeg: normalizeRotationDegrees(orientation?.rotateXDeg ?? 0),
    rotateYDeg: normalizeRotationDegrees(orientation?.rotateYDeg ?? 0),
    rotateZDeg: normalizeRotationDegrees(orientation?.rotateZDeg ?? 0),
  };
}

export function normalizeRotationDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > EPSILON ? value : fallback;
}
