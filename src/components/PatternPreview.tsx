import { useEffect, useRef } from "react";
import { isPatternBackgroundCell } from "../lib/pattern";
import type { Pattern } from "../types";

type PatternPreviewProps = {
  pattern: Pattern | null;
  selectedColorId: string | null;
  zoom: number;
  interactionMode: "brush" | "eraser" | "inspect";
  onCellClick: (x: number, y: number) => void;
};

export function PatternPreview({ pattern, selectedColorId, zoom, interactionMode, onCellClick }: PatternPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    isPointerDown: false,
    isDragging: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const draw = () => {
      const context = canvas.getContext("2d");
      if (!context) return;

      const box = wrapper.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const baseSize = Math.max(280, Math.min(box.width, box.height || box.width));
      const cssSize = baseSize * zoom;
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      canvas.width = Math.round(cssSize * pixelRatio);
      canvas.height = Math.round(cssSize * pixelRatio);
      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, cssSize, cssSize);

      context.fillStyle = "#f7f8fa";
      context.fillRect(0, 0, cssSize, cssSize);

      if (!pattern) {
        drawEmptyState(context, cssSize);
        return;
      }

      const colorById = new Map(pattern.palette.map((color) => [color.id, color]));
      const cellSize = cssSize / Math.max(pattern.width, pattern.height);
      const offsetX = (cssSize - pattern.width * cellSize) / 2;
      const offsetY = (cssSize - pattern.height * cellSize) / 2;

      for (let y = 0; y < pattern.height; y += 1) {
        for (let x = 0; x < pattern.width; x += 1) {
          const cell = pattern.cells[y * pattern.width + x];
          const index = y * pattern.width + x;
          const isBackground = isPatternBackgroundCell(pattern, y * pattern.width + x);
          const isSupport = pattern.supportCells?.[index] === true;
          const color = cell ? colorById.get(cell) : null;
          const isSelected = Boolean(selectedColorId && cell === selectedColorId && !isBackground);
          const isDimmed = Boolean(selectedColorId && !isSelected);
          const left = offsetX + x * cellSize;
          const top = offsetY + y * cellSize;
          const displayHex = color?.hex;

          context.fillStyle = isBackground ? "#ffffff" : (displayHex ?? "#ffffff");
          context.fillRect(left, top, cellSize, cellSize);

          if (color && !isBackground) {
            context.beginPath();
            context.arc(left + cellSize / 2, top + cellSize / 2, Math.max(1.5, cellSize * 0.34), 0, Math.PI * 2);
            context.fillStyle = displayHex ?? color.hex;
            context.fill();
          } else {
            context.fillStyle = "#f0f2f5";
            context.fillRect(left + 3, top + 3, Math.max(1, cellSize - 6), Math.max(1, cellSize - 6));
          }

          if (isDimmed) {
            context.fillStyle = "rgba(15, 23, 42, 0.58)";
            context.fillRect(left, top, cellSize, cellSize);
          }

          if (isSupport && !isBackground && cellSize >= 12) {
            context.fillStyle = "rgba(24, 34, 48, 0.86)";
            context.font = `${Math.max(9, Math.round(cellSize * 0.34))}px Arial, sans-serif`;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("S", left + cellSize / 2, top + cellSize / 2);
          }

          context.strokeStyle = color && !isBackground ? "rgba(0, 0, 0, 0.14)" : "rgba(0, 0, 0, 0.08)";
          context.lineWidth = 1;
          context.stroke();

          if (isSelected) {
            context.strokeStyle = "rgba(255, 255, 255, 0.92)";
            context.lineWidth = Math.max(2, cellSize * 0.1);
            context.strokeRect(left + 2, top + 2, cellSize - 4, cellSize - 4);
            context.strokeStyle = "rgba(15, 23, 42, 0.86)";
            context.lineWidth = Math.max(2, cellSize * 0.07);
            context.strokeRect(left + 3, top + 3, cellSize - 6, cellSize - 6);
          }
        }
      }

      context.strokeStyle = "rgba(15, 23, 42, 0.24)";
      context.lineWidth = 1;
      for (let x = 0; x <= pattern.width; x += 1) {
        const left = offsetX + x * cellSize;
        context.beginPath();
        context.moveTo(left, offsetY);
        context.lineTo(left, offsetY + pattern.height * cellSize);
        context.stroke();
      }
      for (let y = 0; y <= pattern.height; y += 1) {
        const top = offsetY + y * cellSize;
        context.beginPath();
        context.moveTo(offsetX, top);
        context.lineTo(offsetX + pattern.width * cellSize, top);
        context.stroke();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [pattern, selectedColorId, zoom]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      return;
    }

    if (!pattern) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const size = rect.width;
    const cellSize = size / Math.max(pattern.width, pattern.height);
    const offsetX = (size - pattern.width * cellSize) / 2;
    const offsetY = (size - pattern.height * cellSize) / 2;
    const x = Math.floor((event.clientX - rect.left - offsetX) / cellSize);
    const y = Math.floor((event.clientY - rect.top - offsetY) / cellSize);
    onCellClick(x, y);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || event.button !== 0) return;
    if (event.target === canvas && !event.altKey) return;

    dragStateRef.current = {
      isPointerDown: true,
      isDragging: false,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: wrapper.scrollLeft,
      scrollTop: wrapper.scrollTop,
    };
    wrapper.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current;
    const state = dragStateRef.current;
    if (!wrapper || !state.isPointerDown) return;

    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (!state.isDragging && Math.hypot(deltaX, deltaY) > 4) {
      state.isDragging = true;
      suppressClickRef.current = true;
    }

    if (state.isDragging) {
      wrapper.scrollLeft = state.scrollLeft - deltaX;
      wrapper.scrollTop = state.scrollTop - deltaY;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current;
    const state = dragStateRef.current;
    if (!wrapper || !state.isPointerDown) return;

    if (state.isDragging) {
      suppressClickRef.current = true;
    }
    dragStateRef.current = { ...state, isPointerDown: false, isDragging: false };
    wrapper.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={`preview-shell preview-tool-${interactionMode}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      ref={wrapperRef}
    >
      <canvas aria-label="拼豆图纸预览" className="pattern-canvas" onClick={handleClick} ref={canvasRef} />
    </div>
  );
}

function drawEmptyState(context: CanvasRenderingContext2D, size: number) {
  const grid = 16;
  const cell = size / grid;

  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      context.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#eef2f6";
      context.fillRect(x * cell, y * cell, cell, cell);
      context.beginPath();
      context.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
      context.fillStyle = "rgba(100, 116, 139, 0.22)";
      context.fill();
    }
  }
}
