import { type PointerEvent, useCallback, useEffect, useRef } from "react";
import { isPatternBackgroundCell } from "../lib/pattern";
import type { CropRect, Pattern } from "../types";

type CropSelectorProps = {
  mode: "image" | "pattern";
  imageUrl?: string | null;
  pattern?: Pattern | null;
  rect: CropRect | null;
  onRectChange: (rect: CropRect | null) => void;
};

type DrawMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function CropSelector({ mode, imageUrl, pattern, rect, onRectChange }: CropSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const metricsRef = useRef<DrawMetrics>({ left: 0, top: 0, width: 1, height: 1 });
  const dragRef = useRef<{ active: boolean; anchorX: number; anchorY: number }>({
    active: false,
    anchorX: 0,
    anchorY: 0,
  });

  const drawSelector = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const box = wrapper.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const cssWidth = Math.max(180, box.width);
    const sourceRatio = getSourceRatio(mode, imageRef.current, pattern);
    const cssHeight = Math.max(150, Math.min(260, cssWidth / sourceRatio));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, cssWidth, cssHeight);

    const metrics = getContentMetrics(cssWidth, cssHeight, sourceRatio);
    metricsRef.current = metrics;
    drawContent(context, mode, imageRef.current, pattern, metrics);

    context.strokeStyle = "rgba(15, 23, 42, 0.2)";
    context.lineWidth = 1;
    context.strokeRect(metrics.left, metrics.top, metrics.width, metrics.height);

    if (rect) {
      const crop = rectToCanvas(rect, metrics);
      context.fillStyle = "rgba(15, 23, 42, 0.46)";
      context.fillRect(metrics.left, metrics.top, metrics.width, crop.top - metrics.top);
      context.fillRect(
        metrics.left,
        crop.top + crop.height,
        metrics.width,
        metrics.top + metrics.height - crop.top - crop.height,
      );
      context.fillRect(metrics.left, crop.top, crop.left - metrics.left, crop.height);
      context.fillRect(
        crop.left + crop.width,
        crop.top,
        metrics.left + metrics.width - crop.left - crop.width,
        crop.height,
      );
      context.strokeStyle = "#ffffff";
      context.lineWidth = 3;
      context.strokeRect(crop.left, crop.top, crop.width, crop.height);
      context.strokeStyle = "#0f766e";
      context.lineWidth = 2;
      context.strokeRect(crop.left + 1, crop.top + 1, Math.max(0, crop.width - 2), Math.max(0, crop.height - 2));
    }
  }, [mode, pattern, rect]);

  useEffect(() => {
    if (mode !== "image" || !imageUrl) {
      imageRef.current = null;
      drawSelector();
      return;
    }

    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      drawSelector();
    };
    image.src = imageUrl;
  }, [drawSelector, imageUrl, mode]);

  useEffect(() => {
    drawSelector();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver(drawSelector);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [drawSelector]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!hasDrawable(mode, imageRef.current, pattern) || event.button !== 0) return;
    const point = eventToUnitPoint(event, metricsRef.current);
    dragRef.current = { active: true, anchorX: point.x, anchorY: point.y };
    onRectChange({ x: point.x, y: point.y, width: 0.001, height: 0.001 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    const point = eventToUnitPoint(event, metricsRef.current);
    onRectChange(normalizeDragRect(drag.anchorX, drag.anchorY, point.x, point.y));
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="crop-selector" ref={wrapperRef}>
      <canvas
        aria-label={mode === "image" ? "原图裁剪框" : "预览图裁剪框"}
        className="crop-canvas"
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
      />
    </div>
  );
}

function getSourceRatio(mode: "image" | "pattern", image: HTMLImageElement | null, pattern?: Pattern | null): number {
  if (mode === "image" && image) return image.width / image.height;
  if (mode === "pattern" && pattern) return pattern.width / pattern.height;
  return 1;
}

function hasDrawable(mode: "image" | "pattern", image: HTMLImageElement | null, pattern?: Pattern | null): boolean {
  return mode === "image" ? Boolean(image) : Boolean(pattern);
}

function getContentMetrics(width: number, height: number, ratio: number): DrawMetrics {
  const useWidth = width / height < ratio;
  const contentWidth = useWidth ? width : height * ratio;
  const contentHeight = useWidth ? width / ratio : height;
  return {
    left: (width - contentWidth) / 2,
    top: (height - contentHeight) / 2,
    width: contentWidth,
    height: contentHeight,
  };
}

function drawContent(
  context: CanvasRenderingContext2D,
  mode: "image" | "pattern",
  image: HTMLImageElement | null,
  pattern: Pattern | null | undefined,
  metrics: DrawMetrics,
) {
  if (mode === "image") {
    if (image) {
      context.drawImage(image, metrics.left, metrics.top, metrics.width, metrics.height);
    } else {
      drawEmpty(context, metrics, "上传图片后拖拽裁剪框");
    }
    return;
  }

  if (!pattern) {
    drawEmpty(context, metrics, "生成图纸后拖拽裁剪框");
    return;
  }

  const cellSize = Math.min(metrics.width / pattern.width, metrics.height / pattern.height);
  const left = metrics.left + (metrics.width - cellSize * pattern.width) / 2;
  const top = metrics.top + (metrics.height - cellSize * pattern.height) / 2;
  const colorByPatternId = new Map(pattern.palette.map((item) => [item.id, item]));
  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      const index = y * pattern.width + x;
      const color = pattern.cells[index] ? colorByPatternId.get(pattern.cells[index] ?? "") : null;
      context.fillStyle = color && !isPatternBackgroundCell(pattern, index) ? color.hex : "#ffffff";
      context.fillRect(left + x * cellSize, top + y * cellSize, cellSize, cellSize);
    }
  }
}

function drawEmpty(context: CanvasRenderingContext2D, metrics: DrawMetrics, text: string) {
  context.fillStyle = "#ffffff";
  context.fillRect(metrics.left, metrics.top, metrics.width, metrics.height);
  context.fillStyle = "#667085";
  context.font = "13px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, metrics.left + metrics.width / 2, metrics.top + metrics.height / 2);
}

function eventToUnitPoint(event: PointerEvent<HTMLCanvasElement>, metrics: DrawMetrics) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clampUnit((event.clientX - rect.left - metrics.left) / metrics.width),
    y: clampUnit((event.clientY - rect.top - metrics.top) / metrics.height),
  };
}

function normalizeDragRect(startX: number, startY: number, endX: number, endY: number): CropRect {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.max(0.001, Math.abs(endX - startX)),
    height: Math.max(0.001, Math.abs(endY - startY)),
  };
}

function rectToCanvas(rect: CropRect, metrics: DrawMetrics) {
  return {
    left: metrics.left + rect.x * metrics.width,
    top: metrics.top + rect.y * metrics.height,
    width: rect.width * metrics.width,
    height: rect.height * metrics.height,
  };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
