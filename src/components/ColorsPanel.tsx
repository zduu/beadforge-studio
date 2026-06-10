import type { Dispatch, SetStateAction } from "react";
import { Brush, Eraser, Search, Undo2 } from "lucide-react";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import type { ColorUsage, Pattern } from "../types";

type EditTool = "brush" | "eraser" | "inspect";

type InspectInfo = {
  x: number;
  y: number;
  colorName: string;
  colorCode: string;
};

type ColorsPanelProps = {
  allPatternColors: ColorUsage[];
  backgroundColorId: string | null;
  editTool: EditTool;
  inspectInfo: InspectInfo | null;
  onBackgroundChange: (colorId: string) => void;
  onReplaceColor: (toId: string) => void;
  onToggleSelectedColor: (colorId: string) => void;
  onUndo: () => void;
  paintColorId: string;
  pattern: Pattern | null;
  selectedColorId: string | null;
  setEditTool: Dispatch<SetStateAction<EditTool>>;
  setPaintColorId: Dispatch<SetStateAction<string>>;
  setSelectedColorId: Dispatch<SetStateAction<string | null>>;
  totalBeads: number;
  undoStackLength: number;
  usage: ColorUsage[];
};

export function ColorsPanel({
  allPatternColors,
  backgroundColorId,
  editTool,
  inspectInfo,
  onBackgroundChange,
  onReplaceColor,
  onToggleSelectedColor,
  onUndo,
  paintColorId,
  pattern,
  selectedColorId,
  setEditTool,
  setPaintColorId,
  setSelectedColorId,
  totalBeads,
  undoStackLength,
  usage,
}: ColorsPanelProps) {
  return (
    <aside className="panel colors-panel">
      <div className="panel-heading">
        <h2>颜色</h2>
        <span className="count-pill">{totalBeads} 颗</span>
      </div>

      <div className="tool-switch" aria-label="编辑工具">
        <button
          className={editTool === "brush" ? "active" : ""}
          onClick={() => setEditTool("brush")}
          title="画笔"
          type="button"
        >
          <Brush size={16} />
          画笔
        </button>
        <button
          className={editTool === "eraser" ? "active" : ""}
          onClick={() => setEditTool("eraser")}
          title="橡皮"
          type="button"
        >
          <Eraser size={16} />
          橡皮
        </button>
        <button
          className={editTool === "inspect" ? "active" : ""}
          onClick={() => setEditTool("inspect")}
          title="查看"
          type="button"
        >
          <Search size={16} />
          查看
        </button>
      </div>

      <button className="button full undo-button" disabled={undoStackLength === 0} onClick={onUndo} type="button">
        <Undo2 size={18} />
        回退
      </button>

      <label className="field">
        <span>画笔</span>
        <select value={paintColorId} onChange={(event) => setPaintColorId(event.target.value)}>
          {bambuPlaBasicColors.map((color) => (
            <option key={color.id} value={color.id}>
              {color.nameZh} · {color.code}
            </option>
          ))}
        </select>
      </label>

      {inspectInfo && (
        <div className="inspect-box">
          <span>坐标</span>
          <strong>
            {inspectInfo.x}, {inspectInfo.y}
          </strong>
          <small>
            {inspectInfo.colorName} · {inspectInfo.colorCode}
          </small>
        </div>
      )}

      <label className="field">
        <span>背景色</span>
        <select
          value={backgroundColorId ?? ""}
          disabled={!pattern}
          onChange={(event) => onBackgroundChange(event.target.value)}
        >
          <option value="">不排除</option>
          {allPatternColors.map(({ color }) => (
            <option key={color.id} value={color.id}>
              {color.nameZh} · {color.code}
            </option>
          ))}
        </select>
      </label>

      {selectedColorId && (
        <div className="replace-panel">
          <label className="field compact-field">
            <span>替换为</span>
            <select value={selectedColorId} onChange={(event) => onReplaceColor(event.target.value)}>
              {bambuPlaBasicColors.map((color) => (
                <option key={color.id} value={color.id}>
                  {color.nameZh} · {color.code}
                </option>
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
            onClick={() => onToggleSelectedColor(color.id)}
            type="button"
          >
            <span className="swatch" style={{ backgroundColor: color.hex }} />
            <span className="usage-name">
              <strong>{color.nameZh}</strong>
              <small>
                {color.name} · {color.code} · {color.hex}
              </small>
            </span>
            <span className="usage-count">{count}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
