import * as THREE from "three";
import type { BeadColor, ModelOrientation, ModelSupportSettings, Rgb } from "../../types";

export const EPSILON = 1e-6;

export type ModelFileType = "stl" | "3mf";

export type Triangle = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  colorId: string;
};

export type ParsedModel = {
  triangles: Triangle[];
  palette: BeadColor[];
};

export type SliceSegment = {
  start: THREE.Vector2;
  end: THREE.Vector2;
  colorId: string;
};

export type RowIntersection = {
  x: number;
  colorId: string;
};

export type ThreeMfPackage = Record<string, Uint8Array>;

export type ThreeMfObject = {
  id: string;
  vertices: THREE.Vector3[];
  triangles: ThreeMfTriangle[];
  components: ThreeMfComponent[];
};

export type ThreeMfTriangle = {
  vertices: [number, number, number];
  paintColor: string | null;
};

export type ThreeMfComponent = {
  objectId: string;
  path: string | null;
  transform: THREE.Matrix4;
};

export type ThreeMfBuildItem = {
  objectId: string;
  transform: THREE.Matrix4;
};

export type BambuProjectColorData = {
  filamentColors: BeadColor[];
  partExtruders: Map<string, number>;
};

export type ModelSliceSettings = {
  width: number;
  height: number;
  beadPitchMm: number;
  beadHeightMm: number;
  targetLayers: number;
  colorId: string;
  orientation?: ModelOrientation;
  support?: ModelSupportSettings;
};

export type ModelPreviewSettings = {
  colorId: string;
};

export type ModelSliceCostEstimate = {
  triangleCount: number;
  layerCount: number;
  gridCells: number;
  triangleLayerChecks: number;
  cellLayerChecks: number;
};

export type ModelProgressStage =
  | "reading"
  | "decompressing"
  | "parsing"
  | "normalizing"
  | "slicing"
  | "supports"
  | "preview";

export type ModelProcessingProgress = {
  stage: ModelProgressStage;
  message: string;
  current?: number;
  total?: number;
  triangleCount?: number;
  layerCount?: number;
  cost?: ModelSliceCostEstimate;
};

export type ModelProcessingOptions = {
  onProgress?: (progress: ModelProcessingProgress) => void;
};

export type LinearRgb = {
  r: number;
  g: number;
  b: number;
};

export type RgbMatcher = (rgb: Rgb) => string;
