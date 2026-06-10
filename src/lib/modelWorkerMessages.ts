import type { LayeredPattern, ModelOrientation, ModelPreviewData, ModelSupportSettings } from "../types";
import type { ModelProcessingProgress } from "./model";

export type ModelWorkerSliceSettings = {
  width: number;
  height: number;
  beadPitchMm: number;
  beadHeightMm: number;
  targetLayers: number;
  colorId: string;
  orientation: ModelOrientation;
  support: ModelSupportSettings;
};

export type ModelWorkerRequest =
  | {
      id: number;
      type: "preview";
      file: File;
      colorId: string;
    }
  | {
      id: number;
      type: "slice";
      file: File;
      settings: ModelWorkerSliceSettings;
    };

export type ModelWorkerJobRequest =
  | Omit<Extract<ModelWorkerRequest, { type: "preview" }>, "id">
  | Omit<Extract<ModelWorkerRequest, { type: "slice" }>, "id">;

export type ModelWorkerResponse =
  | {
      id: number;
      ok: true;
      type: "progress";
      progress: ModelProcessingProgress;
    }
  | {
      id: number;
      ok: true;
      type: "preview";
      previewData: ModelPreviewData;
    }
  | {
      id: number;
      ok: true;
      type: "slice";
      layeredPattern: LayeredPattern;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };
