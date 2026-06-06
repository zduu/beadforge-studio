import type { LayeredPattern, ModelOrientation, ModelPreviewData } from "../types";

export type ModelWorkerSliceSettings = {
  width: number;
  height: number;
  beadPitchMm: number;
  beadHeightMm: number;
  targetLayers: number;
  colorId: string;
  orientation: ModelOrientation;
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
