import { colorById } from "../data/bambuPlaBasic";
import type { LayeredPattern, Pattern } from "../types";
import { getColorUsage, isPatternBackgroundCell } from "./pattern";

export function renderPatternToCanvas(pattern: Pattern, cellSize = 24, showGrid = true): HTMLCanvasElement {
  const margin = 34;
  const canvas = document.createElement("canvas");
  canvas.width = margin + pattern.width * cellSize + 1;
  canvas.height = margin + pattern.height * cellSize + 1;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建导出 Canvas");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "12px Arial, sans-serif";
  context.fillStyle = "#344054";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (let x = 0; x < pattern.width; x += 1) {
    context.fillText(String(x + 1), margin + x * cellSize + cellSize / 2, 16);
  }

  context.textAlign = "right";
  for (let y = 0; y < pattern.height; y += 1) {
    context.fillText(String(y + 1), margin - 8, margin + y * cellSize + cellSize / 2);
  }

  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      const cell = pattern.cells[y * pattern.width + x];
      const isBackground = isPatternBackgroundCell(pattern, y * pattern.width + x);
      const color = cell ? colorById.get(cell) : null;
      const left = margin + x * cellSize;
      const top = margin + y * cellSize;
      context.fillStyle = isBackground ? "#ffffff" : color?.hex ?? "#ffffff";
      context.fillRect(left, top, cellSize, cellSize);

      if (!color || isBackground) {
        context.fillStyle = "#f3f4f6";
        context.fillRect(left + 3, top + 3, cellSize - 6, cellSize - 6);
      }
    }
  }

  if (showGrid) {
    context.strokeStyle = "rgba(16, 24, 40, 0.28)";
    context.lineWidth = 1;
    for (let x = 0; x <= pattern.width; x += 1) {
      const left = margin + x * cellSize + 0.5;
      context.beginPath();
      context.moveTo(left, margin);
      context.lineTo(left, margin + pattern.height * cellSize);
      context.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 1) {
      const top = margin + y * cellSize + 0.5;
      context.beginPath();
      context.moveTo(margin, top);
      context.lineTo(margin + pattern.width * cellSize, top);
      context.stroke();
    }
  }

  return canvas;
}

export function downloadPatternPng(pattern: Pattern): void {
  const canvas = renderPatternToCanvas(pattern);
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `${getBaseName(pattern)}-pattern.png`);
  }, "image/png");
}

export function downloadPatternJson(pattern: Pattern): void {
  const blob = new Blob([JSON.stringify(pattern, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${getBaseName(pattern)}-pattern.json`);
}

export function downloadUsageCsv(pattern: Pattern): void {
  const rows = [
    ["brand", "filament_type", "code", "name_zh", "name", "hex", "bead_count"],
    ...getColorUsage(pattern).map(({ color, count }) => [
      color.brand,
      color.filamentType,
      color.code,
      color.nameZh,
      color.name,
      color.hex,
      String(count),
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${getBaseName(pattern)}-colors.csv`);
}

export function downloadLayeredPatternJson(layeredPattern: LayeredPattern): void {
  const blob = new Blob([JSON.stringify(layeredPattern, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${getLayeredBaseName(layeredPattern)}-layered-pattern.json`);
}

export function downloadLayeredColorsJson(layeredPattern: LayeredPattern): void {
  const usage = getLayeredUsage(layeredPattern);
  const colorPlan = {
    version: 1,
    sourceModel: layeredPattern.sourceModel,
    palette: layeredPattern.palette,
    assignments: layeredPattern.layers.map((layer) => ({
      targetType: "layer",
      targetId: String(layer.index),
      colors: [...new Set(layer.cells.filter(Boolean))],
    })),
    usage,
  };
  const blob = new Blob([JSON.stringify(colorPlan, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${getLayeredBaseName(layeredPattern)}-colors.json`);
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function getLayeredUsage(layeredPattern: LayeredPattern) {
  const counts = new Map<string, { beadCount: number; layers: Set<number> }>();

  for (const layer of layeredPattern.layers) {
    for (const cell of layer.cells) {
      if (!cell) continue;
      const current = counts.get(cell) ?? { beadCount: 0, layers: new Set<number>() };
      current.beadCount += 1;
      current.layers.add(layer.index);
      counts.set(cell, current);
    }
  }

  return [...counts.entries()].map(([colorId, value]) => ({
    colorId,
    beadCount: value.beadCount,
    layers: [...value.layers].sort((a, b) => a - b),
  }));
}

function getBaseName(pattern: Pattern): string {
  return (pattern.source?.fileName ?? "bead-pattern")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9\-_]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "bead-pattern";
}

function getLayeredBaseName(layeredPattern: LayeredPattern): string {
  return (layeredPattern.sourceModel?.fileName ?? "layered-bead-pattern")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9\-_]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "layered-bead-pattern";
}
