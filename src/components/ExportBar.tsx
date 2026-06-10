import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { Download, FileJson, FileSpreadsheet, Layers, Palette, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import {
  downloadLayeredColorsJson,
  downloadLayeredPatternJson,
  downloadPatternJson,
  downloadPatternPng,
  downloadUsageCsv,
} from "../lib/export";
import type { LayeredPattern, ModelPreviewData, Pattern } from "../types";

export type PreviewMode = "layer" | "model" | "source-model";

type ExportBarProps = {
  isExportingProductionPack: boolean;
  isLayeredModelPreview: boolean;
  isSourceModelPreview: boolean;
  layeredPattern: LayeredPattern | null;
  modelPreviewData: ModelPreviewData | null;
  onCommitPreviewZoomDraft: () => void;
  onDraftKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onExportProductionPack: () => void;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onPreviewZoomChange: Dispatch<SetStateAction<number>>;
  onRotateCurrentView: () => void;
  pattern: Pattern | null;
  previewMode: PreviewMode;
  previewZoomDraft: string;
  setPreviewZoomDraft: Dispatch<SetStateAction<string>>;
};

export function ExportBar({
  isExportingProductionPack,
  isLayeredModelPreview,
  isSourceModelPreview,
  layeredPattern,
  modelPreviewData,
  onCommitPreviewZoomDraft,
  onDraftKeyDown,
  onExportProductionPack,
  onPreviewModeChange,
  onPreviewZoomChange,
  onRotateCurrentView,
  pattern,
  previewMode,
  previewZoomDraft,
  setPreviewZoomDraft,
}: ExportBarProps) {
  return (
    <div className="export-actions">
      {!isLayeredModelPreview && !isSourceModelPreview && (
        <div className="zoom-actions" aria-label="预览缩放">
          <button
            className="icon-button"
            onClick={() => onPreviewZoomChange((zoom) => Math.max(0.1, Number((zoom - 0.25).toFixed(2))))}
            title="缩小"
            type="button"
          >
            <ZoomOut size={18} />
          </button>
          <label className="zoom-input-label">
            <input
              aria-label="预览缩放百分比"
              inputMode="decimal"
              type="number"
              value={previewZoomDraft}
              onBlur={onCommitPreviewZoomDraft}
              onChange={(event) => setPreviewZoomDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
            />
            <span>%</span>
          </label>
          <button
            className="icon-button"
            onClick={() => onPreviewZoomChange((zoom) => Math.min(8, Number((zoom + 0.25).toFixed(2))))}
            title="放大"
            type="button"
          >
            <ZoomIn size={18} />
          </button>
        </div>
      )}
      {(modelPreviewData || layeredPattern) && (
        <div
          className={`segmented-control ${modelPreviewData && layeredPattern ? "three-way" : modelPreviewData ? "one-way" : ""}`}
          aria-label="预览模式"
        >
          {modelPreviewData && (
            <button
              className={previewMode === "source-model" ? "active" : ""}
              onClick={() => onPreviewModeChange("source-model")}
              type="button"
            >
              原模型
            </button>
          )}
          {layeredPattern && (
            <>
              <button
                className={previewMode === "layer" ? "active" : ""}
                onClick={() => onPreviewModeChange("layer")}
                type="button"
              >
                当前层
              </button>
              <button
                className={previewMode === "model" ? "active" : ""}
                onClick={() => onPreviewModeChange("model")}
                type="button"
              >
                整体
              </button>
            </>
          )}
        </div>
      )}
      {pattern && !isLayeredModelPreview && !isSourceModelPreview && (
        <button className="icon-button" onClick={onRotateCurrentView} title="顺时针旋转" type="button">
          <RotateCw size={18} />
        </button>
      )}
      <button
        className="icon-button"
        disabled={!pattern}
        onClick={() => pattern && downloadPatternPng(pattern)}
        title="导出 PNG"
        type="button"
      >
        <Download size={18} />
      </button>
      <button
        className="icon-button"
        disabled={!pattern}
        onClick={() => pattern && downloadUsageCsv(pattern)}
        title="导出 CSV"
        type="button"
      >
        <FileSpreadsheet size={18} />
      </button>
      <button
        className="icon-button"
        disabled={!pattern}
        onClick={() => pattern && downloadPatternJson(pattern)}
        title="导出 JSON"
        type="button"
      >
        <FileJson size={18} />
      </button>
      <button
        className="icon-button"
        disabled={!layeredPattern}
        onClick={() => layeredPattern && downloadLayeredPatternJson(layeredPattern)}
        title="导出多层 JSON"
        type="button"
      >
        <Layers size={18} />
      </button>
      <button
        className="icon-button"
        disabled={!layeredPattern}
        onClick={() => layeredPattern && downloadLayeredColorsJson(layeredPattern)}
        title="导出颜色 JSON"
        type="button"
      >
        <Palette size={18} />
      </button>
      <button
        className="icon-button"
        disabled={!layeredPattern || isExportingProductionPack}
        onClick={onExportProductionPack}
        title="导出制作包 ZIP"
        type="button"
      >
        <Download size={18} />
      </button>
    </div>
  );
}
