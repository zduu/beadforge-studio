import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import { Layers, RotateCcw, RotateCw } from "lucide-react";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import { getLayerCellCount } from "../lib/editorState";
import type { LayeredPattern, ModelOrientation, ModelSupportSettings } from "../types";
import { SliceDiagnostics } from "./SliceDiagnostics";

type ModelSupportUiSettings = ModelSupportSettings & {
  showSupports: boolean;
};

type ModelSliceDrafts = {
  beadPitchMm: string;
  beadHeightMm: string;
  targetLayers: string;
};

type ModelPanelProps = {
  activeLayerIndex: number;
  handleDraftKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  isModelProcessing: boolean;
  layeredPattern: LayeredPattern | null;
  modelColorId: string;
  modelInputRef: RefObject<HTMLInputElement | null>;
  modelOrientation: ModelOrientation;
  modelSliceDrafts: ModelSliceDrafts;
  modelSourceFile: File | null;
  modelSupportSettings: ModelSupportUiSettings;
  onCommitModelSliceDrafts: () => void;
  onResetModelOrientation: () => void;
  onRotateModelOrientation: (axis: keyof ModelOrientation) => void;
  onSelectLayer: (layerIndex: number) => void;
  onSliceModel: () => void;
  onCancelModelJob: () => void;
  setModelColorId: Dispatch<SetStateAction<string>>;
  setModelSliceDrafts: Dispatch<SetStateAction<ModelSliceDrafts>>;
  updateModelSupportSettings: (partial: Partial<ModelSupportUiSettings>) => void;
};

export function ModelPanel({
  activeLayerIndex,
  handleDraftKeyDown,
  isModelProcessing,
  layeredPattern,
  modelColorId,
  modelInputRef,
  modelOrientation,
  modelSliceDrafts,
  modelSourceFile,
  modelSupportSettings,
  onCancelModelJob,
  onCommitModelSliceDrafts,
  onResetModelOrientation,
  onRotateModelOrientation,
  onSelectLayer,
  onSliceModel,
  setModelColorId,
  setModelSliceDrafts,
  updateModelSupportSettings,
}: ModelPanelProps) {
  return (
    <details className="model-panel">
      <summary>3D 模型</summary>
      <label className="field compact-field">
        <span>层数</span>
        <input
          min={0}
          placeholder="默认"
          type="number"
          value={modelSliceDrafts.targetLayers}
          onBlur={onCommitModelSliceDrafts}
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
          onBlur={onCommitModelSliceDrafts}
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
          onBlur={onCommitModelSliceDrafts}
          onChange={(event) => setModelSliceDrafts((drafts) => ({ ...drafts, beadHeightMm: event.target.value }))}
          onKeyDown={handleDraftKeyDown}
        />
      </label>
      <label className="field compact-field">
        <span>默认耗材</span>
        <select value={modelColorId} onChange={(event) => setModelColorId(event.target.value)}>
          {bambuPlaBasicColors.map((color) => (
            <option key={color.id} value={color.id}>
              {color.nameZh} · {color.code}
            </option>
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
              <option key={color.id} value={color.id}>
                {color.nameZh} · {color.code}
              </option>
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
          <button
            className="button"
            disabled={!modelSourceFile || isModelProcessing}
            onClick={() => onRotateModelOrientation("rotateXDeg")}
            title="绕 X 轴旋转"
            type="button"
          >
            <RotateCw size={16} />X
          </button>
          <button
            className="button"
            disabled={!modelSourceFile || isModelProcessing}
            onClick={() => onRotateModelOrientation("rotateYDeg")}
            title="绕 Y 轴旋转"
            type="button"
          >
            <RotateCw size={16} />Y
          </button>
          <button
            className="button"
            disabled={!modelSourceFile || isModelProcessing}
            onClick={() => onRotateModelOrientation("rotateZDeg")}
            title="绕 Z 轴旋转"
            type="button"
          >
            <RotateCw size={16} />Z
          </button>
          <button
            className="button"
            disabled={!modelSourceFile || isModelProcessing}
            onClick={onResetModelOrientation}
            title="重置模型方向"
            type="button"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <button
        className="button full"
        disabled={isModelProcessing}
        onClick={() => modelInputRef.current?.click()}
        type="button"
      >
        <Layers size={18} />
        上传模型
      </button>
      <button
        className="button primary full"
        disabled={!modelSourceFile || isModelProcessing}
        onClick={onSliceModel}
        type="button"
      >
        <Layers size={18} />
        {layeredPattern ? "重新切片" : "开始切片"}
      </button>
      {isModelProcessing && (
        <button className="button full" onClick={onCancelModelJob} type="button">
          取消本机处理
        </button>
      )}
      {layeredPattern && (
        <div className="layer-list">
          {layeredPattern.layers.map((layer, index) => (
            <button
              className={`layer-button ${activeLayerIndex === index ? "active" : ""}`}
              key={layer.index}
              onClick={() => onSelectLayer(index)}
              type="button"
            >
              <span>{index + 1}</span>
              <strong>{getLayerCellCount(layer, modelSupportSettings.showSupports)}</strong>
            </button>
          ))}
        </div>
      )}
      {layeredPattern && <SliceDiagnostics activeLayerIndex={activeLayerIndex} layeredPattern={layeredPattern} />}
    </details>
  );
}
