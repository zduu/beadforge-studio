import type { Pattern, PatternSettings } from "../types";

export type ImageWorkerRequest = {
  id: number;
  file: File;
  settings: PatternSettings;
};

export type ImageWorkerResponse =
  | {
      id: number;
      ok: true;
      pattern: Pattern;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };
