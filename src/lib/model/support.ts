import type { ModelSliceSettings } from "./types";

export function applyModelSupports(layerCells: Array<Array<string | null>>, settings: ModelSliceSettings) {
  const supportCells = layerCells.map((cells) => new Array<boolean>(cells.length).fill(false));
  const support = settings.support;

  if (!support?.enabled) {
    return {
      supportCells,
      summary: undefined,
    };
  }

  const cellsByLayer = new Map<number, number>();
  let generatedCells = 0;

  for (let layerIndex = 1; layerIndex < layerCells.length; layerIndex += 1) {
    const layer = layerCells[layerIndex];
    if (!layer) continue;

    for (let cellIndex = 0; cellIndex < layer.length; cellIndex += 1) {
      if (!layer[cellIndex]) continue;

      for (let lowerLayerIndex = layerIndex - 1; lowerLayerIndex >= 0; lowerLayerIndex -= 1) {
        const lowerLayer = layerCells[lowerLayerIndex];
        const lowerSupportCells = supportCells[lowerLayerIndex];
        if (!lowerLayer || !lowerSupportCells) continue;
        if (lowerLayer[cellIndex]) break;

        lowerLayer[cellIndex] = support.colorId;
        lowerSupportCells[cellIndex] = true;
        generatedCells += 1;
        cellsByLayer.set(lowerLayerIndex, (cellsByLayer.get(lowerLayerIndex) ?? 0) + 1);
      }
    }
  }

  return {
    supportCells,
    summary: {
      enabled: true,
      colorId: support.colorId,
      generatedCells,
      cellsByLayer: [...cellsByLayer.entries()]
        .map(([index, occupiedCells]) => ({ index, occupiedCells }))
        .sort((a, b) => a.index - b.index),
    },
  };
}
