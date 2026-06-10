import type { BeadColor } from "../types";

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isCellValue(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isBeadColor(value: unknown): value is BeadColor {
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
