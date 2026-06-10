import type { ModelFileType } from "./types";

export function getModelFileType(fileName: string): ModelFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".stl")) return "stl";
  if (lower.endsWith(".3mf")) return "3mf";
  throw new Error("目前仅支持 STL 和 3MF 文件");
}
