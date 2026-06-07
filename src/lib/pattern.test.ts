import { describe, expect, it } from "vitest";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import type { Pattern } from "../types";
import {
  cropPatternToRect,
  getAllPatternColors,
  getColorUsage,
  replacePatternColor,
  setPatternCell,
  validatePattern,
} from "./pattern";

const [white, black, red] = bambuPlaBasicColors;

function createPattern(): Pattern {
  return {
    version: 1,
    kind: "single-layer",
    width: 3,
    height: 2,
    palette: [white, black, red],
    cells: [white.id, black.id, null, white.id, red.id, black.id],
    backgroundColorId: white.id,
    backgroundCells: [true, false, true, false, false, false],
    settings: {
      width: 3,
      height: 2,
      fitMode: "contain",
      sampleMode: "average",
      maxColors: 3,
      detailBoost: 0,
      sourceCrop: null,
      mirrorX: false,
    },
  };
}

describe("pattern helpers", () => {
  it("excludes background cells from usage totals", () => {
    const usageById = new Map(getColorUsage(createPattern()).map(({ color, count }) => [color.id, count]));

    expect(usageById.get(white.id)).toBe(1);
    expect(usageById.get(black.id)).toBe(2);
    expect(usageById.get(red.id)).toBe(1);
  });

  it("keeps all colored cells in all-color totals", () => {
    const usageById = new Map(getAllPatternColors(createPattern()).map(({ color, count }) => [color.id, count]));

    expect(usageById.get(white.id)).toBe(2);
    expect(usageById.get(black.id)).toBe(2);
    expect(usageById.get(red.id)).toBe(1);
  });

  it("does not replace cells marked as background", () => {
    const nextPattern = replacePatternColor(createPattern(), white.id, black.id);

    expect(nextPattern.cells[0]).toBe(white.id);
    expect(nextPattern.cells[3]).toBe(black.id);
  });

  it("sets cells and background flags together", () => {
    const nextPattern = setPatternCell(createPattern(), 2, 0, red.id);

    expect(nextPattern.cells[2]).toBe(red.id);
    expect(nextPattern.backgroundCells?.[2]).toBe(false);
  });

  it("crops cells and background flags to the selected grid area", () => {
    const croppedPattern = cropPatternToRect(createPattern(), { x: 1 / 3, y: 0, width: 2 / 3, height: 0.5 });

    expect(croppedPattern.width).toBe(2);
    expect(croppedPattern.height).toBe(1);
    expect(croppedPattern.cells).toEqual([black.id, null]);
    expect(croppedPattern.backgroundCells).toEqual([false, true]);
  });

  it("validates basic single-layer project shape", () => {
    expect(validatePattern(createPattern())).not.toBeNull();
    expect(validatePattern({ ...createPattern(), cells: [white.id] })).toBeNull();
  });
});
