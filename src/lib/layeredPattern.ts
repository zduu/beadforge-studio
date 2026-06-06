import type { LayeredPattern, Pattern } from "../types";

export function layeredPatternToPattern(layeredPattern: LayeredPattern, layerIndex: number): Pattern {
  const layer = layeredPattern.layers[layerIndex] ?? layeredPattern.layers[0];

  return {
    version: 1,
    kind: "single-layer",
    width: layeredPattern.width,
    height: layeredPattern.height,
    palette: layeredPattern.palette,
    cells: layer?.cells ?? Array.from({ length: layeredPattern.width * layeredPattern.height }, () => null),
    settings: {
      width: layeredPattern.width,
      height: layeredPattern.height,
      fitMode: "contain",
      sampleMode: "average",
      maxColors: layeredPattern.palette.length,
      detailBoost: 0,
      sourceCrop: null,
      mirrorX: false,
    },
    source: layeredPattern.sourceModel
      ? {
          fileName: `${layeredPattern.sourceModel.fileName}-${layer?.name ?? "layer"}`,
          width: layeredPattern.width,
          height: layeredPattern.height,
        }
      : undefined,
  };
}
