import { strToU8, zipSync } from "three/examples/jsm/libs/fflate.module.js";
import type { LayeredPattern, Pattern } from "../types";
import { layeredPatternToPattern } from "./layeredPattern";
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
  const colorById = new Map(pattern.palette.map((color) => [color.id, color]));

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
      const isSupport = pattern.supportCells?.[y * pattern.width + x] === true;
      const color = cell ? colorById.get(cell) : null;
      const left = margin + x * cellSize;
      const top = margin + y * cellSize;
      context.fillStyle = isBackground ? "#ffffff" : (color?.hex ?? "#ffffff");
      context.fillRect(left, top, cellSize, cellSize);

      if (!color || isBackground) {
        context.fillStyle = "#f3f4f6";
        context.fillRect(left + 3, top + 3, cellSize - 6, cellSize - 6);
      }

      if (isSupport && !isBackground) {
        context.fillStyle = "rgba(24, 34, 48, 0.84)";
        context.font = `${Math.max(10, Math.round(cellSize * 0.42))}px Arial, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("S", left + cellSize / 2, top + cellSize / 2);
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
    support: layeredPattern.support ?? {
      enabled: false,
      colorId: null,
      generatedCells: 0,
      cellsByLayer: [],
    },
    palette: layeredPattern.palette,
    assignments: layeredPattern.layers.map((layer) => {
      const modelColorIds = new Set<string>();
      const supportColorIds = new Set<string>();

      for (let index = 0; index < layer.cells.length; index += 1) {
        const colorId = layer.cells[index];
        if (!colorId) continue;
        if (layer.supportCells?.[index]) {
          supportColorIds.add(colorId);
        } else {
          modelColorIds.add(colorId);
        }
      }

      return {
        targetType: "layer",
        targetId: String(layer.index),
        colors: [...modelColorIds],
        supportColors: [...supportColorIds],
        supportCellCount: layer.supportCells?.filter(Boolean).length ?? 0,
      };
    }),
    usage,
  };
  const blob = new Blob([JSON.stringify(colorPlan, null, 2)], { type: "application/json" });
  downloadBlob(blob, `${getLayeredBaseName(layeredPattern)}-colors.json`);
}

export async function downloadLayeredProductionZip(layeredPattern: LayeredPattern): Promise<void> {
  const baseName = getLayeredBaseName(layeredPattern);
  const files: Record<string, Uint8Array> = {};

  files[`${baseName}/project/${baseName}-layered-pattern.json`] = strToU8(JSON.stringify(layeredPattern, null, 2));
  files[`${baseName}/project/${baseName}-colors.json`] = strToU8(
    JSON.stringify(createLayeredColorPlan(layeredPattern), null, 2),
  );
  files[`${baseName}/stats/${baseName}-total-colors.csv`] = strToU8(createLayeredUsageCsv(layeredPattern));

  for (let layerIndex = 0; layerIndex < layeredPattern.layers.length; layerIndex += 1) {
    const layer = layeredPattern.layers[layerIndex];
    if (!layer) continue;

    const layerNumber = String(layerIndex + 1).padStart(3, "0");
    const layerName = `${baseName}-layer-${layerNumber}-${layeredPattern.width}x${layeredPattern.height}`;
    const pattern = layeredPatternToPattern(layeredPattern, layerIndex, { includeSupports: true });
    const pngBlob = await renderPatternToPngBlob(pattern);

    files[`${baseName}/layers/png/${layerName}.png`] = await blobToUint8Array(pngBlob);
    files[`${baseName}/layers/csv/${layerName}.csv`] = strToU8(createPatternCellCsv(pattern));
    files[`${baseName}/stats/layers/${layerName}-colors.csv`] = strToU8(
      createLayerUsageCsv(layeredPattern, layerIndex),
    );
  }

  const zipBlob = new Blob([zipSync(files)], { type: "application/zip" });
  downloadBlob(zipBlob, `${baseName}-production-pack.zip`);
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

function renderPatternToPngBlob(pattern: Pattern): Promise<Blob> {
  const canvas = renderPatternToCanvas(pattern);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("无法生成层图 PNG"));
      }
    }, "image/png");
  });
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function createPatternCellCsv(pattern: Pattern): string {
  const colorById = new Map(pattern.palette.map((color) => [color.id, color]));
  const rows = [["x", "y", "color_id", "brand", "filament_type", "code", "name_zh", "name", "hex", "is_support"]];

  for (let y = 0; y < pattern.height; y += 1) {
    for (let x = 0; x < pattern.width; x += 1) {
      const index = y * pattern.width + x;
      const colorId = pattern.cells[index];
      if (!colorId || isPatternBackgroundCell(pattern, index)) continue;
      const color = colorById.get(colorId);
      rows.push([
        String(x + 1),
        String(y + 1),
        colorId,
        color?.brand ?? "",
        color?.filamentType ?? "",
        color?.code ?? "",
        color?.nameZh ?? "",
        color?.name ?? "",
        color?.hex ?? "",
        pattern.supportCells?.[index] ? "true" : "false",
      ]);
    }
  }

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function createLayeredUsageCsv(layeredPattern: LayeredPattern): string {
  const colorById = new Map(layeredPattern.palette.map((color) => [color.id, color]));
  const rows = [
    [
      "color_id",
      "brand",
      "filament_type",
      "code",
      "name_zh",
      "name",
      "hex",
      "bead_count",
      "model_bead_count",
      "support_bead_count",
      "layers",
      "support_layers",
    ],
    ...getLayeredUsage(layeredPattern).map((item) => {
      const color = colorById.get(item.colorId);
      return [
        item.colorId,
        color?.brand ?? "",
        color?.filamentType ?? "",
        color?.code ?? "",
        color?.nameZh ?? "",
        color?.name ?? "",
        color?.hex ?? "",
        String(item.beadCount),
        String(item.modelBeadCount),
        String(item.supportBeadCount),
        item.layers.map((layer) => layer + 1).join(" "),
        item.supportLayers.map((layer) => layer + 1).join(" "),
      ];
    }),
  ];
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function createLayerUsageCsv(layeredPattern: LayeredPattern, layerIndex: number): string {
  const colorById = new Map(layeredPattern.palette.map((color) => [color.id, color]));
  const layer = layeredPattern.layers[layerIndex];
  const counts = new Map<string, { total: number; support: number }>();

  if (layer) {
    for (let index = 0; index < layer.cells.length; index += 1) {
      const colorId = layer.cells[index];
      if (!colorId) continue;
      const current = counts.get(colorId) ?? { total: 0, support: 0 };
      current.total += 1;
      if (layer.supportCells?.[index]) current.support += 1;
      counts.set(colorId, current);
    }
  }

  const rows = [
    [
      "layer",
      "color_id",
      "brand",
      "filament_type",
      "code",
      "name_zh",
      "name",
      "hex",
      "bead_count",
      "model_bead_count",
      "support_bead_count",
    ],
    ...[...counts.entries()]
      .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
      .map(([colorId, count]) => {
        const color = colorById.get(colorId);
        return [
          String(layerIndex + 1),
          colorId,
          color?.brand ?? "",
          color?.filamentType ?? "",
          color?.code ?? "",
          color?.nameZh ?? "",
          color?.name ?? "",
          color?.hex ?? "",
          String(count.total),
          String(count.total - count.support),
          String(count.support),
        ];
      }),
  ];
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function createLayeredColorPlan(layeredPattern: LayeredPattern) {
  return {
    version: 1,
    sourceModel: layeredPattern.sourceModel,
    support: layeredPattern.support ?? {
      enabled: false,
      colorId: null,
      generatedCells: 0,
      cellsByLayer: [],
    },
    palette: layeredPattern.palette,
    assignments: layeredPattern.layers.map((layer) => {
      const modelColorIds = new Set<string>();
      const supportColorIds = new Set<string>();

      for (let index = 0; index < layer.cells.length; index += 1) {
        const colorId = layer.cells[index];
        if (!colorId) continue;
        if (layer.supportCells?.[index]) {
          supportColorIds.add(colorId);
        } else {
          modelColorIds.add(colorId);
        }
      }

      return {
        targetType: "layer",
        targetId: String(layer.index),
        colors: [...modelColorIds],
        supportColors: [...supportColorIds],
        supportCellCount: layer.supportCells?.filter(Boolean).length ?? 0,
      };
    }),
    usage: getLayeredUsage(layeredPattern),
  };
}

function getLayeredUsage(layeredPattern: LayeredPattern) {
  const counts = new Map<
    string,
    {
      beadCount: number;
      modelBeadCount: number;
      supportBeadCount: number;
      layers: Set<number>;
      supportLayers: Set<number>;
    }
  >();

  for (const layer of layeredPattern.layers) {
    for (let index = 0; index < layer.cells.length; index += 1) {
      const colorId = layer.cells[index];
      if (!colorId) continue;
      const current = counts.get(colorId) ?? {
        beadCount: 0,
        modelBeadCount: 0,
        supportBeadCount: 0,
        layers: new Set<number>(),
        supportLayers: new Set<number>(),
      };
      current.beadCount += 1;
      if (layer.supportCells?.[index]) {
        current.supportBeadCount += 1;
        current.supportLayers.add(layer.index);
      } else {
        current.modelBeadCount += 1;
      }
      current.layers.add(layer.index);
      counts.set(colorId, current);
    }
  }

  return [...counts.entries()].map(([colorId, value]) => ({
    colorId,
    beadCount: value.beadCount,
    modelBeadCount: value.modelBeadCount,
    supportBeadCount: value.supportBeadCount,
    layers: [...value.layers].sort((a, b) => a - b),
    supportLayers: [...value.supportLayers].sort((a, b) => a - b),
  }));
}

function getBaseName(pattern: Pattern): string {
  return (
    (pattern.source?.fileName ?? "bead-pattern")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9\-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "bead-pattern"
  );
}

function getLayeredBaseName(layeredPattern: LayeredPattern): string {
  return (
    (layeredPattern.sourceModel?.fileName ?? "layered-bead-pattern")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9\-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "layered-bead-pattern"
  );
}
