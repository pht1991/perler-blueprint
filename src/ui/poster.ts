import { jsPDF } from 'jspdf';
import { drawPoster } from '../render/poster';
import { store } from '../state/store';
import { PALETTE_BY_ID } from '../data/palettes';

export interface PosterHandles {
  openBtn: HTMLElement;
  overlay: HTMLElement;
  img: HTMLImageElement;
  dlPng: HTMLElement;
  dlPdf: HTMLElement;
  closeBtn: HTMLElement;
  getUsed: () => Map<string, number>;
}

/** 海报导出：预览 + 下载 PNG / PDF。 */
export function setupPoster(h: PosterHandles) {
  let lastCanvas: HTMLCanvasElement | null = null;

  function build(): HTMLCanvasElement | null {
    const s = store.get();
    if (!s.blueprint) { alert('先上传图片生成图纸'); return null; }
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
