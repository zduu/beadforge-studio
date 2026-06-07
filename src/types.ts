export type FitMode = "contain" | "cover" | "stretch";

export type SampleMode = "average" | "center";

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BeadColor = {
  id: string;
  brand: "Bambu Lab";
  filamentType: "PLA Basic" | "3MF Filament";
  code: string;
  name: string;
  nameZh: string;
  hex: string;
  materialId?: string;
};

export type ModelOrientation = {
  rotateXDeg: number;
  rotateYDeg: number;
  rotateZDeg: number;
};

export type ModelPreviewTriangle = {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  colorId: string;
};

export type ModelPreviewData = {
  fileName: string;
  fileType: "stl" | "3mf";
  triangleCount: number;
  palette: BeadColor[];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  triangles: ModelPreviewTriangle[];
};

export type ModelBoundsSummary = {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
};

export type ModelLayerOccupancy = {
  index: number;
  occupiedCells: number;
};

export type ModelSliceDiagnostics = {
  originalBounds: ModelBoundsSummary;
  orientedBounds: ModelBoundsSummary;
  scaledSizeMm: [number, number, number];
  scale: number;
  naturalLayerCount: number;
  targetLayerCount: number;
  generatedLayerCount: number;
  nonEmptyLayerCount: number;
  emptyLayerCount: number;
  occupiedCellsByLayer: ModelLayerOccupancy[];
};

export type ModelSupportSettings = {
  enabled: boolean;
  colorId: string;
};

export type ModelSupportSummary = {
  enabled: boolean;
  colorId: string;
  generatedCells: number;
  cellsByLayer: ModelLayerOccupancy[];
};

export type PatternSettings = {
  width: number;
  height: number;
  fitMode: FitMode;
  sampleMode: SampleMode;
  maxColors: number;
  detailBoost: number;
  sourceCrop: CropRect | null;
  mirrorX: boolean;
};

export type Pattern = {
  version: 1;
  kind: "single-layer";
  width: number;
  height: number;
  palette: BeadColor[];
  cells: Array<string | null>;
  backgroundColorId?: string | null;
  backgroundCells?: boolean[];
  supportCells?: boolean[];
  settings: PatternSettings;
  source?: {
    fileName: string;
    width: number;
    height: number;
  };
};

export type LayeredPattern = {
  version: 1;
  kind: "layered-model";
  width: number;
  height: number;
  sourceModel?: {
    fileName: string;
    fileType: "stl" | "3mf" | "obj";
    scale: number;
    layerHeightMm: number;
    beadPitchMm: number;
    beadHeightMm: number;
    targetLayers?: number;
    orientation?: ModelOrientation;
  };
  layers: Array<{
    index: number;
    name: string;
    cells: Array<string | null>;
    supportCells?: boolean[];
  }>;
  palette: BeadColor[];
  diagnostics?: ModelSliceDiagnostics;
  support?: ModelSupportSummary;
};

export type ColorUsage = {
  color: BeadColor;
  count: number;
};

export type Rgb = {
  r: number;
  g: number;
  b: number;
};
