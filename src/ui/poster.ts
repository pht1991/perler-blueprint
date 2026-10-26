import { jsPDF } from 'jspdf';
import { drawPoster } from '../render/poster';
import { store } from '../state/store';
import { PALETTE_BY_ID } from '../data/palettes';
import { shareOrDownload, canvasToPngFile } from './share';

export interface PosterHandles {
  openBtn: HTMLElement;
  overlay: HTMLElement;
  img: HTMLImageElement;
  shareBtn: HTMLElement;
  dlPng: HTMLElement;
  dlPdf: HTMLElement;
  closeBtn: HTMLElement;
  getUsed: () => Map<string, number>;
  toast: (msg: string) => void;
}

/** 海报导出：预览 + 下载 PNG / PDF + 分享（移动端可存相册）。 */
export function setupPoster(h: PosterHandles) {
  let lastCanvas: HTMLCanvasElement | null = null;

  function build(): HTMLCanvasElement | null {
    const s = store.get();
    if (!s.blueprint) { h.toast('先上传图片生成图纸'); return null; }
    const palette = PALETTE_BY_ID[s.paletteId];
    const cv = drawPoster({
      title: s.title,
      blueprint: s.blueprint,
      palette,
      used: h.getUsed(),
      meta: new Date().toLocaleDateString('zh-CN'),
    });
    return cv;
  }

  h.openBtn.addEventListener('click', () => {
    const cv = build(); if (!cv) return;
    lastCanvas = cv;
    h.img.src = cv.toDataURL('image/png');
    h.overlay.hidden = false;
  });
  h.closeBtn.addEventListener('click', () => { h.overlay.hidden = true; });

  // 分享 / 存相册：PNG 走系统分享面板（iOS 可「存储图像」进相册），不支持时降级下载
  h.shareBtn.addEventListener('click', async () => {
    if (!lastCanvas) return;
    const file = await canvasToPngFile(lastCanvas, `【拼豆海报】${store.get().title}.png`);
    const r = await shareOrDownload(file);
    if (r === 'shared') h.toast('已调起分享：iOS 选「存储图像」进相册');
    else if (r === 'downloaded') h.toast('当前环境不支持分享，已走下载');
  });

  h.dlPng.addEventListener('click', () => {
    if (!lastCanvas) return;
    const a = document.createElement('a');
    a.href = lastCanvas.toDataURL('image/png');
    a.download = `【拼豆海报】${store.get().title}.png`;
    a.click();
  });

  h.dlPdf.addEventListener('click', () => {
    if (!lastCanvas) return;
    const cv = lastCanvas;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [cv.width, cv.height] });
    pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, cv.width, cv.height);
    pdf.save(`【拼豆海报】${store.get().title}.pdf`);
  });
}
