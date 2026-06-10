import { formatModelNumber, formatModelVector, getLayerOccupiedCells } from "../lib/editorState";
import type { LayeredPattern } from "../types";

type SliceDiagnosticsProps = {
  activeLayerIndex: number;
  layeredPattern: LayeredPattern;
};

export function SliceDiagnostics({ activeLayerIndex, layeredPattern }: SliceDiagnosticsProps) {
  const modelDiagnostics = layeredPattern.diagnostics;
  if (!modelDiagnostics) return null;

  return (
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
          <strong>
            {modelDiagnostics.nonEmptyLayerCount} / {modelDiagnostics.generatedLayerCount}
          </strong>
        </div>
        <div className="diagnostic-item">
          <span>当前层</span>
          <strong>
            {getLayerOccupiedCells(
              modelDiagnostics,
              layeredPattern.layers[activeLayerIndex]?.index ?? activeLayerIndex,
            )}
          </strong>
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
  );
}
