import type { Blueprint, Palette } from '../core/types';

export interface PosterInput {
  title: string;
  blueprint: Blueprint;
  palette: Palette;
  used: Map<string, number>;
  meta?: string;
}

const PAPER = '#F5F2EA';
const INK = '#141C24';
const INK2 = '#5B6B7A';
const RED = '#FF4655';

/** 绘制分享海报（竖版），返回离屏 canvas。内容：标题 + 图纸预览 + 色号对照表。 */
export function drawPoster(input: PosterInput): HTMLCanvasElement {
  const { title, blueprint, palette, used, meta } = input;
  const W = 1080;
  const colorMap = new Map(palette.colors.map((c) => [c.code, c]));

  const items = [...used.entries()].sort((a, b) => b[1] - a[1]);
  const total = items.reduce((s, [, n]) => s + n, 0);
  const cols = 3;
  const rows = Math.ceil(items.length / cols);
  const swatch = 56, rowH = 76, chartTop = 40;
  const prevSize = 900;
  const chartStart = 150 + prevSize + 40;
  const H = chartStart + chartTop + rows * rowH + 60;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  x.fillStyle = PAPER; x.fillRect(0, 0, W, H);

  // 标题
  x.fillStyle = INK; x.textBaseline = 'top';
  x.font = '700 52px Rajdhani, "Noto Sans SC", sans-serif';
  x.fillText(title || '拼豆图纸', 60, 50);
  x.fillStyle = INK2; x.font = '400 24px "Noto Sans SC", sans-serif';
  const sub = `${blueprint.w}×${blueprint.h} · ${palette.label}${meta ? ' · ' + meta : ''}`;
  x.fillText(sub, 60, 112);

  // 图纸预览
  const px0 = (W - prevSize) / 2, py0 = 150;
  const cell = prevSize / blueprint.w;
  for (let yy = 0; yy < blueprint.h; yy++) {
    for (let xx = 0; xx < blueprint.w; xx++) {
      const code = blueprint.codes[yy * blueprint.w + xx];
      if (!code) continue;
      const c = colorMap.get(code); if (!c) continue;
      x.fillStyle = c.hex;
      x.fillRect(px0 + xx * cell, py0 + yy * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  // 预览边框
  x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2;
  x.strokeRect(px0, py0, prevSize, prevSize);

  // 色号对照表
  const chartX = 60, chartW = W - 120;
  let cy = chartStart;
  x.fillStyle = RED; x.font = '700 30px Rajdhani, "Noto Sans SC", sans-serif';
  x.fillText('色号对照表', chartX, cy); cy += chartTop;
  x.font = '400 22px "Noto Sans SC", sans-serif';
  const colW = chartW / cols;
  items.forEach(([code, n], i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const ix = chartX + c * colW, iy = cy + r * rowH;
    const color = colorMap.get(code);
    x.fillStyle = color?.hex ?? '#ccc';
    roundRect(x, ix, iy, swatch, swatch, 8); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.15)'; x.lineWidth = 1; x.stroke();
    x.fillStyle = INK; x.font = '700 26px Rajdhani, sans-serif';
    x.fillText(code, ix + swatch + 14, iy + 4);
    x.fillStyle = INK2; x.font = '400 20px "Noto Sans SC", sans-serif';
    const name = color?.name ?? '';
    x.fillText(name.slice(0, 8), ix + swatch + 14, iy + 34);
    x.fillText(`${n} 颗 · ${((n / total) * 100).toFixed(1)}%`, ix + swatch + 14, iy + 58);
  });

  return cv;
}

function roundRect(x: CanvasRenderingContext2D, rx: number, ry: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}
