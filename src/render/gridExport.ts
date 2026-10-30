import type { Blueprint, Palette } from '../core/types';

export interface GridSheetInput {
  title: string;
  blueprint: Blueprint;
  palette: Palette;
  done?: Set<string>;   // 已拼色号（可选，画勾与小程序一致）
}

const PAPER = '#F5F2EA';
const INK = '#141C24';
const INK2 = '#5B6B7A';

/**
 * 绘制可打印图纸（网格线 + 色号 + 已拼勾），返回离屏 canvas。
 * 与小程序「存相册」drawFull 同一版式：24px/格起步，整图封顶 4096px 自动缩格子。
 */
export function drawGridSheet(input: GridSheetInput): HTMLCanvasElement {
  const { blueprint: bp, palette, done } = input;
  const colorMap = new Map(palette.colors.map((c) => [c.code, c]));

  let cell = 24;
  const MAX = 4096, MARGIN = 40, HEAD = 72;
  while (bp.w * cell > MAX - MARGIN * 2 || bp.h * cell > MAX - MARGIN * 2) {
    cell = Math.floor(cell / 2);
  }
  const W = bp.w * cell + MARGIN * 2;
  const H = bp.h * cell + MARGIN * 2 + HEAD;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;

  x.fillStyle = PAPER; x.fillRect(0, 0, W, H);

  // 标题条
  x.fillStyle = INK; x.textBaseline = 'top';
  x.font = '700 34px Rajdhani, "Noto Sans SC", sans-serif';
  x.fillText(input.title || '', MARGIN, 20);
  x.fillStyle = INK2; x.textAlign = 'right';
  x.font = '400 22px "Noto Sans SC", sans-serif';
  x.fillText(`${bp.w}×${bp.h} · ${palette.label}`, W - MARGIN, 28);
  x.textAlign = 'left';

  // 格子
  const gx0 = MARGIN, gy0 = HEAD;
  for (let yy = 0; yy < bp.h; yy++) {
    for (let xx = 0; xx < bp.w; xx++) {
      const code = bp.codes[yy * bp.w + xx];
      if (!code) continue;
      const c = colorMap.get(code);
      const gx = gx0 + xx * cell, gy = gy0 + yy * cell;
      x.fillStyle = c ? c.hex : '#cccccc';
      x.fillRect(gx, gy, cell + 0.5, cell + 0.5);
      if (done && done.has(code)) {
        x.strokeStyle = 'rgba(0,150,150,0.95)';
        x.lineWidth = Math.max(1.5, cell * 0.1);
        x.beginPath();
        x.moveTo(gx + cell * 0.26, gy + cell * 0.52);
        x.lineTo(gx + cell * 0.44, gy + cell * 0.7);
        x.lineTo(gx + cell * 0.76, gy + cell * 0.3);
        x.stroke();
      }
      if (cell >= 13) {
        const rgb = c ? c.rgb : [128, 128, 128];
        const lum = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
        const fs = Math.min(cell * 0.42, (cell * 1.7) / code.length);
        x.font = `600 ${fs}px "Noto Sans SC", sans-serif`;
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = Math.max(1, fs * 0.14);
        x.strokeStyle = lum > 150 ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.45)';
        x.strokeText(code, gx + cell / 2, gy + cell * 0.54);
        x.fillStyle = lum > 150 ? '#333333' : '#ffffff';
        x.fillText(code, gx + cell / 2, gy + cell * 0.54);
      }
    }
  }

  // 网格线
  x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 1;
  x.beginPath();
  for (let xx = 0; xx <= bp.w; xx++) {
    const gx = gx0 + xx * cell + 0.5;
    x.moveTo(gx, gy0); x.lineTo(gx, gy0 + bp.h * cell);
  }
  for (let yy = 0; yy <= bp.h; yy++) {
    const gy = gy0 + yy * cell + 0.5;
    x.moveTo(gx0, gy); x.lineTo(gx0 + bp.w * cell, gy);
  }
  x.stroke();
  // 外框
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
  x.strokeRect(gx0, gy0, bp.w * cell, bp.h * cell);

  return cv;
}
