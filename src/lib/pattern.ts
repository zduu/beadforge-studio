import type { BeadColor, ColorUsage, CropRect, Pattern } from "../types";

export function getColorUsage(pattern: Pattern): ColorUsage[] {
  const counts = new Map<string, number>();

  for (let index = 0; index < pattern.cells.length; index += 1) {
    const cell = pattern.cells[index];
    if (!cell || isPatternBackgroundCell(pattern, index)) continue;
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ color: pattern.palette.find((color) => color.id === id), count }))
    .filter((item): item is { color: BeadColor; count: number } => Boolean(item.color))
    .sort((a, b) => b.count - a.count || a.color.name.localeCompare(b.color.name));
}

export function getAllPatternColors(pattern: Pattern): ColorUsage[] {
  const counts = new Map<string, number>();

  for (const cell of pattern.cells) {
    if (!cell) continue;
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ color: pattern.palette.find((color) => color.id === id), count }))
    .filter((item): item is { color: BeadColor; count: number } => Boolean(item.color))
    .sort((a, b) => b.count - a.count || a.color.name.localeCompare(b.color.name));
}

export function replacePatternColor(pattern: Pattern, fromId: string, toId: string): Pattern {
  return {
    ...pattern,
    cells: pattern.cells.map((cell, index) => (cell === fromId && !isPatternBackgroundCell(pattern, index) ? toId : cell)),
  };
}

export function setPatternCell(pattern: Pattern, x: number, y: number, colorId: string | null, isBackground = false): Pattern {
  if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) {
    return pattern;
  }

  const cells = [...pattern.cells];
  const backgroundCells = normalizeBackgroundCells(pattern);
  const index = y * pattern.width + x;
  cells[index] = colorId;
  backgroundCells[index] = isBackground;
  return { ...pattern, cells, backgroundCells };
}

export function setPatternBackground(pattern: Pattern, colorId: string | null): Pattern {
  return { ...pattern, backgroundColorId: colorId };
}

export function cropPatternToRect(pattern: Pattern, rect: CropRect): Pattern {
  const startX = clampGridIndex(Math.floor(rect.x * pattern.width), 0, pattern.width - 1);
  const startY = clampGridIndex(Math.floor(rect.y * pattern.height), 0, pattern.height - 1);
  const endX = clampGridIndex(Math.ceil((rect.x + rect.width) * pattern.width), startX + 1, pattern.width);
  const endY = clampGridIndex(Math.ceil((rect.y + rect.height) * pattern.height), startY + 1, pattern.height);
  const nextWidth = endX - startX;
  const nextHeight = endY - startY;
  const backgroundCells = normalizeBackgroundCells(pattern);
  const nextCells: Array<string | null> = [];
  const nextBackgroundCells: boolean[] = [];

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = y * pattern.width + x;
      nextCells.push(pattern.cells[index]);
      nextBackgroundCells.push(backgroundCells[index]);
    }
  }

  return {
    ...pattern,
    width: nextWidth,
    height: nextHeight,
    cells: nextCells,
    backgroundCells: nextBackgroundCells,
    settings: {
      ...pattern.settings,
      width: nextWidth,
      height: nextHeight,
    },
  };
}

export function isPatternBackgroundCell(pattern: Pattern, index: number): boolean {
  return pattern.backgroundCells?.[index] === true;
}

export function normalizeBackgroundCells(pattern: Pattern): boolean[] {
  return pattern.backgroundCells?.length === pattern.cells.length
    ? [...pattern.backgroundCells]
    : new Array<boolean>(pattern.cells.length).fill(false);
}

export function validatePattern(value: unknown): Pattern | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<Pattern>;
  if (
    candidate.version !== 1 ||
    candidate.kind !== "single-layer" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    !Array.isArray(candidate.cells) ||
    candidate.cells.length !== candidate.width * candidate.height
  ) {
    return null;
  }

  return candidate as Pattern;
}

function clampGridIndex(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
