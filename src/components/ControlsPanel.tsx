import type { Dispatch, KeyboardEvent, ReactNode, SetStateAction } from "react";
import { RotateCcw, Upload } from "lucide-react";
import { CropSelector } from "./CropSelector";
import type { CropRect, FitMode, Pattern, PatternSettings, SampleMode } from "../types";

type CropMode = "source" | "preview";

type SettingDrafts = {
  width: string;
  height: string;
  maxColors: string;
};

type ControlsPanelProps = {
  children: ReactNode;
  commitDraftSettings: () => void;
  cropMode: CropMode;
  handleApplyPreviewCrop: () => void;
  handleApplySourceCrop: () => void;
  handleClearSourceCrop: () => void;
  handleDraftKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  isProcessing: boolean;
  onGeneratePattern: () => void;
  pattern: Pattern | null;
  previewCropRect: CropRect | null;
  setCropMode: Dispatch<SetStateAction<CropMode>>;
  setPreviewCropRect: Dispatch<SetStateAction<CropRect | null>>;
  setSettingDrafts: Dispatch<SetStateAction<SettingDrafts>>;
  settingDrafts: SettingDrafts;
  settings: PatternSettings;
  sizePresets: number[];
  sourceFile: File | null;
  sourceImageUrl: string | null;
  updateSettings: (partial: Partial<PatternSettings>, regenerate?: boolean) => void;
};

export function ControlsPanel({
  children,
  commitDraftSettings,
  cropMode,
  handleApplyPreviewCrop,
  handleApplySourceCrop,
  handleClearSourceCrop,
  handleDraftKeyDown,
  isProcessing,
  onGeneratePattern,
  pattern,
  previewCropRect,
  setCropMode,
  setPreviewCropRect,
  setSettingDrafts,
  settingDrafts,
  settings,
  sizePresets,
  sourceFile,
  sourceImageUrl,
  updateSettings,
}: ControlsPanelProps) {
  return (
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
        {sizePresets.map((size) => (
          <button
            className="preset-button"
            key={size}
            onClick={() => updateSettings({ width: size, height: size })}
            type="button"
          >
            {size}
          </button>
        ))}
      </div>

      <label className="field">
        <span>图片适配</span>
        <select
          value={settings.fitMode}
          onChange={(event) => updateSettings({ fitMode: event.target.value as FitMode })}
        >
          <option value="contain">完整留白</option>
          <option value="cover">裁剪填满</option>
          <option value="stretch">拉伸</option>
        </select>
      </label>

      <label className="field">
        <span>取样</span>
        <select
          value={settings.sampleMode}
          onChange={(event) => updateSettings({ sampleMode: event.target.value as SampleMode })}
        >
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
          <button
            className={cropMode === "preview" ? "active" : ""}
            onClick={() => setCropMode("preview")}
            type="button"
          >
            预览图剪裁
          </button>
        </div>
        <CropSelector
          imageUrl={sourceImageUrl}
          mode={cropMode === "source" ? "image" : "pattern"}
          onRectChange={cropMode === "source" ? updateSourceCrop(updateSettings) : setPreviewCropRect}
          pattern={pattern}
          rect={cropMode === "source" ? settings.sourceCrop : previewCropRect}
        />
        <div className="crop-actions">
          {cropMode === "source" ? (
            <>
              <button
                className="button"
                disabled={!sourceFile || !settings.sourceCrop || isProcessing}
                onClick={handleApplySourceCrop}
                type="button"
              >
                应用原图裁剪
              </button>
              <button
                className="button"
                disabled={!settings.sourceCrop || isProcessing}
                onClick={handleClearSourceCrop}
                type="button"
              >
                清除
              </button>
            </>
          ) : (
            <>
              <button
                className="button"
                disabled={!pattern || !previewCropRect}
                onClick={handleApplyPreviewCrop}
                type="button"
              >
                应用预览裁剪
              </button>
              <button
                className="button"
                disabled={!previewCropRect}
                onClick={() => setPreviewCropRect(null)}
                type="button"
              >
                清除
              </button>
            </>
          )}
        </div>
        <label className="toggle-field">
          <input
            checked={settings.mirrorX}
            onChange={(event) => updateSettings({ mirrorX: event.target.checked })}
            type="checkbox"
          />
          <span>水平镜像</span>
        </label>
      </div>

      <button className="button full" disabled={!sourceFile || isProcessing} onClick={onGeneratePattern} type="button">
        <Upload size={18} />
        重新生成
      </button>

      {children}
    </aside>
  );
}

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

function updateSourceCrop(updateSettings: ControlsPanelProps["updateSettings"]) {
  return (rect: CropRect | null) => updateSettings({ sourceCrop: rect }, false);
}
