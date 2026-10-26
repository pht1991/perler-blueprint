import type { AppState } from '../state/store';
import type { Blueprint, Palette } from '../core/types';
import { rasterizeImage } from '../core/rasterize';
import { quantizeGrid, makeBlueprint } from '../core/quantize';

export interface GenerateResult {
  blueprint: Blueprint;
  used: Map<string, number>;
}

/** 上传图片 → 栅格化 → 量化到色板 → 生成拼豆图纸。核心新能力。 */
export async function generateFromImage(
  file: File,
  size: number,
  palette: Palette,
  maxColors: number
): Promise<GenerateResult> {
  const { raster, isEmpty } = await rasterizeImage(file, size, size, { transparentAsEmpty: true });
  const { codes, used } = quantizeGrid(raster, {
    palette,
    isEmpty,
    maxColors: maxColors > 0 ? maxColors : undefined,
    dither: false,
  });
  const blueprint = makeBlueprint(size, size, palette.id, codes, file.name);
  return { blueprint, used };
}
