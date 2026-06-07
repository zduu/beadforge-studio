import { ChangeEvent, KeyboardEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  ImagePlus,
  Layers,
  Palette,
  Search,
  Eraser,
  Brush,
  RotateCcw,
  RotateCw,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { CropSelector } from "./components/CropSelector";
import { PatternPreview } from "./components/PatternPreview";
import { bambuPlaBasicColors } from "./data/bambuPlaBasic";
import {
  downloadLayeredColorsJson,
  downloadLayeredPatternJson,
  downloadPatternJson,
  downloadPatternPng,
  downloadUsageCsv,
} from "./lib/export";
import { imageFileToPattern } from "./lib/imageToPattern";
import { layeredPatternToPattern, validateLayeredPattern } from "./lib/layeredPattern";
import type { ModelWorkerJobRequest, ModelWorkerRequest, ModelWorkerResponse } from "./lib/modelWorkerMessages";
import { cropPatternToRect, getAllPatternColors, getColorUsage, isPatternBackgroundCell, replacePatternColor, setPatternBackground, setPatternCell, validatePattern } from "./lib/pattern";
import type { ColorUsage, CropRect, FitMode, LayeredPattern, ModelSupportSettings, Pattern, PatternSettings, SampleMode } from "./types";
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
const LayeredModelPreview = lazy(() => import("./components/LayeredModelPreview").then((module) => ({ default: module.LayeredModelPreview })));
const ModelFilePreview = lazy(() => import("./components/ModelFilePreview").then((module) => ({ default: module.ModelFilePreview })));

type PreviewMode = "layer" | "model" | "source-model";
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
const MAX_UNDO_STEPS = 80;
const MODEL_JOB_CANCELLED = "MODEL_JOB_CANCELLED";

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
  const [isModelProcessing, setIsModelProcessing] = useState(false);
  const [status, setStatus] = useState("等待图片");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const modelWorkerRef = useRef<Worker | null>(null);
  const modelJobIdRef = useRef(0);
  const modelJobRejectRef = useRef<((error: Error) => void) | null>(null);

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

  useEffect(() => {
    return () => {
      modelWorkerRef.current?.terminate();
      modelWorkerRef.current = null;
      modelJobRejectRef.current = null;
    };
  }, []);

  const generatePattern = async (file = sourceFile, nextSettings = settings) => {
    if (!file) {
      setStatus("请选择图片");
      return;
    }

    const normalizedSettings = normalizeSettings(nextSettings);
    setIsProcessing(true);
    setStatus("正在生成图纸");
    try {
      const nextPattern = await imageFileToPattern(file, normalizedSettings);
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
          backgroundCells: imported.backgroundCells?.length === imported.cells.length ? imported.backgroundCells : undefined,
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
          beadHeightMm: importedLayeredPattern.sourceModel?.beadHeightMm ?? importedLayeredPattern.sourceModel?.layerHeightMm ?? DEFAULT_MODEL_SLICE_SETTINGS.beadHeightMm,
          targetLayers: importedLayeredPattern.sourceModel?.targetLayers ?? DEFAULT_MODEL_SLICE_SETTINGS.targetLayers,
        });

        setLayeredPattern(importedLayeredPattern);
        setPattern(applyPatternBackground(layeredPatternToPattern(importedLayeredPattern, 0, { includeSupports: nextShowSupports }), null));
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
        setStatus(`已导入 ${importedLayeredPattern.width}x${importedLayeredPattern.height} · ${importedLayeredPattern.layers.length} 层项目`);
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
      setLayeredPattern(syncLayeredPatternFromPattern(layeredPattern, activeLayerIndex, nextPattern, modelSupportSettings.showSupports));
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
    setUndoStack((stack) => [...stack.slice(-(MAX_UNDO_STEPS - 1)), snapshot]);
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

  const handleSourceCropChange = (rect: CropRect | null) => {
    updateSettings({ sourceCrop: rect }, false);
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
      const colorName = isBackground ? "背景" : isSupport ? "支撑" : color?.nameZh ?? "空白";
      setInspectInfo({ x: x + 1, y: y + 1, colorName, colorCode: color?.code ?? "-" });
      setStatus(`坐标 ${x + 1}, ${y + 1} · ${colorName}`);
      return;
    }

    if (editTool === "eraser") {
      pushUndoSnapshot();
      const nextPattern = setPatternSupportFlag(setPatternCell(pattern, x, y, null, true), x, y, false);
      setPattern(nextPattern);
      if (layeredPattern && previewMode === "layer") {
        setLayeredPattern(syncLayeredPatternFromPattern(layeredPattern, activeLayerIndex, nextPattern, modelSupportSettings.showSupports));
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
      setLayeredPattern(syncLayeredPatternFromPattern(layeredPattern, activeLayerIndex, nextPattern, modelSupportSettings.showSupports));
    }
    setStatus(`已修改 ${x + 1}, ${y + 1}`);
  };

  const runModelWorkerJob = <T,>(
    request: ModelWorkerJobRequest,
    readResponse: (response: Extract<ModelWorkerResponse, { ok: true }>) => T,
  ) => new Promise<T>((resolve, reject) => {
    if (modelWorkerRef.current) {
      modelWorkerRef.current.terminate();
      modelWorkerRef.current = null;
      modelJobRejectRef.current?.(new Error(MODEL_JOB_CANCELLED));
      modelJobRejectRef.current = null;
    }

    const jobId = modelJobIdRef.current + 1;
    modelJobIdRef.current = jobId;
    const worker = new Worker(new URL("./workers/modelWorker.ts", import.meta.url), { type: "module" });
    modelWorkerRef.current = worker;
    modelJobRejectRef.current = reject;

    const cleanup = () => {
      worker.terminate();
      if (modelWorkerRef.current === worker) modelWorkerRef.current = null;
      if (modelJobRejectRef.current === reject) modelJobRejectRef.current = null;
    };

    worker.onmessage = (event: MessageEvent<ModelWorkerResponse>) => {
      const response = event.data;
      if (response.id !== jobId) return;

      cleanup();
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }

      try {
        resolve(readResponse(response));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("本机模型处理响应无效"));
      }
    };

    worker.onerror = () => {
      cleanup();
      reject(new Error("本机模型处理线程异常"));
    };

    worker.postMessage({ ...request, id: jobId } as ModelWorkerRequest);
  });

  const sliceModelFile = async (file: File) => {
    setIsModelProcessing(true);
    setStatus("正在本机切片模型");
    try {
      const normalizedModelSliceSettings = getModelSliceSettingsFromDrafts(modelSliceDrafts);
      setModelSliceSettings(normalizedModelSliceSettings);
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
      setPattern(applyPatternBackground(layeredPatternToPattern(nextLayeredPattern, 0, { includeSupports: modelSupportSettings.showSupports }), null));
      setSourceFile(null);
      setPreviewCropRect(null);
      setSelectedColorId(null);
      setStatus(`本机已生成 ${nextLayeredPattern.layers.length} 层模型图纸${nextLayeredPattern.support?.generatedCells ? ` · 支撑 ${nextLayeredPattern.support.generatedCells} 格` : ""}`);
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
    setPattern(applyPatternBackground(layeredPatternToPattern(layeredPattern, layerIndex, { includeSupports: modelSupportSettings.showSupports }), backgroundColorId));
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
      setPattern(applyPatternBackground(layeredPatternToPattern(nextLayeredPattern, activeLayerIndex, { includeSupports: modelSupportSettings.showSupports }), backgroundColorId));
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
        setPattern(applyPatternBackground(layeredPatternToPattern(layeredPattern, activeLayerIndex, { includeSupports: nextSettings.showSupports }), backgroundColorId));
        setStatus(nextSettings.showSupports ? "已显示支撑" : "已隐藏支撑");
      } else if (partial.enabled !== undefined || partial.colorId !== undefined) {
        setStatus("支撑设置已调整，重新切片后生效");
      }
      return nextSettings;
    });
  };

  const cancelModelJob = () => {
    const reject = modelJobRejectRef.current;
    modelWorkerRef.current?.terminate();
    modelWorkerRef.current = null;
    modelJobRejectRef.current = null;
    modelJobIdRef.current += 1;
    reject?.(new Error(MODEL_JOB_CANCELLED));
    setIsModelProcessing(false);
    setStatus("本机处理已取消");
  };

  const isSourceModelPreview = Boolean(modelPreviewData && previewMode === "source-model");
  const isLayeredModelPreview = Boolean(layeredPattern && previewMode === "model");
  const modelDiagnostics = layeredPattern?.diagnostics;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark"><Palette size={20} /></div>
          <div>
            <h1>拼豆图纸生成器</h1>
            <p>Bambu Lab PLA Basic</p>
          </div>
        </div>

        <div className="top-actions">
          <input accept="image/png,image/jpeg,image/webp" hidden onChange={handleImageChange} ref={fileInputRef} type="file" />
          <input accept="application/json" hidden onChange={handleProjectChange} ref={projectInputRef} type="file" />
          <input accept=".stl,.3mf,model/stl,application/vnd.ms-package.3dmanufacturing-3dmodel+xml" hidden onChange={handleModelChange} ref={modelInputRef} type="file" />
          <button className="button primary" disabled={isProcessing} onClick={() => fileInputRef.current?.click()} type="button">
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
        <aside className="panel controls-panel">
          <div className="panel-heading">
            <h2>设置</h2>
            <button className="icon-button" onClick={() => updateSettings(DEFAULT_SETTINGS)} title="恢复默认" type="button">
              <RotateCcw size={18} />
            </button>
          </div>

          <label className="field">
            <span>宽度</span>
            <input
              min={1}
              type="number"
              value={settingDrafts.width}
              onBlur={commitDraftSettings}
              onChange={(event) => setSettingDrafts((drafts) => ({ ...drafts, width: event.target.value }))}
              onKeyDown={handleDraftKeyDown}
            />
          </label>

          <label className="field">
            <span>高度</span>
            <input
              min={1}
              type="number"
              value={settingDrafts.height}
              onBlur={commitDraftSettings}
              onChange={(event) => setSettingDrafts((drafts) => ({ ...drafts, height: event.target.value }))}
              onKeyDown={handleDraftKeyDown}
            />
          </label>

          <div className="preset-row" aria-label="常用尺寸">
            {SIZE_PRESETS.map((size) => (
              <button className="preset-button" key={size} onClick={() => updateSettings({ width: size, height: size })} type="button">
                {size}
              </button>
            ))}
          </div>

          <label className="field">
            <span>图片适配</span>
            <select value={settings.fitMode} onChange={(event) => updateSettings({ fitMode: event.target.value as FitMode })}>
              <option value="contain">完整留白</option>
              <option value="cover">裁剪填满</option>
              <option value="stretch">拉伸</option>
            </select>
          </label>

          <label className="field">
            <span>取样</span>
            <select value={settings.sampleMode} onChange={(event) => updateSettings({ sampleMode: event.target.value as SampleMode })}>
              <option value="average">平均色</option>
              <option value="center">中心点</option>
            </select>
          </label>

          <label className="field">
            <span>最多颜色</span>
            <input
              min={0}
              type="number"
              value={settingDrafts.maxColors}
              onBlur={commitDraftSettings}
              onChange={(event) => setSettingDrafts((drafts) => ({ ...drafts, maxColors: event.target.value }))}
              onKeyDown={handleDraftKeyDown}
            />
          </label>

          <label className="field">
            <span>细节增强</span>
            <input
              max={100}
              min={0}
              type="range"
              value={settings.detailBoost}
              onChange={(event) => updateSettings({ detailBoost: Number(event.target.value) })}
            />
          </label>

          <div className="crop-panel">
            <h2>图片裁剪</h2>
            <div className="segmented-control crop-mode" aria-label="裁剪模式">
              <button className={cropMode === "source" ? "active" : ""} onClick={() => setCropMode("source")} type="button">
                原图剪裁
              </button>
              <button className={cropMode === "preview" ? "active" : ""} onClick={() => setCropMode("preview")} type="button">
                预览图剪裁
              </button>
            </div>
            <CropSelector
              imageUrl={sourceImageUrl}
              mode={cropMode === "source" ? "image" : "pattern"}
              onRectChange={cropMode === "source" ? handleSourceCropChange : setPreviewCropRect}
              pattern={pattern}
              rect={cropMode === "source" ? settings.sourceCrop : previewCropRect}
            />
            <div className="crop-actions">
              {cropMode === "source" ? (
                <>
                  <button className="button" disabled={!sourceFile || !settings.sourceCrop || isProcessing} onClick={handleApplySourceCrop} type="button">
                    应用原图裁剪
                  </button>
                  <button className="button" disabled={!settings.sourceCrop || isProcessing} onClick={handleClearSourceCrop} type="button">
                    清除
                  </button>
                </>
              ) : (
                <>
                  <button className="button" disabled={!pattern || !previewCropRect} onClick={handleApplyPreviewCrop} type="button">
                    应用预览裁剪
                  </button>
                  <button className="button" disabled={!previewCropRect} onClick={() => setPreviewCropRect(null)} type="button">
                    清除
                  </button>
                </>
              )}
            </div>
            <label className="toggle-field">
              <input checked={settings.mirrorX} onChange={(event) => updateSettings({ mirrorX: event.target.checked })} type="checkbox" />
              <span>水平镜像</span>
            </label>
          </div>

          <button className="button full" disabled={!sourceFile || isProcessing} onClick={() => void generatePattern()} type="button">
            <Upload size={18} />
            重新生成
          </button>

          <details className="model-panel">
            <summary>3D 模型</summary>
            <label className="field compact-field">
              <span>层数</span>
              <input
                min={0}
                placeholder="默认"
                type="number"
                value={modelSliceDrafts.targetLayers}
                onBlur={commitModelSliceDrafts}
                onChange={(event) => setModelSliceDrafts((drafts) => ({ ...drafts, targetLayers: event.target.value }))}
                onKeyDown={handleDraftKeyDown}
              />
            </label>
            <label className="field compact-field">
              <span>格距 mm</span>
              <input
                inputMode="decimal"
                min={0.1}
                step={0.1}
                type="number"
                value={modelSliceDrafts.beadPitchMm}
                onBlur={commitModelSliceDrafts}
                onChange={(event) => setModelSliceDrafts((drafts) => ({ ...drafts, beadPitchMm: event.target.value }))}
                onKeyDown={handleDraftKeyDown}
              />
            </label>
            <label className="field compact-field">
              <span>层高 mm</span>
              <input
                inputMode="decimal"
                min={0.1}
                step={0.1}
                type="number"
                value={modelSliceDrafts.beadHeightMm}
                onBlur={commitModelSliceDrafts}
                onChange={(event) => setModelSliceDrafts((drafts) => ({ ...drafts, beadHeightMm: event.target.value }))}
                onKeyDown={handleDraftKeyDown}
              />
            </label>
            <label className="field compact-field">
              <span>默认耗材</span>
              <select value={modelColorId} onChange={(event) => setModelColorId(event.target.value)}>
                {bambuPlaBasicColors.map((color) => (
                  <option key={color.id} value={color.id}>{color.nameZh} · {color.code}</option>
                ))}
              </select>
            </label>
            <div className="support-panel">
              <label className="toggle-field compact-toggle">
                <input
                  checked={modelSupportSettings.enabled}
                  onChange={(event) => updateModelSupportSettings({ enabled: event.target.checked })}
                  type="checkbox"
                />
                <span>自动补支撑</span>
              </label>
              <label className="field compact-field">
                <span>支撑耗材</span>
                <select
                  disabled={!modelSupportSettings.enabled}
                  value={modelSupportSettings.colorId}
                  onChange={(event) => updateModelSupportSettings({ colorId: event.target.value })}
                >
                  {bambuPlaBasicColors.map((color) => (
                    <option key={color.id} value={color.id}>{color.nameZh} · {color.code}</option>
                  ))}
                </select>
              </label>
              <label className="toggle-field compact-toggle">
                <input
                  checked={modelSupportSettings.showSupports}
                  onChange={(event) => updateModelSupportSettings({ showSupports: event.target.checked })}
                  type="checkbox"
                />
                <span>显示支撑</span>
              </label>
              {layeredPattern?.support && (
                <div className="support-summary">
                  <span>支撑格</span>
                  <strong>{layeredPattern.support.generatedCells}</strong>
                </div>
              )}
            </div>
            <div className="model-orientation-panel">
              <div className="metric-row">
                <span>模型方向</span>
                <strong>
                  X {modelOrientation.rotateXDeg}° · Y {modelOrientation.rotateYDeg}° · Z {modelOrientation.rotateZDeg}°
                </strong>
              </div>
              <div className="axis-button-row" aria-label="模型方向旋转">
                <button className="button" disabled={!modelSourceFile || isModelProcessing} onClick={() => rotateModelOrientation("rotateXDeg")} title="绕 X 轴旋转" type="button">
                  <RotateCw size={16} />
                  X
                </button>
                <button className="button" disabled={!modelSourceFile || isModelProcessing} onClick={() => rotateModelOrientation("rotateYDeg")} title="绕 Y 轴旋转" type="button">
                  <RotateCw size={16} />
                  Y
                </button>
                <button className="button" disabled={!modelSourceFile || isModelProcessing} onClick={() => rotateModelOrientation("rotateZDeg")} title="绕 Z 轴旋转" type="button">
                  <RotateCw size={16} />
                  Z
                </button>
                <button className="button" disabled={!modelSourceFile || isModelProcessing} onClick={resetModelOrientation} title="重置模型方向" type="button">
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>
            <button className="button full" disabled={isModelProcessing} onClick={() => modelInputRef.current?.click()} type="button">
              <Layers size={18} />
              上传模型
            </button>
            <button className="button primary full" disabled={!modelSourceFile || isModelProcessing} onClick={() => modelSourceFile && void sliceModelFile(modelSourceFile)} type="button">
              <Layers size={18} />
              {layeredPattern ? "重新切片" : "开始切片"}
            </button>
            {isModelProcessing && (
              <button className="button full" onClick={cancelModelJob} type="button">
                取消本机处理
              </button>
            )}
            {layeredPattern && (
              <div className="layer-list">
                {layeredPattern.layers.map((layer, index) => (
                  <button
                    className={`layer-button ${activeLayerIndex === index ? "active" : ""}`}
                    key={layer.index}
                    onClick={() => selectLayer(index)}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    <strong>{getLayerCellCount(layer, modelSupportSettings.showSupports)}</strong>
                  </button>
                ))}
              </div>
            )}
            {modelDiagnostics && (
              <div className="slice-diagnostics">
                <h3>切片信息</h3>
                <div className="diagnostic-grid">
                  <div className="diagnostic-item">
                    <span>原始尺寸 mm</span>
                    <strong>{formatModelVector(modelDiagnostics.originalBounds.size)}</strong>
                  </div>
                  <div className="diagnostic-item">
                    <span>旋转后 mm</span>
                    <strong>{formatModelVector(modelDiagnostics.orientedBounds.size)}</strong>
                  </div>
                  <div className="diagnostic-item">
                    <span>缩放后 mm</span>
                    <strong>{formatModelVector(modelDiagnostics.scaledSizeMm)}</strong>
                  </div>
                  <div className="diagnostic-item">
                    <span>缩放</span>
                    <strong>{formatModelNumber(modelDiagnostics.scale)}x</strong>
                  </div>
                  <div className="diagnostic-item">
                    <span>层数</span>
                    <strong>{modelDiagnostics.nonEmptyLayerCount} / {modelDiagnostics.generatedLayerCount}</strong>
                  </div>
                  <div className="diagnostic-item">
                    <span>当前层</span>
                    <strong>{getLayerOccupiedCells(modelDiagnostics, layeredPattern.layers[activeLayerIndex]?.index ?? activeLayerIndex)}</strong>
                  </div>
                  <div className="diagnostic-item">
                    <span>自然层数</span>
                    <strong>{modelDiagnostics.naturalLayerCount}</strong>
                  </div>
                  <div className="diagnostic-item">
                    <span>空层</span>
                    <strong>{modelDiagnostics.emptyLayerCount}</strong>
                  </div>
                </div>
              </div>
            )}
          </details>
        </aside>

        <section className="preview-area">
          <div className="preview-toolbar">
            <div>
              <h2>{isSourceModelPreview ? "模型预览" : isLayeredModelPreview ? "整体模型" : pattern ? `${pattern.width} x ${pattern.height}` : "预览"}</h2>
              <p>{status}</p>
            </div>
            <div className="export-actions">
              {!isLayeredModelPreview && !isSourceModelPreview && (
                <div className="zoom-actions" aria-label="预览缩放">
                  <button className="icon-button" onClick={() => setPreviewZoom((zoom) => Math.max(0.1, Number((zoom - 0.25).toFixed(2))))} title="缩小" type="button">
                    <ZoomOut size={18} />
                  </button>
                  <label className="zoom-input-label">
                    <input
                      aria-label="预览缩放百分比"
                      inputMode="decimal"
                      type="number"
                      value={previewZoomDraft}
                      onBlur={commitPreviewZoomDraft}
                      onChange={(event) => setPreviewZoomDraft(event.target.value)}
                      onKeyDown={handleDraftKeyDown}
                    />
                    <span>%</span>
                  </label>
                  <button className="icon-button" onClick={() => setPreviewZoom((zoom) => Math.min(8, Number((zoom + 0.25).toFixed(2))))} title="放大" type="button">
                    <ZoomIn size={18} />
                  </button>
                </div>
              )}
              {(modelPreviewData || layeredPattern) && (
                <div className={`segmented-control ${modelPreviewData && layeredPattern ? "three-way" : modelPreviewData ? "one-way" : ""}`} aria-label="预览模式">
                  {modelPreviewData && (
                    <button className={previewMode === "source-model" ? "active" : ""} onClick={() => setPreviewMode("source-model")} type="button">
                      原模型
                    </button>
                  )}
                  {layeredPattern && (
                    <>
                      <button className={previewMode === "layer" ? "active" : ""} onClick={() => setPreviewMode("layer")} type="button">
                        当前层
                      </button>
                      <button className={previewMode === "model" ? "active" : ""} onClick={() => setPreviewMode("model")} type="button">
                        整体
                      </button>
                    </>
                  )}
                </div>
              )}
              {pattern && !isLayeredModelPreview && !isSourceModelPreview && (
                <button className="icon-button" onClick={rotateCurrentView} title="顺时针旋转" type="button">
                  <RotateCw size={18} />
                </button>
              )}
              <button className="icon-button" disabled={!pattern} onClick={() => pattern && downloadPatternPng(pattern)} title="导出 PNG" type="button">
                <Download size={18} />
              </button>
              <button className="icon-button" disabled={!pattern} onClick={() => pattern && downloadUsageCsv(pattern)} title="导出 CSV" type="button">
                <FileSpreadsheet size={18} />
              </button>
              <button className="icon-button" disabled={!pattern} onClick={() => pattern && downloadPatternJson(pattern)} title="导出 JSON" type="button">
                <FileJson size={18} />
              </button>
              <button className="icon-button" disabled={!layeredPattern} onClick={() => layeredPattern && downloadLayeredPatternJson(layeredPattern)} title="导出多层 JSON" type="button">
                <Layers size={18} />
              </button>
              <button className="icon-button" disabled={!layeredPattern} onClick={() => layeredPattern && downloadLayeredColorsJson(layeredPattern)} title="导出颜色 JSON" type="button">
                <Palette size={18} />
              </button>
            </div>
          </div>
          {modelPreviewData && previewMode === "source-model" ? (
            <Suspense fallback={<div className="preview-loading">加载模型预览</div>}>
              <ModelFilePreview orientation={modelOrientation} previewData={modelPreviewData} />
            </Suspense>
          ) : layeredPattern && previewMode === "model" ? (
            <Suspense fallback={<div className="preview-loading">加载整体模型</div>}>
              <LayeredModelPreview layeredPattern={layeredPattern} activeLayerIndex={activeLayerIndex} showSupports={modelSupportSettings.showSupports} />
            </Suspense>
          ) : (
            <PatternPreview pattern={pattern} selectedColorId={selectedColorId} zoom={previewZoom} interactionMode={editTool} onCellClick={handleCellClick} />
          )}
        </section>

        <aside className="panel colors-panel">
          <div className="panel-heading">
            <h2>颜色</h2>
            <span className="count-pill">{totalBeads} 颗</span>
          </div>

          <div className="tool-switch" aria-label="编辑工具">
            <button className={editTool === "brush" ? "active" : ""} onClick={() => setEditTool("brush")} title="画笔" type="button">
              <Brush size={16} />
              画笔
            </button>
            <button className={editTool === "eraser" ? "active" : ""} onClick={() => setEditTool("eraser")} title="橡皮" type="button">
              <Eraser size={16} />
              橡皮
            </button>
            <button className={editTool === "inspect" ? "active" : ""} onClick={() => setEditTool("inspect")} title="查看" type="button">
              <Search size={16} />
              查看
            </button>
          </div>

          <button className="button full undo-button" disabled={undoStack.length === 0} onClick={handleUndo} type="button">
            <Undo2 size={18} />
            回退
          </button>

          <label className="field">
            <span>画笔</span>
            <select value={paintColorId} onChange={(event) => setPaintColorId(event.target.value)}>
              {bambuPlaBasicColors.map((color) => (
                <option key={color.id} value={color.id}>{color.nameZh} · {color.code}</option>
              ))}
            </select>
          </label>

          {inspectInfo && (
            <div className="inspect-box">
              <span>坐标</span>
              <strong>{inspectInfo.x}, {inspectInfo.y}</strong>
              <small>{inspectInfo.colorName} · {inspectInfo.colorCode}</small>
            </div>
          )}

          <label className="field">
            <span>背景色</span>
            <select value={backgroundColorId ?? ""} disabled={!pattern} onChange={(event) => handleBackgroundChange(event.target.value)}>
              <option value="">不排除</option>
              {allPatternColors.map(({ color }) => (
                <option key={color.id} value={color.id}>{color.nameZh} · {color.code}</option>
              ))}
            </select>
          </label>

          {selectedColorId && (
            <div className="replace-panel">
              <label className="field compact-field">
                <span>替换为</span>
                <select value={selectedColorId} onChange={(event) => handleReplaceColor(event.target.value)}>
                  {bambuPlaBasicColors.map((color) => (
                    <option key={color.id} value={color.id}>{color.nameZh} · {color.code}</option>
                  ))}
                </select>
              </label>
              <button className="button full" onClick={() => setSelectedColorId(null)} type="button">
                取消选择
              </button>
            </div>
          )}

          <div className="usage-list">
            {usage.map(({ color, count }) => (
              <button
                className={`usage-item ${selectedColorId === color.id ? "selected" : ""}`}
                key={color.id}
                onClick={() => toggleSelectedColor(color.id)}
                type="button"
              >
                <span className="swatch" style={{ backgroundColor: color.hex }} />
                <span className="usage-name">
                  <strong>{color.nameZh}</strong>
                  <small>{color.name} · {color.code} · {color.hex}</small>
                </span>
                <span className="usage-count">{count}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function normalizeSettings(settings: PatternSettings): PatternSettings {
  return {
    ...settings,
    width: clampNumber(settings.width, 1, Number.MAX_SAFE_INTEGER),
    height: clampNumber(settings.height, 1, Number.MAX_SAFE_INTEGER),
    maxColors: clampNumber(settings.maxColors, 0, Number.MAX_SAFE_INTEGER),
    detailBoost: clampNumber(settings.detailBoost, 0, 100),
    sourceCrop: normalizeCropRect(settings.sourceCrop),
    mirrorX: Boolean(settings.mirrorX),
  };
}

function normalizeModelSliceSettings(settings: typeof DEFAULT_MODEL_SLICE_SETTINGS): typeof DEFAULT_MODEL_SLICE_SETTINGS {
  return {
    beadPitchMm: clampDecimal(settings.beadPitchMm, 0.1, 100),
    beadHeightMm: clampDecimal(settings.beadHeightMm, 0.1, 100),
    targetLayers: clampNumber(settings.targetLayers, 0, 2000),
  };
}

function getModelSliceSettingsFromDrafts(drafts: typeof DEFAULT_MODEL_SLICE_SETTINGS | Record<keyof typeof DEFAULT_MODEL_SLICE_SETTINGS, string>) {
  return normalizeModelSliceSettings({
    beadPitchMm: parseDraftFloat(String(drafts.beadPitchMm), DEFAULT_MODEL_SLICE_SETTINGS.beadPitchMm),
    beadHeightMm: parseDraftFloat(String(drafts.beadHeightMm), DEFAULT_MODEL_SLICE_SETTINGS.beadHeightMm),
    targetLayers: parseDraftNumber(String(drafts.targetLayers), DEFAULT_MODEL_SLICE_SETTINGS.targetLayers),
  });
}

function getLayeredColorUsage(layeredPattern: LayeredPattern, includeSupports: boolean): ColorUsage[] {
  const counts = new Map<string, number>();
  const colorById = new Map(layeredPattern.palette.map((color) => [color.id, color]));

  for (const layer of layeredPattern.layers) {
    for (let index = 0; index < layer.cells.length; index += 1) {
      const cell = layer.cells[index];
      if (!cell) continue;
      if (!includeSupports && layer.supportCells?.[index]) continue;
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ color: colorById.get(id), count }))
    .filter((item): item is ColorUsage => Boolean(item.color))
    .sort((a, b) => b.count - a.count || a.color.name.localeCompare(b.color.name));
}

function normalizeCropRect(rect: CropRect | null): CropRect | null {
  if (!rect) return null;
  const x = clampUnit(rect.x);
  const y = clampUnit(rect.y);
  return {
    x,
    y,
    width: Math.max(0.001, Math.min(1 - x, Number.isFinite(rect.width) ? rect.width : 1)),
    height: Math.max(0.001, Math.min(1 - y, Number.isFinite(rect.height) ? rect.height : 1)),
  };
}

function parseDraftNumber(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseDraftFloat(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampDecimal(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  return Number(clamped.toFixed(3));
}

function formatModelNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function formatModelVector(vector: [number, number, number]): string {
  return vector.map(formatModelNumber).join(" x ");
}

function getLayerOccupiedCells(diagnostics: LayeredPattern["diagnostics"], layerIndex: number): number {
  return diagnostics?.occupiedCellsByLayer.find((layer) => layer.index === layerIndex)?.occupiedCells ?? 0;
}

function getLayerCellCount(layer: LayeredPattern["layers"][number], includeSupports: boolean): number {
  return layer.cells.reduce((count, cell, index) => {
    if (!cell) return count;
    if (!includeSupports && layer.supportCells?.[index]) return count;
    return count + 1;
  }, 0);
}

function isModelJobCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === MODEL_JOB_CANCELLED;
}

function normalizeRotationDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function applyPatternBackground(pattern: Pattern, colorId: string | null): Pattern {
  const backgroundCells = pattern.cells.map((cell) => !cell || Boolean(colorId && cell === colorId));
  return setPatternBackground({
    ...pattern,
    backgroundCells,
  }, colorId);
}

function setPatternSupportFlag(pattern: Pattern, x: number, y: number, isSupport: boolean): Pattern {
  if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return pattern;
  const supportCells = pattern.supportCells?.length === pattern.cells.length
    ? [...pattern.supportCells]
    : new Array<boolean>(pattern.cells.length).fill(false);
  supportCells[y * pattern.width + x] = isSupport;
  return {
    ...pattern,
    supportCells: supportCells.some(Boolean) ? supportCells : undefined,
  };
}

function syncLayeredPatternFromPattern(
  layeredPattern: LayeredPattern,
  activeLayerIndex: number,
  pattern: Pattern,
  includeSupports: boolean,
): LayeredPattern {
  const layer = layeredPattern.layers[activeLayerIndex];
  if (!layer) return layeredPattern;

  const cellCount = layeredPattern.width * layeredPattern.height;
  const previousSupportCells = getNormalizedSupportCells(layer, cellCount);
  let nextCells: Array<string | null>;
  let nextSupportCells: boolean[];

  if (includeSupports) {
    nextCells = [...pattern.cells];
    nextSupportCells = pattern.supportCells?.length === cellCount ? [...pattern.supportCells] : new Array<boolean>(cellCount).fill(false);
  } else {
    nextCells = [...layer.cells];
    nextSupportCells = [...previousSupportCells];

    for (let index = 0; index < cellCount; index += 1) {
      if (previousSupportCells[index] && !pattern.cells[index]) continue;
      nextCells[index] = pattern.cells[index] ?? null;
      nextSupportCells[index] = false;
    }
  }

  const layers = layeredPattern.layers.map((currentLayer, index) => index === activeLayerIndex
    ? {
        ...currentLayer,
        cells: nextCells,
        supportCells: nextSupportCells.some(Boolean) ? nextSupportCells : undefined,
      }
    : currentLayer);

  return recomputeLayeredPatternMetadata({
    ...layeredPattern,
    layers,
  });
}

function recomputeLayeredPatternMetadata(layeredPattern: LayeredPattern): LayeredPattern {
  const cellsByLayer = [];
  const supportColorIds = new Set<string>();
  let generatedCells = 0;

  for (const layer of layeredPattern.layers) {
    const supportCells = getNormalizedSupportCells(layer, layeredPattern.width * layeredPattern.height);
    const occupiedCells = supportCells.reduce((count, isSupport, index) => {
      const colorId = layer.cells[index];
      if (!isSupport || !colorId) return count;
      supportColorIds.add(colorId);
      return count + 1;
    }, 0);
    if (occupiedCells > 0) cellsByLayer.push({ index: layer.index, occupiedCells });
    generatedCells += occupiedCells;
  }

  const supportColorId = supportColorIds.size === 1
    ? [...supportColorIds][0]
    : layeredPattern.support?.colorId ?? DEFAULT_MODEL_SUPPORT_SETTINGS.colorId;
  const occupiedCellsByLayer = layeredPattern.layers.map((layer) => ({
    index: layer.index,
    occupiedCells: layer.cells.filter(Boolean).length,
  }));
  const nonEmptyLayerCount = occupiedCellsByLayer.filter((layer) => layer.occupiedCells > 0).length;

  return {
    ...layeredPattern,
    diagnostics: layeredPattern.diagnostics
      ? {
          ...layeredPattern.diagnostics,
          occupiedCellsByLayer,
          nonEmptyLayerCount,
          emptyLayerCount: Math.max(0, layeredPattern.diagnostics.generatedLayerCount - nonEmptyLayerCount),
        }
      : undefined,
    support: layeredPattern.support || generatedCells > 0
      ? {
          enabled: layeredPattern.support?.enabled ?? generatedCells > 0,
          colorId: supportColorId ?? DEFAULT_MODEL_SUPPORT_SETTINGS.colorId,
          generatedCells,
          cellsByLayer,
        }
      : undefined,
  };
}

function getNormalizedSupportCells(layer: LayeredPattern["layers"][number], cellCount: number): boolean[] {
  return layer.supportCells?.length === cellCount ? [...layer.supportCells] : new Array<boolean>(cellCount).fill(false);
}

function rotatePatternClockwise(pattern: Pattern): Pattern {
  const backgroundCells = pattern.backgroundCells?.length === pattern.cells.length ? pattern.backgroundCells : undefined;
  return {
    ...pattern,
    width: pattern.height,
    height: pattern.width,
    cells: rotateCellsClockwise(pattern.cells, pattern.width, pattern.height),
    backgroundCells: backgroundCells ? rotateCellsClockwise(backgroundCells, pattern.width, pattern.height) : undefined,
    settings: normalizeSettings({
      ...pattern.settings,
      width: pattern.height,
      height: pattern.width,
    }),
    source: pattern.source ? {
      ...pattern.source,
      width: pattern.source.height,
      height: pattern.source.width,
    } : undefined,
  };
}

function rotateLayeredPatternClockwise(layeredPattern: LayeredPattern): LayeredPattern {
  return {
    ...layeredPattern,
    width: layeredPattern.height,
    height: layeredPattern.width,
    layers: layeredPattern.layers.map((layer) => ({
      ...layer,
      cells: rotateCellsClockwise(layer.cells, layeredPattern.width, layeredPattern.height),
      supportCells: layer.supportCells ? rotateCellsClockwise(layer.supportCells, layeredPattern.width, layeredPattern.height) : undefined,
    })),
  };
}

function rotateCellsClockwise<T>(cells: T[], width: number, height: number): T[] {
  const rotated = new Array<T>(cells.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rotated[x * height + (height - 1 - y)] = cells[y * width + x];
    }
  }
  return rotated;
}

function clonePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    palette: [...pattern.palette],
    cells: [...pattern.cells],
    backgroundCells: pattern.backgroundCells ? [...pattern.backgroundCells] : undefined,
    supportCells: pattern.supportCells ? [...pattern.supportCells] : undefined,
    settings: cloneSettings(pattern.settings),
    source: pattern.source ? { ...pattern.source } : undefined,
  };
}

