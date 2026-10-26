import type { RGB } from './types';

export interface RasterResult {
  w: number;
  h: number;
  /** 行优先，长度 w*h*3，每像素 RGB；像素已被缩放/居中裁切到目标网格 */
  data: Uint8ClampedArray;
}

/** 把图片等比缩放放到 (w x h) 网格，返回逐像素 RGB。
 *  - fit: 'contain'（默认）整图完整放入、不足处留空；'cover' 居中裁切铺满（会切边）
 *  - transparentAsEmpty: 透明像素记为空（由调用方决定背景）
 */
export async function rasterizeImage(
  file: File,
  w: number,
  h: number,
  opts: { transparentAsEmpty?: boolean; fit?: 'cover' | 'contain' } = {}
): Promise<{ raster: RasterResult; isEmpty: Uint8Array }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';

    // 等比缩放：contain 完整放入（默认，不切图）；cover 居中裁切铺满
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = (opts.fit ?? 'contain') === 'cover'
      ? Math.max(w / iw, h / ih)
      : Math.min(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (w - dw) / 2, dy = (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const out = new Uint8ClampedArray(w * h * 3);
    const isEmpty = new Uint8Array(w * h); // 1 = 空（背景）
    const transparentAsEmpty = opts.transparentAsEmpty ?? true;

    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const a = data[p + 3];
      if (transparentAsEmpty && a < 128) { isEmpty[i] = 1; continue; }
      out[i * 3] = data[p];
      out[i * 3 + 1] = data[p + 1];
      out[i * 3 + 2] = data[p + 2];
    }
    return { raster: { w, h, data: out }, isEmpty };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
