import type { BeadColor, Rgb } from "../types";

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const normalized = value.length === 3
    ? value.split("").map((char) => char + char).join("")
    : value;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export function findNearestColor(rgb: Rgb, palette: BeadColor[]): BeadColor {
  let nearest = palette[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const color of palette) {
    const distance = colorDistance(rgb, hexToRgb(color.hex));
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
