import type { BeadColor, LayeredPattern, ModelBoundsSummary, ModelLayerOccupancy, ModelOrientation, ModelSliceDiagnostics, ModelSupportSummary, Pattern } from "../types";

type LayeredPatternToPatternOptions = {
  includeSupports?: boolean;
};

export function layeredPatternToPattern(layeredPattern: LayeredPattern, layerIndex: number, options: LayeredPatternToPatternOptions = {}): Pattern {
  const layer = layeredPattern.layers[layerIndex] ?? layeredPattern.layers[0];
  const includeSupports = options.includeSupports ?? true;
  const supportCells = layer?.supportCells?.length === layeredPattern.width * layeredPattern.height ? layer.supportCells : undefined;

  return {
    version: 1,
    kind: "single-layer",
    width: layeredPattern.width,
    height: layeredPattern.height,
    palette: layeredPattern.palette,
    cells: getVisibleLayerCells(layer?.cells, supportCells, layeredPattern.width * layeredPattern.height, includeSupports),
    supportCells: includeSupports && supportCells ? [...supportCells] : undefined,
    settings: {
      width: layeredPattern.width,
      height: layeredPattern.height,
      fitMode: "contain",
      sampleMode: "average",
      maxColors: layeredPattern.palette.length,
      detailBoost: 0,
      sourceCrop: null,
      mirrorX: false,
    },
    source: layeredPattern.sourceModel
      ? {
          fileName: `${layeredPattern.sourceModel.fileName}-${layer?.name ?? "layer"}`,
          width: layeredPattern.width,
          height: layeredPattern.height,
        }
      : undefined,
  };
}

function getVisibleLayerCells(
  cells: Array<string | null> | undefined,
  supportCells: boolean[] | undefined,
  cellCount: number,
  includeSupports: boolean,
): Array<string | null> {
  const nextCells = cells ? [...cells] : Array.from({ length: cellCount }, () => null);
  if (includeSupports || !supportCells) return nextCells;
  return nextCells.map((cell, index) => (supportCells[index] ? null : cell));
}

export function validateLayeredPattern(value: unknown): LayeredPattern | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<LayeredPattern>;
  if (
    candidate.version !== 1 ||
    candidate.kind !== "layered-model" ||
    !isPositiveInteger(candidate.width) ||
    !isPositiveInteger(candidate.height) ||
    !Array.isArray(candidate.layers) ||
    candidate.layers.length === 0 ||
    !Array.isArray(candidate.palette)
  ) {
    return null;
  }

  const cellCount = candidate.width * candidate.height;
  const layers = candidate.layers.map((layer) => {
    if (!layer || typeof layer !== "object") return null;
    if (!Number.isInteger(layer.index) || layer.index < 0 || typeof layer.name !== "string" || !Array.isArray(layer.cells)) {
      return null;
    }
    if (layer.cells.length !== cellCount || !layer.cells.every(isCellValue)) return null;
    const supportCells = Array.isArray(layer.supportCells) && layer.supportCells.length === cellCount && layer.supportCells.every(isBoolean)
      ? [...layer.supportCells]
      : undefined;
    return {
      index: layer.index,
      name: layer.name,
      cells: [...layer.cells],
      supportCells,
    };
  });

  if (layers.some((layer) => layer === null) || !candidate.palette.every(isBeadColor)) {
    return null;
  }

  return {
    version: 1,
    kind: "layered-model",
    width: candidate.width,
    height: candidate.height,
    sourceModel: normalizeSourceModel(candidate.sourceModel),
    layers: layers as LayeredPattern["layers"],
    palette: candidate.palette,
    diagnostics: normalizeSliceDiagnostics(candidate.diagnostics),
    support: normalizeSupportSummary(candidate.support),
  };
}

function normalizeSourceModel(sourceModel: LayeredPattern["sourceModel"]): LayeredPattern["sourceModel"] {
  if (!sourceModel || typeof sourceModel !== "object") return undefined;

  const fileName = typeof sourceModel.fileName === "string" ? sourceModel.fileName : "model";
  const fileType = sourceModel.fileType === "stl" || sourceModel.fileType === "3mf" || sourceModel.fileType === "obj" ? sourceModel.fileType : "3mf";
  const beadPitchMm = getFiniteNumber(sourceModel.beadPitchMm, 2.6);
  const beadHeightMm = getFiniteNumber(sourceModel.beadHeightMm, getFiniteNumber(sourceModel.layerHeightMm, 3));

  return {
    fileName,
    fileType,
    scale: getFiniteNumber(sourceModel.scale, 1),
    layerHeightMm: getFiniteNumber(sourceModel.layerHeightMm, beadHeightMm),
    beadPitchMm,
    beadHeightMm,
    targetLayers: getOptionalNonNegativeInteger(sourceModel.targetLayers),
    orientation: normalizeOrientation(sourceModel.orientation),
  };
}

