import { getModelFileType } from "./fileType";
import { getBounds, getScaleDetails, normalizeTriangles, orientTriangles } from "./geometry";
import { serializeBounds, serializeBoundsSummary, serializeTriangle } from "./serialize";
import { normalizeModelSliceSettings } from "./settings";
import { getLayerCount, sliceLayers } from "./slicer";
import { applyModelSupports } from "./support";
import { trianglesFromStl } from "./stlParser";
import { trianglesFrom3mf } from "./threeMfArchive";
import { createModelSliceCostEstimate, estimateModelSliceCostFromPreview } from "./cost";
import type { LayeredPattern, ModelPreviewData } from "../../types";
import type { ModelPreviewSettings, ModelProcessingOptions, ModelSliceSettings, ParsedModel } from "./types";

export { estimateModelSliceCostFromPreview };
export { getModelFileType } from "./fileType";
export { getBounds, getScaleDetails, normalizeTriangles, orientTriangles } from "./geometry";
export { intersectTriangleAtZ, getLayerCount, sliceLayer, sliceLayers } from "./slicer";
export { applyModelSupports } from "./support";
export { trianglesFrom3mfArchive } from "./threeMfArchive";
export { parseThreeMfModel } from "./threeMfParser";
export { trianglesFromStl } from "./stlParser";
export type { ModelProcessingProgress, ModelSliceCostEstimate, ModelSliceSettings, Triangle } from "./types";

export async function modelFileToPreviewData(
  file: File,
  settings: ModelPreviewSettings,
  options: ModelProcessingOptions = {},
): Promise<ModelPreviewData> {
  options.onProgress?.({ stage: "reading", message: "正在读取模型文件" });
  const { fileType, parsedModel } = await parseModelFile(file, settings.colorId, options);
  if (parsedModel.triangles.length === 0) {
    throw new Error("模型中没有可预览的三角面");
  }

  options.onProgress?.({
    stage: "preview",
    message: "正在生成模型预览数据",
    triangleCount: parsedModel.triangles.length,
  });
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

export async function modelFileToLayeredPattern(
  file: File,
  settings: ModelSliceSettings,
  options: ModelProcessingOptions = {},
): Promise<LayeredPattern> {
  const sliceSettings = normalizeModelSliceSettings(settings);
  options.onProgress?.({ stage: "reading", message: "正在读取模型文件" });
  const { fileType, parsedModel } = await parseModelFile(file, sliceSettings.colorId, options);
  const rawTriangles = orientTriangles(parsedModel.triangles, sliceSettings.orientation);

  if (rawTriangles.length === 0) {
    throw new Error("模型中没有可切片的三角面");
  }

  options.onProgress?.({
    stage: "normalizing",
    message: "正在归一化模型尺寸与方向",
    triangleCount: rawTriangles.length,
  });
  const originalBounds = getBounds(parsedModel.triangles);
  const orientedBounds = getBounds(rawTriangles);
  const scaleDetails = getScaleDetails(rawTriangles, sliceSettings);
  const triangles = normalizeTriangles(rawTriangles, sliceSettings);
  const layerCount = getLayerCount(triangles, sliceSettings);
  const cost = createModelSliceCostEstimate(triangles.length, layerCount, sliceSettings.width, sliceSettings.height);
  const occupiedCellsByLayer = [];

  options.onProgress?.({
    stage: "slicing",
    message: "正在逐层切片模型",
    current: 0,
    total: layerCount,
    triangleCount: triangles.length,
    layerCount,
    cost,
  });
  const layerCells = sliceLayers(triangles, layerCount, sliceSettings, (layerIndex) => {
    options.onProgress?.({
      stage: "slicing",
      message: `正在切片第 ${layerIndex + 1} / ${layerCount} 层`,
      current: layerIndex + 1,
      total: layerCount,
      triangleCount: triangles.length,
      layerCount,
      cost,
    });
  });

  options.onProgress?.({ stage: "supports", message: "正在生成模型支撑", current: layerCount, total: layerCount });
  const supportResult = applyModelSupports(layerCells, sliceSettings);
  const layers = [];

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const cells = layerCells[layerIndex];
    if (!cells) continue;
    const occupiedCells = cells.filter(Boolean).length;
    occupiedCellsByLayer.push({ index: layerIndex, occupiedCells });
    if (occupiedCells > 0) {
      const supportCells = supportResult.supportCells[layerIndex];
      layers.push({
        index: layerIndex,
        name: `Layer ${layerIndex + 1}`,
        cells,
        supportCells: supportCells?.some(Boolean) ? supportCells : undefined,
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
      scale: scaleDetails.scale,
      layerHeightMm: sliceSettings.beadHeightMm,
      beadPitchMm: sliceSettings.beadPitchMm,
      beadHeightMm: sliceSettings.beadHeightMm,
      targetLayers: sliceSettings.targetLayers,
      orientation: sliceSettings.orientation,
    },
    layers,
    palette: parsedModel.palette,
    support: supportResult.summary,
    diagnostics: {
      originalBounds: serializeBoundsSummary(originalBounds),
      orientedBounds: serializeBoundsSummary(orientedBounds),
      scaledSizeMm: [scaleDetails.scaledSize.x, scaleDetails.scaledSize.y, scaleDetails.scaledSize.z],
      scale: scaleDetails.scale,
      naturalLayerCount: scaleDetails.naturalLayerCount,
      targetLayerCount: sliceSettings.targetLayers,
      generatedLayerCount: layerCount,
      nonEmptyLayerCount: layers.length,
      emptyLayerCount: Math.max(0, layerCount - layers.length),
      occupiedCellsByLayer,
    },
  };
}

async function parseModelFile(file: File, fallbackColorId: string, options: ModelProcessingOptions) {
  const fileType = getModelFileType(file.name);
  const buffer = await file.arrayBuffer();
  options.onProgress?.({ stage: "parsing", message: "正在解析模型几何" });
  const parsedModel: ParsedModel =
    fileType === "stl" ? trianglesFromStl(buffer, fallbackColorId) : trianglesFrom3mf(buffer, fallbackColorId, options);
  return { fileType, parsedModel };
}
