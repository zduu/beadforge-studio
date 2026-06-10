import { describe, expect, it } from "vitest";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import type { LayeredPattern, Pattern } from "../types";
import { getUndoStepLimit, rotatePatternClockwise, syncLayeredPatternFromPattern } from "./editorState";

const [white, black] = bambuPlaBasicColors;

describe("editor state helpers", () => {
  it("rotates pattern cells and background flags together", () => {
    const pattern = createPattern();
    const rotated = rotatePatternClockwise(pattern);

    expect(rotated.width).toBe(2);
    expect(rotated.height).toBe(3);
    expect(rotated.cells).toEqual([null, white.id, white.id, black.id, black.id, null]);
    expect(rotated.backgroundCells).toEqual([false, false, true, false, true, false]);
  });

  it("syncs edited layer cells while preserving hidden supports", () => {
    const layeredPattern = createLayeredPattern();
    const pattern = {
      ...createPattern(),
      cells: [white.id, null, null, black.id],
      supportCells: undefined,
      width: 2,
      height: 2,
    };
    const synced = syncLayeredPatternFromPattern(layeredPattern, 0, pattern, false);

    expect(synced.layers[0]?.cells).toEqual([white.id, black.id, null, black.id]);
    expect(synced.layers[0]?.supportCells).toEqual([false, true, false, false]);
    expect(synced.support?.generatedCells).toBe(1);
  });

  it("reduces undo depth for large patterns", () => {
    expect(getUndoStepLimit({ ...createPattern(), width: 32, height: 32 })).toBe(80);
    expect(getUndoStepLimit({ ...createPattern(), width: 160, height: 160 })).toBe(12);
  });
});

function createPattern(): Pattern {
  return {
    version: 1,
    kind: "single-layer",
    width: 3,
    height: 2,
    palette: [white, black],
    cells: [white.id, black.id, null, null, white.id, black.id],
    backgroundCells: [false, false, false, false, true, true],
    settings: {
      width: 3,
      height: 2,
      fitMode: "contain",
      sampleMode: "average",
      maxColors: 2,
      detailBoost: 0,
      sourceCrop: null,
      mirrorX: false,
    },
  };
}

function createLayeredPattern(): LayeredPattern {
  return {
    version: 1,
    kind: "layered-model",
    width: 2,
    height: 2,
    layers: [
      {
        index: 0,
        name: "Layer 1",
        cells: [white.id, black.id, null, black.id],
        supportCells: [false, true, false, false],
      },
    ],
    palette: [white, black],
    support: {
      enabled: true,
      colorId: black.id,
      generatedCells: 1,
      cellsByLayer: [{ index: 0, occupiedCells: 1 }],
    },
  };
}
