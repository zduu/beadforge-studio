import type { ColorUsage, CropRect, LayeredPattern, Pattern, PatternSettings } from "../types";
import { setPatternBackground } from "./pattern";

const DEFAULT_MODEL_SUPPORT_COLOR_ID = "bambu-pla-basic-jade-white";
const DEFAULT_MODEL_SLICE_SETTINGS = {
  beadPitchMm: 2.6,
  beadHeightMm: 3,
  targetLayers: 0,
};

export function normalizePatternSettings(settings: PatternSettings): PatternSettings {
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

export function normalizeModelSliceSettings(
  settings: typeof DEFAULT_MODEL_SLICE_SETTINGS,
): typeof DEFAULT_MODEL_SLICE_SETTINGS {
  return {
    beadPitchMm: clampDecimal(settings.beadPitchMm, 0.1, 100),
    beadHeightMm: clampDecimal(settings.beadHeightMm, 0.1, 100),
    targetLayers: clampNumber(settings.targetLayers, 0, 2000),
  };
}

export function getModelSliceSettingsFromDrafts(
  drafts: typeof DEFAULT_MODEL_SLICE_SETTINGS | Record<keyof typeof DEFAULT_MODEL_SLICE_SETTINGS, string>,
) {
  return normalizeModelSliceSettings({
    beadPitchMm: parseDraftFloat(String(drafts.beadPitchMm), DEFAULT_MODEL_SLICE_SETTINGS.beadPitchMm),
    beadHeightMm: parseDraftFloat(String(drafts.beadHeightMm), DEFAULT_MODEL_SLICE_SETTINGS.beadHeightMm),
    targetLayers: parseDraftNumber(String(drafts.targetLayers), DEFAULT_MODEL_SLICE_SETTINGS.targetLayers),
  });
}

export function getLayeredColorUsage(layeredPattern: LayeredPattern, includeSupports: boolean): ColorUsage[] {
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

export function parseDraftNumber(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function parseDraftFloat(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampDecimal(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  return Number(clamped.toFixed(3));
}

export function formatModelNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

export function formatModelVector(vector: [number, number, number]): string {
  return vector.map(formatModelNumber).join(" x ");
}

export function getLayerOccupiedCells(diagnostics: LayeredPattern["diagnostics"], layerIndex: number): number {
  return diagnostics?.occupiedCellsByLayer.find((layer) => layer.index === layerIndex)?.occupiedCells ?? 0;
}

export function getLayerCellCount(layer: LayeredPattern["layers"][number], includeSupports: boolean): number {
  return layer.cells.reduce((count, cell, index) => {
    if (!cell) return count;
    if (!includeSupports && layer.supportCells?.[index]) return count;
    return count + 1;
  }, 0);
}

export function normalizeRotationDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function applyPatternBackground(pattern: Pattern, colorId: string | null): Pattern {
  const backgroundCells = pattern.cells.map((cell) => !cell || Boolean(colorId && cell === colorId));
  return setPatternBackground(
    {
      ...pattern,
      backgroundCells,
    },
    colorId,
  );
}

export function setPatternSupportFlag(pattern: Pattern, x: number, y: number, isSupport: boolean): Pattern {
  if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return pattern;
  const supportCells =
    pattern.supportCells?.length === pattern.cells.length
      ? [...pattern.supportCells]
      : new Array<boolean>(pattern.cells.length).fill(false);
  supportCells[y * pattern.width + x] = isSupport;
  return {
    ...pattern,
    supportCells: supportCells.some(Boolean) ? supportCells : undefined,
  };
}

export function syncLayeredPatternFromPattern(
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
    nextSupportCells =
      pattern.supportCells?.length === cellCount
        ? [...pattern.supportCells]
        : new Array<boolean>(cellCount).fill(false);
  } else {
    nextCells = [...layer.cells];
    nextSupportCells = [...previousSupportCells];

    for (let index = 0; index < cellCount; index += 1) {
      if (previousSupportCells[index] && !pattern.cells[index]) continue;
      nextCells[index] = pattern.cells[index] ?? null;
      nextSupportCells[index] = false;
    }
  }

  const layers = layeredPattern.layers.map((currentLayer, index) =>
    index === activeLayerIndex
      ? {
          ...currentLayer,
          cells: nextCells,
          supportCells: nextSupportCells.some(Boolean) ? nextSupportCells : undefined,
        }
      : currentLayer,
  );

  return recomputeLayeredPatternMetadata({
    ...layeredPattern,
    layers,
  });
}

export function recomputeLayeredPatternMetadata(layeredPattern: LayeredPattern): LayeredPattern {
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

  const supportColorId =
    supportColorIds.size === 1
      ? [...supportColorIds][0]
      : (layeredPattern.support?.colorId ?? DEFAULT_MODEL_SUPPORT_COLOR_ID);
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
    support:
      layeredPattern.support || generatedCells > 0
        ? {
            enabled: layeredPattern.support?.enabled ?? generatedCells > 0,
            colorId: supportColorId ?? DEFAULT_MODEL_SUPPORT_COLOR_ID,
            generatedCells,
            cellsByLayer,
          }
        : undefined,
  };
}

export function rotatePatternClockwise(pattern: Pattern): Pattern {
  const backgroundCells =
    pattern.backgroundCells?.length === pattern.cells.length ? pattern.backgroundCells : undefined;
  return {
    ...pattern,
    width: pattern.height,
    height: pattern.width,
    cells: rotateCellsClockwise(pattern.cells, pattern.width, pattern.height),
    backgroundCells: backgroundCells ? rotateCellsClockwise(backgroundCells, pattern.width, pattern.height) : undefined,
    settings: normalizePatternSettings({
      ...pattern.settings,
      width: pattern.height,
      height: pattern.width,
    }),
    source: pattern.source
      ? {
          ...pattern.source,
          width: pattern.source.height,
          height: pattern.source.width,
        }
      : undefined,
  };
}

export function rotateLayeredPatternClockwise(layeredPattern: LayeredPattern): LayeredPattern {
  return {
    ...layeredPattern,
    width: layeredPattern.height,
    height: layeredPattern.width,
    layers: layeredPattern.layers.map((layer) => ({
      ...layer,
      cells: rotateCellsClockwise(layer.cells, layeredPattern.width, layeredPattern.height),
      supportCells: layer.supportCells
        ? rotateCellsClockwise(layer.supportCells, layeredPattern.width, layeredPattern.height)
        : undefined,
    })),
  };
}

export function rotateCellsClockwise<T>(cells: T[], width: number, height: number): T[] {
  const rotated = new Array<T>(cells.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rotated[x * height + (height - 1 - y)] = cells[y * width + x];
    }
  }
  return rotated;
}

export function clonePattern(pattern: Pattern): Pattern {
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

export function cloneLayeredPattern(layeredPattern: LayeredPattern): LayeredPattern {
  return {
    ...layeredPattern,
    sourceModel: layeredPattern.sourceModel
      ? {
          ...layeredPattern.sourceModel,
          orientation: layeredPattern.sourceModel.orientation
            ? { ...layeredPattern.sourceModel.orientation }
            : undefined,
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

export function cloneSettings(settings: PatternSettings): PatternSettings {
  return {
    ...settings,
    sourceCrop: settings.sourceCrop ? { ...settings.sourceCrop } : null,
  };
}

export function getUndoStepLimit(pattern: Pattern): number {
  const cells = pattern.width * pattern.height;
  if (cells >= 20_000) return 12;
  if (cells >= 10_000) return 24;
  if (cells >= 5_000) return 40;
  return 80;
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

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function getNormalizedSupportCells(layer: LayeredPattern["layers"][number], cellCount: number): boolean[] {
  return layer.supportCells?.length === cellCount ? [...layer.supportCells] : new Array<boolean>(cellCount).fill(false);
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
