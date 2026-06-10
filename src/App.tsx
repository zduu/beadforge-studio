import { ChangeEvent, KeyboardEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, ImagePlus, Palette } from "lucide-react";
import { ColorsPanel } from "./components/ColorsPanel";
import { ControlsPanel } from "./components/ControlsPanel";
import { ExportBar, type PreviewMode } from "./components/ExportBar";
import { ModelPanel } from "./components/ModelPanel";
import { PatternPreview } from "./components/PatternPreview";
import { bambuPlaBasicColors } from "./data/bambuPlaBasic";
import { useImagePatternWorker } from "./hooks/useImagePatternWorker";
import { MODEL_JOB_CANCELLED, useModelSlicer } from "./hooks/useModelSlicer";
import { downloadLayeredProductionZip } from "./lib/export";
import {
  applyPatternBackground,
  clampNumber,
  cloneLayeredPattern,
  clonePattern,
  cloneSettings,
  formatModelNumber,
  getLayeredColorUsage,
  getModelSliceSettingsFromDrafts,
  getUndoStepLimit,
  normalizeModelSliceSettings,
  normalizePatternSettings as normalizeSettings,
  normalizeRotationDegrees,
  parseDraftNumber,
  rotateLayeredPatternClockwise,
  rotatePatternClockwise,
  setPatternSupportFlag,
  syncLayeredPatternFromPattern,
} from "./lib/editorState";
import { layeredPatternToPattern, validateLayeredPattern } from "./lib/layeredPattern";
import { estimateModelSliceCostFromPreview } from "./lib/model";
import type { ModelProcessingProgress, ModelSliceCostEstimate } from "./lib/model";
import {
  cropPatternToRect,
  getAllPatternColors,
  getColorUsage,
  isPatternBackgroundCell,
  replacePatternColor,
  setPatternCell,
  validatePattern,
} from "./lib/pattern";
import type { CropRect, LayeredPattern, ModelSupportSettings, Pattern, PatternSettings } from "./types";
import type { ModelOrientation, ModelPreviewData } from "./types";

const DEFAULT_SETTINGS: PatternSettings = {
  width: 32,
  height: 32,
  fitMode: "contain",
  sampleMode: "average",
  maxColors: 0,
  detailBoost: 55,
  sourceCrop: null,
  mirrorX: false,
};

const DEFAULT_MODEL_SLICE_SETTINGS = {
  beadPitchMm: 2.6,
  beadHeightMm: 3,
  targetLayers: 0,
};

type ModelSupportUiSettings = ModelSupportSettings & {
  showSupports: boolean;
};

const DEFAULT_MODEL_SUPPORT_SETTINGS: ModelSupportUiSettings = {
  enabled: true,
  showSupports: true,
  colorId: "bambu-pla-basic-jade-white",
};

const DEFAULT_MODEL_ORIENTATION: ModelOrientation = {
  rotateXDeg: 0,
  rotateYDeg: 0,
  rotateZDeg: 0,
};

const SIZE_PRESETS = [32, 48, 64, 80];
const LayeredModelPreview = lazy(() =>
  import("./components/LayeredModelPreview").then((module) => ({ default: module.LayeredModelPreview })),
);
const ModelFilePreview = lazy(() =>
  import("./components/ModelFilePreview").then((module) => ({ default: module.ModelFilePreview })),
);

type EditTool = "brush" | "eraser" | "inspect";
type CropMode = "source" | "preview";

type InspectInfo = {
  x: number;
  y: number;
  colorName: string;
  colorCode: string;
};

type UndoSnapshot = {
  pattern: Pattern;
  settings: PatternSettings;
  backgroundColorId: string | null;
  layeredPattern: LayeredPattern | null;
};

const DEFAULT_BACKGROUND_COLOR_ID = "bambu-pla-basic-jade-white";

