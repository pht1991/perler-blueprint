import { drawGridSheet } from '../render/gridExport';
import { store } from '../state/store';
import { PALETTE_BY_ID } from '../data/palettes';
import { canvasToPngFile, shareOrDownload } from './share';
import { t, dateLocale } from '../i18n';
import { track } from '../analytics';

export interface GridExportHandles {
  openBtn: HTMLElement;
  getDone: () => Set<string>;
  toast: (msg: string) => void;
}

/** 图纸导出：带色号 + 网格线的可打印 PNG（与小程序「存相册」同版式）。 */
export function setupGridExport(h: GridExportHandles) {
  h.openBtn.addEventListener('click', async () => {
    const s = store.get();
    if (!s.blueprint) { h.toast(t('t.needBlueprint')); return; }
    const palette = PALETTE_BY_ID[s.paletteId];
    const cv = drawGridSheet({
      title: s.title,
      blueprint: s.blueprint,
      palette,
      done: h.getDone(),
    });
    track('grid-export');
    const safe = (s.title || 'pattern').replace(/[\\/:*?"<>|]/g, '').trim() || 'pattern';
    const file = await canvasToPngFile(cv, `${safe}-${s.blueprint.w}x${s.blueprint.h}-${new Date().toLocaleDateString(dateLocale()).replace(/\//g, '-')}.png`);
    const r = await shareOrDownload(file);
    if (r === 'shared') h.toast(t('ui.gridDlShared'));
    else if (r === 'downloaded') h.toast(t('ui.gridDlDone'));
  });
}
