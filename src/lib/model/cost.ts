import type { ModelPreviewData } from "../../types";
import { getLayerCountForScale } from "./geometry";
import type { ModelSliceCostEstimate, ModelSliceSettings } from "./types";

export function createModelSliceCostEstimate(
  triangleCount: number,
  layerCount: number,
  width: number,
  height: number,
): ModelSliceCostEstimate {
  const gridCells = width * height;
  return {
    triangleCount,
    layerCount,
    gridCells,
    triangleLayerChecks: triangleCount * layerCount,
    cellLayerChecks: gridCells * layerCount,
  };
}

export function estimateModelSliceCostFromPreview(
  previewData: ModelPreviewData,
  settings: Pick<ModelSliceSettings, "width" | "height" | "beadPitchMm" | "beadHeightMm" | "targetLayers">,
): ModelSliceCostEstimate {
  const sizeX = Math.max(0, previewData.bounds.max[0] - previewData.bounds.min[0]);
  const sizeY = Math.max(0, previewData.bounds.max[1] - previewData.bounds.min[1]);
  const sizeZ = Math.max(0, previewData.bounds.max[2] - previewData.bounds.min[2]);
  const scaleX = sizeX > 0 ? (settings.width * settings.beadPitchMm) / sizeX : Number.POSITIVE_INFINITY;
  const scaleY = sizeY > 0 ? (settings.height * settings.beadPitchMm) / sizeY : Number.POSITIVE_INFINITY;
  const baseScale = Math.min(scaleX, scaleY);
  const normalizedBaseScale = Number.isFinite(baseScale) && baseScale > 0 ? baseScale : 1;
  const layerCount =
    settings.targetLayers > 0
      ? settings.targetLayers
      : getLayerCountForScale(sizeZ, normalizedBaseScale, settings.beadHeightMm);

  return createModelSliceCostEstimate(previewData.triangleCount, layerCount, settings.width, settings.height);
}
