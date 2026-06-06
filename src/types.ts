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
  filamentType: "PLA Basic";
  code: string;
  name: string;
  nameZh: string;
  hex: string;
  materialId?: string;
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
  };
  layers: Array<{
    index: number;
    name: string;
    cells: Array<string | null>;
  }>;
  palette: BeadColor[];
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