function normalizeSliceDiagnostics(diagnostics: LayeredPattern["diagnostics"]): ModelSliceDiagnostics | undefined {
  if (!diagnostics || typeof diagnostics !== "object") return undefined;

  const originalBounds = normalizeBoundsSummary(diagnostics.originalBounds);
  const orientedBounds = normalizeBoundsSummary(diagnostics.orientedBounds);
  const scaledSizeMm = normalizeVector3(diagnostics.scaledSizeMm);
  const occupiedCellsByLayer = Array.isArray(diagnostics.occupiedCellsByLayer)
    ? diagnostics.occupiedCellsByLayer.map(normalizeLayerOccupancy).filter((item): item is ModelLayerOccupancy => Boolean(item))
    : [];

  if (!originalBounds || !orientedBounds || !scaledSizeMm) return undefined;

  return {
    originalBounds,
    orientedBounds,
    scaledSizeMm,
    scale: getFiniteNumber(diagnostics.scale, 1),
    naturalLayerCount: getNonNegativeInteger(diagnostics.naturalLayerCount),
    targetLayerCount: getNonNegativeInteger(diagnostics.targetLayerCount),
    generatedLayerCount: getNonNegativeInteger(diagnostics.generatedLayerCount),
    nonEmptyLayerCount: getNonNegativeInteger(diagnostics.nonEmptyLayerCount),
    emptyLayerCount: getNonNegativeInteger(diagnostics.emptyLayerCount),
    occupiedCellsByLayer,
  };
}

function normalizeSupportSummary(support: LayeredPattern["support"]): ModelSupportSummary | undefined {
  if (!support || typeof support !== "object") return undefined;
  if (typeof support.enabled !== "boolean" || typeof support.colorId !== "string") return undefined;

  const cellsByLayer = Array.isArray(support.cellsByLayer)
    ? support.cellsByLayer.map(normalizeLayerOccupancy).filter((item): item is ModelLayerOccupancy => Boolean(item))
    : [];

  return {
    enabled: support.enabled,
    colorId: support.colorId,
    generatedCells: getNonNegativeInteger(support.generatedCells),
    cellsByLayer,
  };
}

function normalizeBoundsSummary(bounds: ModelBoundsSummary | undefined): ModelBoundsSummary | null {
  if (!bounds || typeof bounds !== "object") return null;

  const min = normalizeVector3(bounds.min);
  const max = normalizeVector3(bounds.max);
  const size = normalizeVector3(bounds.size);
  return min && max && size ? { min, max, size } : null;
}

function normalizeLayerOccupancy(value: ModelLayerOccupancy): ModelLayerOccupancy | null {
  if (!value || typeof value !== "object") return null;
  if (!Number.isInteger(value.index) || value.index < 0) return null;
  return {
    index: value.index,
    occupiedCells: getNonNegativeInteger(value.occupiedCells),
  };
}

function normalizeOrientation(orientation: ModelOrientation | undefined): ModelOrientation | undefined {
  if (!orientation || typeof orientation !== "object") return undefined;
  return {
    rotateXDeg: normalizeRotationDegrees(orientation.rotateXDeg),
    rotateYDeg: normalizeRotationDegrees(orientation.rotateYDeg),
    rotateZDeg: normalizeRotationDegrees(orientation.rotateZDeg),
  };
}

function normalizeVector3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isCellValue(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isBeadColor(value: unknown): value is BeadColor {
  if (!value || typeof value !== "object") return false;
  const color = value as Partial<BeadColor>;
  return (
    typeof color.id === "string" &&
    color.brand === "Bambu Lab" &&
    (color.filamentType === "PLA Basic" || color.filamentType === "3MF Filament") &&
    typeof color.code === "string" &&
    typeof color.name === "string" &&
    typeof color.nameZh === "string" &&
    typeof color.hex === "string" &&
    /^#[0-9a-f]{6}$/i.test(color.hex)
  );
}

function getFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return getNonNegativeInteger(value);
}

function getNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeRotationDegrees(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