function cloneLayeredPattern(layeredPattern: LayeredPattern): LayeredPattern {
  return {
    ...layeredPattern,
    sourceModel: layeredPattern.sourceModel
      ? {
          ...layeredPattern.sourceModel,
          orientation: layeredPattern.sourceModel.orientation ? { ...layeredPattern.sourceModel.orientation } : undefined,
        }
      : undefined,
    layers: layeredPattern.layers.map((layer) => ({
      ...layer,
      cells: [...layer.cells],
      supportCells: layer.supportCells ? [...layer.supportCells] : undefined,
    })),
    palette: [...layeredPattern.palette],
    diagnostics: layeredPattern.diagnostics
      ? {
          ...layeredPattern.diagnostics,
          originalBounds: cloneBoundsSummary(layeredPattern.diagnostics.originalBounds),
          orientedBounds: cloneBoundsSummary(layeredPattern.diagnostics.orientedBounds),
          scaledSizeMm: cloneVector3(layeredPattern.diagnostics.scaledSizeMm),
          occupiedCellsByLayer: layeredPattern.diagnostics.occupiedCellsByLayer.map((layer) => ({ ...layer })),
        }
      : undefined,
    support: layeredPattern.support
      ? {
          ...layeredPattern.support,
          cellsByLayer: layeredPattern.support.cellsByLayer.map((layer) => ({ ...layer })),
        }
      : undefined,
  };
}

function cloneBoundsSummary(bounds: NonNullable<LayeredPattern["diagnostics"]>["originalBounds"]) {
  return {
    min: cloneVector3(bounds.min),
    max: cloneVector3(bounds.max),
    size: cloneVector3(bounds.size),
  };
}

function cloneVector3(vector: [number, number, number]): [number, number, number] {
  return [vector[0], vector[1], vector[2]];
}

function cloneSettings(settings: PatternSettings): PatternSettings {
  return {
    ...settings,
    sourceCrop: settings.sourceCrop ? { ...settings.sourceCrop } : null,
  };
}

export default App;