function App() {
  const [settings, setSettings] = useState<PatternSettings>(DEFAULT_SETTINGS);
  const [settingDrafts, setSettingDrafts] = useState({
    width: String(DEFAULT_SETTINGS.width),
    height: String(DEFAULT_SETTINGS.height),
    maxColors: String(DEFAULT_SETTINGS.maxColors),
  });
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [layeredPattern, setLayeredPattern] = useState<LayeredPattern | null>(null);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("layer");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewZoomDraft, setPreviewZoomDraft] = useState("100");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState<CropMode>("source");
  const [previewCropRect, setPreviewCropRect] = useState<CropRect | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [paintColorId, setPaintColorId] = useState<string>(bambuPlaBasicColors[0].id);
  const [editTool, setEditTool] = useState<EditTool>("inspect");
  const [backgroundColorId, setBackgroundColorId] = useState<string | null>(DEFAULT_BACKGROUND_COLOR_ID);
  const [inspectInfo, setInspectInfo] = useState<InspectInfo | null>(null);
  const [modelColorId, setModelColorId] = useState<string>(bambuPlaBasicColors[1].id);
  const [modelSliceSettings, setModelSliceSettings] = useState(DEFAULT_MODEL_SLICE_SETTINGS);
  const [modelSupportSettings, setModelSupportSettings] = useState(DEFAULT_MODEL_SUPPORT_SETTINGS);
  const [modelSliceDrafts, setModelSliceDrafts] = useState({
    beadPitchMm: String(DEFAULT_MODEL_SLICE_SETTINGS.beadPitchMm),
    beadHeightMm: String(DEFAULT_MODEL_SLICE_SETTINGS.beadHeightMm),
    targetLayers: "",
  });
  const [modelSourceFile, setModelSourceFile] = useState<File | null>(null);
  const [modelPreviewData, setModelPreviewData] = useState<ModelPreviewData | null>(null);
  const [modelOrientation, setModelOrientation] = useState<ModelOrientation>(DEFAULT_MODEL_ORIENTATION);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExportingProductionPack, setIsExportingProductionPack] = useState(false);
  const [status, setStatus] = useState("等待图片");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const runImageWorkerJob = useImagePatternWorker();
  const { cancelModelJob, isModelProcessing, runModelWorkerJob, setIsModelProcessing } = useModelSlicer({
    onCancel: () => setStatus("本机处理已取消"),
    onProgress: (progress) => setStatus(formatModelWorkerProgress(progress)),
  });

  const usage = useMemo(() => {
    if (layeredPattern && previewMode === "model") {
      return getLayeredColorUsage(layeredPattern, modelSupportSettings.showSupports);
    }
    return pattern ? getColorUsage(pattern) : [];
  }, [layeredPattern, modelSupportSettings.showSupports, pattern, previewMode]);
  const allPatternColors = useMemo(() => (pattern ? getAllPatternColors(pattern) : []), [pattern]);
  const totalBeads = useMemo(() => usage.reduce((sum, item) => sum + item.count, 0), [usage]);

  useEffect(() => {
    setSettingDrafts({
      width: String(settings.width),
      height: String(settings.height),
      maxColors: String(settings.maxColors),
    });
  }, [settings.width, settings.height, settings.maxColors]);

  useEffect(() => {
    setPreviewZoomDraft(String(Math.round(previewZoom * 100)));
  }, [previewZoom]);

  useEffect(() => {
    setModelSliceDrafts({
      beadPitchMm: formatModelNumber(modelSliceSettings.beadPitchMm),
      beadHeightMm: formatModelNumber(modelSliceSettings.beadHeightMm),
      targetLayers: modelSliceSettings.targetLayers > 0 ? String(modelSliceSettings.targetLayers) : "",
    });
  }, [modelSliceSettings.beadPitchMm, modelSliceSettings.beadHeightMm, modelSliceSettings.targetLayers]);

  useEffect(() => {
    if (!sourceFile) {
      setSourceImageUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(sourceFile);
    setSourceImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [sourceFile]);

  const generatePattern = async (file = sourceFile, nextSettings = settings) => {
    if (!file) {
      setStatus("请选择图片");
      return;
    }

    const normalizedSettings = normalizeSettings(nextSettings);
    setIsProcessing(true);
    setStatus("正在生成图纸");
    try {
      const nextPattern = await runImageWorkerJob(file, normalizedSettings);
      setPattern(applyPatternBackground(nextPattern, backgroundColorId));
      setUndoStack([]);
      setSettings(normalizedSettings);
      setLayeredPattern(null);
      setModelSourceFile(null);
      setModelPreviewData(null);
      setModelOrientation(DEFAULT_MODEL_ORIENTATION);
      setActiveLayerIndex(0);
      setPreviewMode("layer");
      setPreviewCropRect(null);
      setSelectedColorId(null);
      setStatus(`已生成 ${nextPattern.width}x${nextPattern.height} 图纸`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "生成失败");
    } finally {
      setIsProcessing(false);
    }
  };

  const updateSettings = (partial: Partial<PatternSettings>, regenerate = true) => {
    const nextSettings = normalizeSettings({ ...settings, ...partial });
    setSettings(nextSettings);
    if (sourceFile && regenerate) {
      void generatePattern(sourceFile, nextSettings);
    }
  };

  const commitDraftSettings = () => {
    updateSettings({
      width: parseDraftNumber(settingDrafts.width, settings.width),
      height: parseDraftNumber(settingDrafts.height, settings.height),
      maxColors: parseDraftNumber(settingDrafts.maxColors, settings.maxColors),
    });
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const commitPreviewZoomDraft = () => {
    const parsed = Number.parseFloat(previewZoomDraft);
    if (Number.isNaN(parsed)) {
      setPreviewZoomDraft(String(Math.round(previewZoom * 100)));
      return;
    }
    setPreviewZoom(clampNumber(parsed, 10, 800) / 100);
  };

  const commitModelSliceDrafts = () => {
    setModelSliceSettings(getModelSliceSettingsFromDrafts(modelSliceDrafts));
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const nextSettings = normalizeSettings({ ...settings, sourceCrop: null });
    setSourceFile(file);
    setPreviewCropRect(null);
    void generatePattern(file, nextSettings);
    event.target.value = "";
  };

  const handleProjectChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const json = JSON.parse(await file.text()) as unknown;
      const imported = validatePattern(json);
      if (imported) {
        const normalizedImported = {
          ...imported,
          backgroundCells:
            imported.backgroundCells?.length === imported.cells.length ? imported.backgroundCells : undefined,
          settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...imported.settings }),
        };
        setPattern(normalizedImported);
        setUndoStack([]);
        setBackgroundColorId(normalizedImported.backgroundColorId ?? backgroundColorId);
        setLayeredPattern(null);
        setModelSourceFile(null);
        setModelPreviewData(null);
        setModelOrientation(DEFAULT_MODEL_ORIENTATION);
        setActiveLayerIndex(0);
        setPreviewMode("layer");
        setSettings(normalizedImported.settings);
        setSourceFile(null);
        setPreviewCropRect(null);
        setSelectedColorId(null);
        setStatus(`已导入 ${normalizedImported.width}x${normalizedImported.height} 项目`);
        return;
      }

      const importedLayeredPattern = validateLayeredPattern(json);
      if (importedLayeredPattern) {
        const nextShowSupports = importedLayeredPattern.support?.enabled ?? DEFAULT_MODEL_SUPPORT_SETTINGS.showSupports;
        const nextSettings = normalizeSettings({
          ...DEFAULT_SETTINGS,
          width: importedLayeredPattern.width,
          height: importedLayeredPattern.height,
          maxColors: importedLayeredPattern.palette.length,
        });
        const nextModelSliceSettings = normalizeModelSliceSettings({
          beadPitchMm: importedLayeredPattern.sourceModel?.beadPitchMm ?? DEFAULT_MODEL_SLICE_SETTINGS.beadPitchMm,
          beadHeightMm:
            importedLayeredPattern.sourceModel?.beadHeightMm ??
            importedLayeredPattern.sourceModel?.layerHeightMm ??
            DEFAULT_MODEL_SLICE_SETTINGS.beadHeightMm,
          targetLayers: importedLayeredPattern.sourceModel?.targetLayers ?? DEFAULT_MODEL_SLICE_SETTINGS.targetLayers,
        });

        setLayeredPattern(importedLayeredPattern);
        setPattern(
          applyPatternBackground(
            layeredPatternToPattern(importedLayeredPattern, 0, { includeSupports: nextShowSupports }),
            null,
          ),
        );
        setUndoStack([]);
        setBackgroundColorId(null);
        setModelSourceFile(null);
        setModelPreviewData(null);
        setModelOrientation(importedLayeredPattern.sourceModel?.orientation ?? DEFAULT_MODEL_ORIENTATION);
        setModelSliceSettings(nextModelSliceSettings);
        setModelSupportSettings({
          enabled: importedLayeredPattern.support?.enabled ?? DEFAULT_MODEL_SUPPORT_SETTINGS.enabled,
          showSupports: nextShowSupports,
          colorId: importedLayeredPattern.support?.colorId ?? DEFAULT_MODEL_SUPPORT_SETTINGS.colorId,
        });
        setActiveLayerIndex(0);
        setPreviewMode("layer");
        setSettings(nextSettings);
        setSourceFile(null);
        setPreviewCropRect(null);
        setSelectedColorId(null);
        setStatus(
          `已导入 ${importedLayeredPattern.width}x${importedLayeredPattern.height} · ${importedLayeredPattern.layers.length} 层项目`,
        );
        return;
      }

      setStatus("项目文件无效");
    } catch {
      setStatus("无法读取项目文件");
    } finally {
      event.target.value = "";
    }
  };

  const handleReplaceColor = (toId: string) => {
    if (!pattern || !selectedColorId || selectedColorId === toId) return;
    pushUndoSnapshot();
    const nextPattern = replacePatternColor(pattern, selectedColorId, toId);
    setPattern(nextPattern);
    if (layeredPattern && previewMode === "layer") {
      setLayeredPattern(
        syncLayeredPatternFromPattern(layeredPattern, activeLayerIndex, nextPattern, modelSupportSettings.showSupports),
      );
    }
    setSelectedColorId(toId);
    setStatus("颜色已替换");
  };

  const pushUndoSnapshot = () => {
    if (!pattern) return;
    const snapshot = {
      pattern: clonePattern(pattern),
      settings: cloneSettings(settings),
      backgroundColorId,
      layeredPattern: layeredPattern ? cloneLayeredPattern(layeredPattern) : null,
    };
    const undoStepLimit = getUndoStepLimit(pattern);
    setUndoStack((stack) => [...stack.slice(-(undoStepLimit - 1)), snapshot]);
  };

  const handleUndo = () => {
    setUndoStack((stack) => {
      const snapshot = stack.at(-1);
      if (!snapshot) return stack;
      setPattern(clonePattern(snapshot.pattern));
      setSettings(cloneSettings(snapshot.settings));
      setBackgroundColorId(snapshot.backgroundColorId);
      setLayeredPattern(snapshot.layeredPattern ? cloneLayeredPattern(snapshot.layeredPattern) : null);
      setPreviewCropRect(null);
      setStatus("已回退");
      return stack.slice(0, -1);
    });
  };

  const handleApplySourceCrop = () => {
    if (!sourceFile) {
      setStatus("请先上传图片");
      return;
    }
    if (!settings.sourceCrop) {
      setStatus("请先在原图上拖拽裁剪框");
      return;
    }
    void generatePattern(sourceFile, settings);
  };

  const handleClearSourceCrop = () => {
    const nextSettings = normalizeSettings({ ...settings, sourceCrop: null });
    setSettings(nextSettings);
    if (sourceFile) {
      void generatePattern(sourceFile, nextSettings);
    } else {
      setStatus("原图裁剪已清除");
    }
  };

  const handleApplyPreviewCrop = () => {
    if (!pattern) {
      setStatus("请先生成图纸");
      return;
    }
    if (!previewCropRect) {
      setStatus("请先在预览图上拖拽裁剪框");
      return;
    }

    pushUndoSnapshot();
    const croppedPattern = cropPatternToRect(pattern, previewCropRect);
    const nextPattern = applyPatternBackground(croppedPattern, backgroundColorId);
    setPattern(nextPattern);
    setSettings(normalizeSettings(nextPattern.settings));
    setLayeredPattern(null);
    setActiveLayerIndex(0);
    setPreviewMode("layer");
    setPreviewCropRect(null);
    setSelectedColorId(null);
    setStatus(`已裁剪为 ${nextPattern.width}x${nextPattern.height}`);
  };

  const toggleSelectedColor = (colorId: string) => {
    setSelectedColorId((currentColorId) => (currentColorId === colorId ? null : colorId));
  };

  const handleBackgroundChange = (colorId: string) => {
    if (!pattern) return;
    const nextBackgroundColorId = colorId || null;
    pushUndoSnapshot();
    setBackgroundColorId(nextBackgroundColorId);
    setPattern(applyPatternBackground(pattern, nextBackgroundColorId));
    setStatus(nextBackgroundColorId ? "背景色已排除" : "背景色已取消");
  };

  const handleCellClick = (x: number, y: number) => {
    if (!pattern) return;
    if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return;

    const cell = pattern.cells[y * pattern.width + x];
    const color = cell ? pattern.palette.find((item) => item.id === cell) : null;

    if (editTool === "inspect") {
      const index = y * pattern.width + x;
      const isBackground = isPatternBackgroundCell(pattern, index);
      const isSupport = pattern.supportCells?.[index] === true;
      const colorName = isBackground ? "背景" : isSupport ? "支撑" : (color?.nameZh ?? "空白");
      setInspectInfo({ x: x + 1, y: y + 1, colorName, colorCode: color?.code ?? "-" });
      setStatus(`坐标 ${x + 1}, ${y + 1} · ${colorName}`);
      return;
    }

    if (editTool === "eraser") {
      pushUndoSnapshot();
      const nextPattern = setPatternSupportFlag(setPatternCell(pattern, x, y, null, true), x, y, false);
      setPattern(nextPattern);
      if (layeredPattern && previewMode === "layer") {
        setLayeredPattern(
          syncLayeredPatternFromPattern(
            layeredPattern,
            activeLayerIndex,
            nextPattern,
            modelSupportSettings.showSupports,
          ),
        );
      }
      setStatus(`已擦除 ${x + 1}, ${y + 1}`);
      return;
    }

    const index = y * pattern.width + x;
    if (pattern.cells[index] === paintColorId && !isPatternBackgroundCell(pattern, index)) {
      return;
    }
    pushUndoSnapshot();
    const nextPattern = setPatternSupportFlag(setPatternCell(pattern, x, y, paintColorId), x, y, false);
    setPattern(nextPattern);
    if (layeredPattern && previewMode === "layer") {
      setLayeredPattern(
        syncLayeredPatternFromPattern(layeredPattern, activeLayerIndex, nextPattern, modelSupportSettings.showSupports),
      );
    }
    setStatus(`已修改 ${x + 1}, ${y + 1}`);
  };

  const sliceModelFile = async (file: File) => {
    setIsModelProcessing(true);
    try {
      const normalizedModelSliceSettings = getModelSliceSettingsFromDrafts(modelSliceDrafts);
      setModelSliceSettings(normalizedModelSliceSettings);
      const costEstimate = modelPreviewData
        ? estimateModelSliceCostFromPreview(modelPreviewData, {
            width: settings.width,
            height: settings.height,
            beadPitchMm: normalizedModelSliceSettings.beadPitchMm,
            beadHeightMm: normalizedModelSliceSettings.beadHeightMm,
            targetLayers: normalizedModelSliceSettings.targetLayers,
          })
        : null;
      const costWarning = costEstimate ? getSliceCostWarning(costEstimate) : null;
      if (costWarning && !window.confirm(costWarning)) {
        setStatus("模型切片已取消");
        return;
      }

      setStatus(costEstimate ? `正在本机切片模型 · ${formatSliceCostEstimate(costEstimate)}` : "正在本机切片模型");
      const nextLayeredPattern = await runModelWorkerJob(
        {
          type: "slice",
          file,
          settings: {
            width: settings.width,
            height: settings.height,
            beadPitchMm: normalizedModelSliceSettings.beadPitchMm,
            beadHeightMm: normalizedModelSliceSettings.beadHeightMm,
            targetLayers: normalizedModelSliceSettings.targetLayers,
            colorId: modelColorId,
            orientation: modelOrientation,
            support: {
              enabled: modelSupportSettings.enabled,
              colorId: modelSupportSettings.colorId,
            },
          },
        },
        (response) => {
          if (response.type !== "slice") throw new Error("本机模型处理响应无效");
          return response.layeredPattern;
        },
      );
      setLayeredPattern(nextLayeredPattern);
      setModelSourceFile(file);
      setUndoStack([]);
      setActiveLayerIndex(0);
      setPreviewMode("model");
      setBackgroundColorId(null);
      setPattern(
        applyPatternBackground(
          layeredPatternToPattern(nextLayeredPattern, 0, { includeSupports: modelSupportSettings.showSupports }),
          null,
        ),
      );
      setSourceFile(null);
      setPreviewCropRect(null);
      setSelectedColorId(null);
      setStatus(
        `本机已生成 ${nextLayeredPattern.layers.length} 层模型图纸${nextLayeredPattern.support?.generatedCells ? ` · 支撑 ${nextLayeredPattern.support.generatedCells} 格` : ""}`,
      );
    } catch (error) {
      if (isModelJobCancelled(error)) return;
      setStatus(error instanceof Error ? error.message : "模型切片失败");
    } finally {
      setIsModelProcessing(false);
    }
  };

  const loadModelFile = async (file: File) => {
    setIsModelProcessing(true);
    setStatus("正在本机读取模型预览");
    try {
      const nextPreviewData = await runModelWorkerJob(
        {
          type: "preview",
          file,
          colorId: modelColorId,
        },
        (response) => {
          if (response.type !== "preview") throw new Error("本机模型处理响应无效");
          return response.previewData;
        },
      );
      setModelSourceFile(file);
      setModelPreviewData(nextPreviewData);
      setModelOrientation(DEFAULT_MODEL_ORIENTATION);
      setLayeredPattern(null);
      setPattern(null);
      setUndoStack([]);
      setActiveLayerIndex(0);
      setPreviewMode("source-model");
      setBackgroundColorId(null);
      setSourceFile(null);
      setPreviewCropRect(null);
      setSelectedColorId(null);
      setStatus(`本机已载入模型预览 · ${nextPreviewData.triangleCount} 个三角面`);
    } catch (error) {
      if (isModelJobCancelled(error)) return;
      setStatus(error instanceof Error ? error.message : "模型预览失败");
    } finally {
      setIsModelProcessing(false);
    }
  };

  const handleModelChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await loadModelFile(file);
    } finally {
      event.target.value = "";
    }
  };

  const selectLayer = (layerIndex: number) => {
    if (!layeredPattern) return;
    setActiveLayerIndex(layerIndex);
    setPattern(
      applyPatternBackground(
        layeredPatternToPattern(layeredPattern, layerIndex, { includeSupports: modelSupportSettings.showSupports }),
        backgroundColorId,
      ),
    );
    setUndoStack([]);
    setPreviewCropRect(null);
    setSelectedColorId(null);
    setStatus(`当前第 ${layerIndex + 1} / ${layeredPattern.layers.length} 层`);
  };

  const rotateCurrentView = () => {
    if (!pattern) return;

    if (layeredPattern && previewMode === "layer") {
      const nextLayeredPattern = rotateLayeredPatternClockwise(layeredPattern);
      setLayeredPattern(nextLayeredPattern);
      setPattern(
        applyPatternBackground(
          layeredPatternToPattern(nextLayeredPattern, activeLayerIndex, {
            includeSupports: modelSupportSettings.showSupports,
          }),
          backgroundColorId,
        ),
      );
      setUndoStack([]);
      setPreviewCropRect(null);
      setSelectedColorId(null);
      setStatus("已旋转所有模型层");
      return;
    }

    pushUndoSnapshot();
    const nextPattern = rotatePatternClockwise(pattern);
    setPattern(nextPattern);
    setSettings(normalizeSettings(nextPattern.settings));
    setPreviewCropRect(null);
    setSelectedColorId(null);
    setStatus("已旋转图纸");
  };

  const rotateModelOrientation = (axis: keyof ModelOrientation) => {
    setModelOrientation((orientation) => ({
      ...orientation,
      [axis]: normalizeRotationDegrees(orientation[axis] + 90),
    }));
    if (modelPreviewData) setPreviewMode("source-model");
    setStatus("模型方向已调整，点击开始切片生成层图");
  };

  const resetModelOrientation = () => {
    setModelOrientation(DEFAULT_MODEL_ORIENTATION);
    if (modelPreviewData) setPreviewMode("source-model");
    setStatus("模型方向已重置");
  };

  const updateModelSupportSettings = (partial: Partial<typeof DEFAULT_MODEL_SUPPORT_SETTINGS>) => {
    setModelSupportSettings((currentSettings) => {
      const nextSettings = { ...currentSettings, ...partial };
      if (layeredPattern && partial.showSupports !== undefined) {
        setPattern(
          applyPatternBackground(
            layeredPatternToPattern(layeredPattern, activeLayerIndex, { includeSupports: nextSettings.showSupports }),
            backgroundColorId,
          ),
        );
        setStatus(nextSettings.showSupports ? "已显示支撑" : "已隐藏支撑");
      } else if (partial.enabled !== undefined || partial.colorId !== undefined) {
        setStatus("支撑设置已调整，重新切片后生效");
      }
      return nextSettings;
    });
  };

  const exportLayeredProductionPack = async () => {
    if (!layeredPattern) return;

    setIsExportingProductionPack(true);
    setStatus(`正在打包 ${layeredPattern.layers.length} 层制作包`);
    try {
      await downloadLayeredProductionZip(layeredPattern);
      setStatus("制作包已导出");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "制作包导出失败");
    } finally {
      setIsExportingProductionPack(false);
    }
  };

  const isSourceModelPreview = Boolean(modelPreviewData && previewMode === "source-model");
  const isLayeredModelPreview = Boolean(layeredPattern && previewMode === "model");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <Palette size={20} />
          </div>
          <div>
            <h1>拼豆图纸生成器</h1>
            <p>Bambu Lab PLA Basic</p>
          </div>
        </div>

        <div className="top-actions">
          <input
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={handleImageChange}
            ref={fileInputRef}
            type="file"
          />
          <input accept="application/json" hidden onChange={handleProjectChange} ref={projectInputRef} type="file" />
          <input
            accept=".stl,.3mf,model/stl,application/vnd.ms-package.3dmanufacturing-3dmodel+xml"
            hidden
            onChange={handleModelChange}
            ref={modelInputRef}
            type="file"
          />
          <button
            className="button primary"
            disabled={isProcessing}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <ImagePlus size={18} />
            上传图片
          </button>
          <button className="button" onClick={() => projectInputRef.current?.click()} type="button">
            <FolderOpen size={18} />
            导入 JSON
          </button>
        </div>
      </header>

      <section className="workspace">
        <ControlsPanel
          commitDraftSettings={commitDraftSettings}
          cropMode={cropMode}
          handleApplyPreviewCrop={handleApplyPreviewCrop}
          handleApplySourceCrop={handleApplySourceCrop}
          handleClearSourceCrop={handleClearSourceCrop}
          handleDraftKeyDown={handleDraftKeyDown}
          isProcessing={isProcessing}
          onGeneratePattern={() => void generatePattern()}
          pattern={pattern}
          previewCropRect={previewCropRect}
          setCropMode={setCropMode}
          setPreviewCropRect={setPreviewCropRect}
          setSettingDrafts={setSettingDrafts}
          settingDrafts={settingDrafts}
          settings={settings}
          sizePresets={SIZE_PRESETS}
          sourceFile={sourceFile}
          sourceImageUrl={sourceImageUrl}
          updateSettings={updateSettings}
        >
          <ModelPanel
            activeLayerIndex={activeLayerIndex}
            handleDraftKeyDown={handleDraftKeyDown}
            isModelProcessing={isModelProcessing}
            layeredPattern={layeredPattern}
            modelColorId={modelColorId}
            modelInputRef={modelInputRef}
            modelOrientation={modelOrientation}
            modelSliceDrafts={modelSliceDrafts}
            modelSourceFile={modelSourceFile}
            modelSupportSettings={modelSupportSettings}
            onCancelModelJob={cancelModelJob}
            onCommitModelSliceDrafts={commitModelSliceDrafts}
            onResetModelOrientation={resetModelOrientation}
            onRotateModelOrientation={rotateModelOrientation}
            onSelectLayer={selectLayer}
            onSliceModel={() => modelSourceFile && void sliceModelFile(modelSourceFile)}
            setModelColorId={setModelColorId}
            setModelSliceDrafts={setModelSliceDrafts}
            updateModelSupportSettings={updateModelSupportSettings}
          />
        </ControlsPanel>

        <section className="preview-area">
          <div className="preview-toolbar">
            <div>
              <h2>
                {isSourceModelPreview
                  ? "模型预览"
                  : isLayeredModelPreview
                    ? "整体模型"
                    : pattern
                      ? `${pattern.width} x ${pattern.height}`
                      : "预览"}
              </h2>
              <p>{status}</p>
            </div>
            <ExportBar
              isExportingProductionPack={isExportingProductionPack}
              isLayeredModelPreview={isLayeredModelPreview}
              isSourceModelPreview={isSourceModelPreview}
              layeredPattern={layeredPattern}
              modelPreviewData={modelPreviewData}
              onCommitPreviewZoomDraft={commitPreviewZoomDraft}
              onDraftKeyDown={handleDraftKeyDown}
              onExportProductionPack={() => void exportLayeredProductionPack()}
              onPreviewModeChange={setPreviewMode}
              onPreviewZoomChange={setPreviewZoom}
              onRotateCurrentView={rotateCurrentView}
              pattern={pattern}
              previewMode={previewMode}
              previewZoomDraft={previewZoomDraft}
              setPreviewZoomDraft={setPreviewZoomDraft}
            />
          </div>
          {modelPreviewData && previewMode === "source-model" ? (
            <Suspense fallback={<div className="preview-loading">加载模型预览</div>}>
              <ModelFilePreview orientation={modelOrientation} previewData={modelPreviewData} />
            </Suspense>
          ) : layeredPattern && previewMode === "model" ? (
            <Suspense fallback={<div className="preview-loading">加载整体模型</div>}>
              <LayeredModelPreview
                layeredPattern={layeredPattern}
                activeLayerIndex={activeLayerIndex}
                showSupports={modelSupportSettings.showSupports}
              />
            </Suspense>
          ) : (
            <PatternPreview
              pattern={pattern}
              selectedColorId={selectedColorId}
              zoom={previewZoom}
              interactionMode={editTool}
              onCellClick={handleCellClick}
            />
          )}
        </section>

        <ColorsPanel
          allPatternColors={allPatternColors}
          backgroundColorId={backgroundColorId}
          editTool={editTool}
          inspectInfo={inspectInfo}
          onBackgroundChange={handleBackgroundChange}
          onReplaceColor={handleReplaceColor}
          onToggleSelectedColor={toggleSelectedColor}
          onUndo={handleUndo}
          paintColorId={paintColorId}
          pattern={pattern}
          selectedColorId={selectedColorId}
          setEditTool={setEditTool}
          setPaintColorId={setPaintColorId}
          setSelectedColorId={setSelectedColorId}
          totalBeads={totalBeads}
          undoStackLength={undoStack.length}
          usage={usage}
        />
      </section>
    </main>
  );
}

function isModelJobCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === MODEL_JOB_CANCELLED;
}

function formatModelWorkerProgress(progress: ModelProcessingProgress): string {
  if (progress.stage === "slicing" && progress.current !== undefined && progress.total) {
    return `${progress.message} · ${progress.current}/${progress.total}`;
  }
  if (progress.cost) {
    return `${progress.message} · ${formatSliceCostEstimate(progress.cost)}`;
  }
  return progress.message;
}

function formatSliceCostEstimate(estimate: ModelSliceCostEstimate): string {
  return [
    `${formatCompactNumber(estimate.triangleCount)} 面`,
    `${estimate.layerCount} 层`,
    `${formatCompactNumber(estimate.gridCells)} 格/层`,
  ].join(" · ");
}

function getSliceCostWarning(estimate: ModelSliceCostEstimate): string | null {
  if (estimate.triangleLayerChecks < 80_000_000 && estimate.cellLayerChecks < 20_000_000) return null;
  return [`预计切片成本较高：${formatSliceCostEstimate(estimate)}。`, "处理期间可能需要较长时间，是否继续？"].join(
    "\n",
  );
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(value);
}

export default App;
