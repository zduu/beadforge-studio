import { describe, expect, it } from "vitest";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import type { LayeredPattern } from "../types";
import { layeredPatternToPattern, validateLayeredPattern } from "./layeredPattern";

const [white, black] = bambuPlaBasicColors;

function createLayeredPattern(): LayeredPattern {
  return {
    version: 1,
    kind: "layered-model",
    width: 2,
    height: 2,
    sourceModel: {
      fileName: "sample.3mf",
      fileType: "3mf",
      scale: 1.5,
      layerHeightMm: 3,
      beadPitchMm: 2.6,
      beadHeightMm: 3,
      targetLayers: 2,
      orientation: {
        rotateXDeg: 0,
        rotateYDeg: 0,
        rotateZDeg: 90,
      },
    },
    layers: [
      {
        index: 0,
        name: "Layer 1",
        cells: [white.id, black.id, black.id, null],
        supportCells: [false, true, false, false],
      },
      {
        index: 1,
        name: "Layer 2",
        cells: [null, black.id, black.id, white.id],
      },
    ],
    palette: [white, black],
    diagnostics: {
      originalBounds: {
        min: [0, 0, 0],
        max: [10, 20, 6],
        size: [10, 20, 6],
      },
      orientedBounds: {
        min: [-10, 0, 0],
        max: [10, 20, 6],
        size: [20, 20, 6],
      },
      scaledSizeMm: [52, 52, 9],
      scale: 1.5,
      naturalLayerCount: 3,
      targetLayerCount: 2,
      generatedLayerCount: 2,
      nonEmptyLayerCount: 2,
      emptyLayerCount: 0,
      occupiedCellsByLayer: [
        { index: 0, occupiedCells: 2 },
        { index: 1, occupiedCells: 3 },
      ],
    },
    support: {
      enabled: true,
      colorId: black.id,
      generatedCells: 1,
      cellsByLayer: [{ index: 0, occupiedCells: 1 }],
    },
  };
}

describe("layered pattern helpers", () => {
  it("converts a layered pattern layer to a single-layer pattern", () => {
    const pattern = layeredPatternToPattern(createLayeredPattern(), 1);

    expect(pattern.kind).toBe("single-layer");
    expect(pattern.width).toBe(2);
    expect(pattern.height).toBe(2);
    expect(pattern.palette).toEqual([white, black]);
    expect(pattern.cells).toEqual([null, black.id, black.id, white.id]);
    expect(pattern.source?.fileName).toBe("sample.3mf-Layer 2");
  });

  it("can hide support cells when creating a single-layer preview", () => {
    const pattern = layeredPatternToPattern(createLayeredPattern(), 0, { includeSupports: false });

    expect(pattern.cells).toEqual([white.id, null, black.id, null]);
    expect(pattern.supportCells).toBeUndefined();
  });

  it("validates and preserves layered project metadata", () => {
    const parsed = validateLayeredPattern(createLayeredPattern());

    expect(parsed).not.toBeNull();
    expect(parsed?.sourceModel?.orientation?.rotateZDeg).toBe(90);
    expect(parsed?.diagnostics?.occupiedCellsByLayer[1]?.occupiedCells).toBe(3);
    expect(parsed?.layers[0]?.supportCells).toEqual([false, true, false, false]);
    expect(parsed?.support?.generatedCells).toBe(1);
  });

  it("normalizes imported orientation degrees", () => {
    const parsed = validateLayeredPattern({
      ...createLayeredPattern(),
      sourceModel: {
        ...createLayeredPattern().sourceModel,
        orientation: {
          rotateXDeg: -90,
          rotateYDeg: 0,
          rotateZDeg: 450,
        },
      },
    });

    expect(parsed?.sourceModel?.orientation).toEqual({
      rotateXDeg: 270,
      rotateYDeg: 0,
      rotateZDeg: 90,
    });
  });

  it("rejects malformed layered projects", () => {
    expect(validateLayeredPattern({ ...createLayeredPattern(), layers: [] })).toBeNull();
    expect(
      validateLayeredPattern({
        ...createLayeredPattern(),
        layers: [{ index: 0, name: "Layer 1", cells: [white.id] }],
      }),
    ).toBeNull();
  });
});
