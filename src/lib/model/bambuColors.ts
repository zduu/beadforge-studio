import * as THREE from "three";
import { bambuPlaBasicColors } from "../../data/bambuPlaBasic";
import type { BeadColor, Rgb } from "../../types";
import { findNearestColor } from "../color";
import type { BambuProjectColorData, LinearRgb, ThreeMfPackage } from "./types";
import { decodeArchiveText, findMetadataValue, findXmlElements, parseJsonObject } from "./xml";

const colorCache = new Map<string, string>();

export const bambuPaintColorExtruderIndices = new Map([
  ["4", 0],
  ["8", 1],
  ["0C", 2],
  ["1C", 3],
]);

export function getBambuProjectColorData(
  archive: ThreeMfPackage,
  fallbackColorId: string,
): BambuProjectColorData | null {
  const projectSettingsText = decodeArchiveText(archive, "Metadata/project_settings.config");
  const modelSettingsText = decodeArchiveText(archive, "Metadata/model_settings.config");
  if (!projectSettingsText || !modelSettingsText) return null;

  const projectSettings = parseJsonObject(projectSettingsText);
  if (!projectSettings) return null;

  const filamentColorValues = Array.isArray(projectSettings.filament_colour) ? projectSettings.filament_colour : [];
  const filamentIds = Array.isArray(projectSettings.filament_ids) ? projectSettings.filament_ids : [];
  const filamentColors = filamentColorValues.map((hex, index) =>
    createThreeMfFilamentColor(hex, index, filamentIds[index], fallbackColorId),
  );
  if (filamentColors.length === 0) return null;

  const partExtruders = new Map<string, number>();
  for (const objectNode of findXmlElements(modelSettingsText, "object")) {
    const objectId = objectNode.attributes.get("id");
    if (!objectId) continue;

    const extruder = findMetadataValue(objectNode.body, "extruder");
    const extruderIndex = parseExtruderIndex(extruder);
    if (extruderIndex !== null) {
      partExtruders.set(objectId, extruderIndex);
    }
  }

  for (const partNode of findXmlElements(modelSettingsText, "part")) {
    const partId = partNode.attributes.get("id");
    if (!partId) continue;

    const extruder = findMetadataValue(partNode.body, "extruder");
    const extruderIndex = parseExtruderIndex(extruder);
    if (extruderIndex !== null) {
      partExtruders.set(partId, extruderIndex);
    }
  }

  return { filamentColors, partExtruders };
}

export function getBambuPartColorId(
  partId: string,
  fallbackColorId: string,
  projectColorData: BambuProjectColorData | null,
): string {
  if (!projectColorData) return fallbackColorId;
  const extruderIndex = projectColorData.partExtruders.get(partId);
  if (extruderIndex === undefined) return fallbackColorId;
  return projectColorData.filamentColors[extruderIndex]?.id ?? fallbackColorId;
}

export function getBambuPaintColorId(
  paintColor: string | null,
  fallbackColorId: string,
  projectColorData: BambuProjectColorData | null,
): string {
  if (!projectColorData) return fallbackColorId;
  const code = getBambuPaintColorCode(paintColor);
  if (!code) return fallbackColorId;

  const extruderIndex = bambuPaintColorExtruderIndices.get(code);
  if (extruderIndex === undefined) return fallbackColorId;

  return projectColorData.filamentColors[extruderIndex]?.id ?? fallbackColorId;
}

export function createThreeMfFilamentColor(
  value: unknown,
  index: number,
  materialId: unknown,
  fallbackColorId: string,
): BeadColor {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    return bambuPlaBasicColors.find((color) => color.id === fallbackColorId) ?? bambuPlaBasicColors[0];
  }

  const normalizedHex = value.toUpperCase();
  const code = `3MF-${index + 1}`;
  return {
    id: `3mf-filament-${index + 1}-${normalizedHex.slice(1).toLowerCase()}`,
    brand: "Bambu Lab",
    filamentType: "3MF Filament",
    code,
    name: `3MF Filament ${index + 1}`,
    nameZh: `3MF 耗材 ${index + 1}`,
    hex: normalizedHex,
    materialId: typeof materialId === "string" ? materialId : undefined,
  };
}

export function mergePalettes(basePalette: BeadColor[], projectPalette: BeadColor[]): BeadColor[] {
  const colors = new Map<string, BeadColor>();
  for (const color of basePalette) colors.set(color.id, color);
  for (const color of projectPalette) colors.set(color.id, color);
  return [...colors.values()];
}

export function getMaterialColorId(
  material: THREE.Material | THREE.Material[] | undefined,
  fallbackColorId: string,
): string {
  const firstMaterial = Array.isArray(material) ? material[0] : material;
  if (!firstMaterial || !("color" in firstMaterial)) return fallbackColorId;

  const color = firstMaterial.color;
  if (!(color instanceof THREE.Color)) return fallbackColorId;

  return nearestBambuColorId(threeColorToRgb(color));
}

export function getTriangleColorId(
  color: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  aIndex: number,
  bIndex: number,
  cIndex: number,
  fallbackColorId: string,
): string {
  if (!color) return fallbackColorId;

  const rgb = {
    r: (color.getX(aIndex) + color.getX(bIndex) + color.getX(cIndex)) / 3,
    g: (color.getY(aIndex) + color.getY(bIndex) + color.getY(cIndex)) / 3,
    b: (color.getZ(aIndex) + color.getZ(bIndex) + color.getZ(cIndex)) / 3,
  };

  return nearestBambuColorId(threeLinearRgbToRgb(rgb));
}

function getBambuPaintColorCode(paintColor: string | null): string | null {
  if (!paintColor) return null;
  const normalized = paintColor.trim().toUpperCase();
  if (!normalized) return null;

  for (let index = 0; index < normalized.length; index += 1) {
    const twoCharacterCode = normalized.slice(index, index + 2);
    if (bambuPaintColorExtruderIndices.has(twoCharacterCode)) return twoCharacterCode;

    const oneCharacterCode = normalized[index];
    if (oneCharacterCode && bambuPaintColorExtruderIndices.has(oneCharacterCode)) return oneCharacterCode;
  }

  return null;
}

function parseExtruderIndex(value: string | null): number | null {
  if (!value) return null;
  const extruderIndex = Number.parseInt(value, 10) - 1;
  return Number.isFinite(extruderIndex) && extruderIndex >= 0 ? extruderIndex : null;
}

function getColorCacheKey(rgb: Rgb): string {
  return `${rgb.r},${rgb.g},${rgb.b}`;
}

function nearestBambuColorId(rgb: Rgb): string {
  const key = getColorCacheKey(rgb);
  const cached = colorCache.get(key);
  if (cached) return cached;

  const color = findNearestColor(rgb, bambuPlaBasicColors);
  colorCache.set(key, color.id);
  return color.id;
}

function threeColorToRgb(color: THREE.Color): Rgb {
  return threeLinearRgbToRgb({ r: color.r, g: color.g, b: color.b });
}

function threeLinearRgbToRgb(rgb: LinearRgb): Rgb {
  const color = new THREE.Color(rgb.r, rgb.g, rgb.b).convertLinearToSRGB();
  return {
    r: Math.round(clampUnit(color.r) * 255),
    g: Math.round(clampUnit(color.g) * 255),
    b: Math.round(clampUnit(color.b) * 255),
  };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
