import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import type { CropRect, Pattern, PatternSettings, Rgb } from "../types";
import { findNearestColor, limitPaletteCells } from "./color";

const SAMPLE_SCALE = 12;
const MAX_PROCESSING_PIXELS = 36_000_000;

export async function imageFileToPattern(file: File, settings: PatternSettings): Promise<Pattern> {
  if (settings.width * settings.height * SAMPLE_SCALE * SAMPLE_SCALE > MAX_PROCESSING_PIXELS) {
    throw new Error("当前图纸尺寸过大，浏览器无法安全处理，请降低宽高后重试");
  }

  const bitmap = await createImageBitmap(file);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = settings.width * SAMPLE_SCALE;
  canvas.height = settings.height * SAMPLE_SCALE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建 Canvas 上下文");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const crop = normalizeCrop(settings.sourceCrop);
  const sourceRect = {
    x: crop.x * sourceWidth,
    y: crop.y * sourceHeight,
    width: crop.width * sourceWidth,
    height: crop.height * sourceHeight,
  };
  const target = getDrawRect(sourceRect.width, sourceRect.height, canvas.width, canvas.height, settings.fitMode);

  context.save();
  if (settings.mirrorX) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(
      bitmap,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      canvas.width - target.x - target.width,
      target.y,
      target.width,
      target.height,
    );
  } else {
    context.drawImage(
      bitmap,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      target.x,
      target.y,
      target.width,
      target.height,
    );
  }
  context.restore();
  bitmap.close();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rgbs: Array<Rgb | null> = [];

  for (let y = 0; y < settings.height; y += 1) {
    for (let x = 0; x < settings.width; x += 1) {
      const rgb = settings.sampleMode === "center"
        ? sampleCenter(imageData, x, y)
        : sampleAverage(imageData, x, y);

      rgbs.push(rgb);
    }
  }

  const enhancedRgbs = enhanceGridColors(rgbs, settings.width, settings.height, settings.detailBoost);
  const cells = enhancedRgbs.map((rgb) => rgb ? findNearestColor(rgb, bambuPlaBasicColors).id : null);

  return {
    version: 1,
    kind: "single-layer",
    width: settings.width,
    height: settings.height,
    palette: bambuPlaBasicColors,
    cells: limitPaletteCells(enhancedRgbs, cells, bambuPlaBasicColors, settings.maxColors),
    settings,
    source: {
      fileName: file.name,
      width: sourceWidth,
      height: sourceHeight,
    },
  };
}

function normalizeCrop(crop: CropRect | null): CropRect {
  if (!crop) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const x = clampUnit(crop.x);
  const y = clampUnit(crop.y);
  const width = Math.max(0.001, Math.min(1 - x, crop.width));
  const height = Math.max(0.001, Math.min(1 - y, crop.height));
  return { x, y, width, height };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function enhanceGridColors(rgbs: Array<Rgb | null>, width: number, height: number, detailBoost: number): Array<Rgb | null> {
  if (detailBoost <= 0) return rgbs;

  const amount = Math.min(100, Math.max(0, detailBoost)) / 100;
  const lowResolutionBoost = Math.min(1, Math.max(0, (48 - Math.min(width, height)) / 20));
  const contrast = 1 + amount * (0.55 + lowResolutionBoost * 0.35);
  const saturation = 1 + amount * (0.45 + lowResolutionBoost * 0.2);
  const sharpen = amount * (0.55 + lowResolutionBoost * 0.45);

  return rgbs.map((rgb, index) => {
    if (!rgb) return null;
    const x = index % width;
    const y = Math.floor(index / width);
    const blurred = getNeighborAverage(rgbs, width, height, x, y) ?? rgb;

    return adjustRgb({
      r: rgb.r + (rgb.r - blurred.r) * sharpen,
      g: rgb.g + (rgb.g - blurred.g) * sharpen,
      b: rgb.b + (rgb.b - blurred.b) * sharpen,
    }, contrast, saturation);
  });
}

function getNeighborAverage(rgbs: Array<Rgb | null>, width: number, height: number, x: number, y: number): Rgb | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
      const rgb = rgbs[yy * width + xx];
      if (!rgb) continue;
      r += rgb.r;
      g += rgb.g;
      b += rgb.b;
      count += 1;
    }
  }

  if (count === 0) return null;
  return { r: r / count, g: g / count, b: b / count };
}

function adjustRgb(rgb: Rgb, contrast: number, saturation: number): Rgb {
  const contrasted = {
    r: (rgb.r - 128) * contrast + 128,
    g: (rgb.g - 128) * contrast + 128,
    b: (rgb.b - 128) * contrast + 128,
  };
  const gray = contrasted.r * 0.299 + contrasted.g * 0.587 + contrasted.b * 0.114;

  return {
    r: clampColor(gray + (contrasted.r - gray) * saturation),
    g: clampColor(gray + (contrasted.g - gray) * saturation),
    b: clampColor(gray + (contrasted.b - gray) * saturation),
  };
}

function clampColor(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}

function getDrawRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number, fitMode: PatternSettings["fitMode"]) {
  if (fitMode === "stretch") {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const useWidth = fitMode === "contain" ? sourceRatio > targetRatio : sourceRatio < targetRatio;
  const width = useWidth ? targetWidth : targetHeight * sourceRatio;
  const height = useWidth ? targetWidth / sourceRatio : targetHeight;

  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

function sampleCenter(imageData: ImageData, cellX: number, cellY: number): Rgb | null {
  const x = cellX * SAMPLE_SCALE + Math.floor(SAMPLE_SCALE / 2);
  const y = cellY * SAMPLE_SCALE + Math.floor(SAMPLE_SCALE / 2);
  const index = (y * imageData.width + x) * 4;
  const alpha = imageData.data[index + 3];

  if (alpha < 16) return null;

  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
  };
}

function sampleAverage(imageData: ImageData, cellX: number, cellY: number): Rgb | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;

  const startX = cellX * SAMPLE_SCALE;
  const startY = cellY * SAMPLE_SCALE;

  for (let y = startY; y < startY + SAMPLE_SCALE; y += 1) {
    for (let x = startX; x < startX + SAMPLE_SCALE; x += 1) {
      const index = (y * imageData.width + x) * 4;
      const alpha = imageData.data[index + 3] / 255;
      if (alpha <= 0) continue;

      r += imageData.data[index] * alpha;
      g += imageData.data[index + 1] * alpha;
      b += imageData.data[index + 2] * alpha;
      weight += alpha;
    }
  }

  if (weight < SAMPLE_SCALE * SAMPLE_SCALE * 0.12) {
    return null;
  }

  return {
    r: Math.round(r / weight),
    g: Math.round(g / weight),
    b: Math.round(b / weight),
  };
}
