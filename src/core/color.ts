import type { RGB, LAB } from './types';

// 颜色空间转换与色差计算。量化匹配用 Lab + ΔE76 比纯 RGB 欧氏距离更贴近人眼。

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export function rgbToLab([r, g, b]: RGB): LAB {
  // sRGB -> XYZ (D65)
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  let x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  let y = (lr * 0.2126 + lg * 0.7152 + lb * 0.0722) / 1.0;
  let z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const _labCache = new Map<string, LAB>();
export function labOf(rgb: RGB): LAB {
  const k = rgb.join(',');
  let v = _labCache.get(k);
  if (!v) { v = rgbToLab(rgb); _labCache.set(k, v); }
  return v;
}

/** ΔE76 —— 简单欧氏距离，足够用于拼豆色匹配 */
export function deltaE(a: LAB, b: LAB): number {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const lum = (rgb: RGB) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
export const txtOn = (rgb: RGB) => (lum(rgb) > 0.55 ? '#141C24' : '#F5F2EC');
