import type { BeadColor, Rgb } from "../types";

type Lab = {
  l: number;
  a: number;
  b: number;
};

const rgbCache = new Map<string, Rgb>();
const paletteLabCache = new WeakMap<BeadColor[], Array<{ color: BeadColor; lab: Lab }>>();

export function hexToRgb(hex: string): Rgb {
  const cached = rgbCache.get(hex);
  if (cached) return cached;

  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;

  const rgb = {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
  rgbCache.set(hex, rgb);
  return rgb;
}

export function colorDistance(a: Rgb, b: Rgb): number {
  return deltaE76(rgbToLab(a), rgbToLab(b));
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r / 255);
  const g = srgbToLinear(rgb.g / 255);
  const b = srgbToLinear(rgb.b / 255);

  const x = pivotXyz((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = pivotXyz((r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1);
  const z = pivotXyz((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);

  return {
    l: 116 * y - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

export function findNearestColor(rgb: Rgb, palette: BeadColor[]): BeadColor {
  let nearest = palette[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  const targetLab = rgbToLab(rgb);

  for (const { color, lab } of getPaletteLabValues(palette)) {
    const distance = deltaE76(targetLab, lab);
    if (distance < nearestDistance) {
      nearest = color;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function limitPaletteCells(
  rgbs: Array<Rgb | null>,
  initialCells: Array<string | null>,
  palette: BeadColor[],
  maxColors: number,
): Array<string | null> {
  if (maxColors <= 0 || maxColors >= palette.length) {
    return initialCells;
  }

  const counts = new Map<string, number>();
  for (const id of initialCells) {
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const allowedIds = new Set(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(([id]) => id),
  );
  const allowedPalette = palette.filter((color) => allowedIds.has(color.id));

  if (allowedPalette.length === 0) {
    return initialCells;
  }

  return initialCells.map((cell, index) => {
    if (!cell || allowedIds.has(cell)) {
      return cell;
    }

    const rgb = rgbs[index];
    return rgb ? findNearestColor(rgb, allowedPalette).id : null;
  });
}

function getPaletteLabValues(palette: BeadColor[]): Array<{ color: BeadColor; lab: Lab }> {
  const cached = paletteLabCache.get(palette);
  if (cached) return cached;

  const values = palette.map((color) => ({
    color,
    lab: rgbToLab(hexToRgb(color.hex)),
  }));
  paletteLabCache.set(palette, values);
  return values;
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function pivotXyz(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787037037 * value + 16 / 116;
}
