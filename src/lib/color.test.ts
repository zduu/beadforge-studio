import { describe, expect, it } from "vitest";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import { colorDistance, findNearestColor, hexToRgb, limitPaletteCells } from "./color";

const [white, black, red] = bambuPlaBasicColors;

describe("color helpers", () => {
  it("parses hex colors to RGB", () => {
    expect(hexToRgb("#0A0A0A")).toEqual({ r: 10, g: 10, b: 10 });
  });

  it("uses squared distance between RGB values", () => {
    expect(colorDistance({ r: 0, g: 0, b: 0 }, { r: 3, g: 4, b: 12 })).toBe(169);
  });

  it("finds the nearest color in a palette", () => {
    expect(findNearestColor({ r: 8, g: 8, b: 8 }, [white, black, red]).id).toBe(black.id);
  });

  it("limits cells to the most used palette colors", () => {
    const cells = [white.id, black.id, black.id, red.id, red.id, red.id];
    const rgbs = [
      { r: 244, g: 244, b: 240 },
      { r: 10, g: 10, b: 10 },
      { r: 10, g: 10, b: 10 },
      { r: 211, g: 41, b: 65 },
      { r: 211, g: 41, b: 65 },
      { r: 211, g: 41, b: 65 },
    ];
    const limitedCells = limitPaletteCells(rgbs, cells, [white, black, red], 2);

    expect(limitedCells.every((cell) => cell === black.id || cell === red.id)).toBe(true);
    expect(limitedCells).toHaveLength(cells.length);
  });
});
