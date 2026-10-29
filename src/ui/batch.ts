import { jsPDF } from 'jspdf';
import { store } from '../state/store';
import { PALETTE_BY_ID } from '../data/palettes';
import { SIZES } from '../data/sizes';
import type { Blueprint, Palette } from '../core/types';
import { generateFromImage } from './upload';
import { drawPoster } from '../render/poster';
import { shareOrDownload, downloadFile } from './share';
import { t, dateLocale } from '../i18n';
import { track } from '../analytics';

export interface BatchHandles {
  openBtn: HTMLElement;    // 批量导出（下载 PDF + CSV）
  shareBtn: HTMLElement;   // 批量分享（PDF 走系统分享面板，降级下载）
  getFile: () => File | null;
  getUsed: () => Map<string, number>;
  toast: (msg: string) => void;
}

interface BatchResult { size: number; blueprint: Blueprint; used: Map<string, number> }

/**
 * 批量导出：一图 → 全部标准规格的图纸合集 PDF + 配色统计 CSV。
 * - 有源文件：每档规格从原图重新栅格化+量化（质量最好）
 * - 无源文件（打开的存档）：对当前图纸做最近邻重采样到目标规格
 */
export function setupBatch(h: BatchHandles) {
  async function generateAll(): Promise<BatchResult[]> {
    const s = store.get();
    const palette = PALETTE_BY_ID[s.paletteId];
    if (!s.blueprint || !palette) throw new Error('no-blueprint');
    const results: BatchResult[] = [];
    for (const spec of SIZES) {
      const size = spec.w;
      let bp: Blueprint;
      let used: Map<string, number>;
      const file = h.getFile();
      if (file) {
        const r = await generateFromImage(file, size, palette, s.maxColors);
        bp = r.blueprint; used = r.used;
      } else {
        bp = rescaleBlueprint(s.blueprint, size);
        used = countUsed(bp);
      }
      results.push({ size, blueprint: bp, used });
      // 让出主线程，避免大规格连算卡死 UI
      await new Promise((r) => setTimeout(r, 0));
    }
    return results;
  }

  h.openBtn.addEventListener('click', async () => {
    if (!store.get().blueprint) { h.toast(t('t.needBlueprint')); return; }
    h.toast(t('t.batchWorking'));
    track('batch-export');
    try {
      const results = await generateAll();
      const palette = PALETTE_BY_ID[store.get().paletteId]!;
      const title = store.get().title;
      downloadFile(resultsToPdfFile(results, palette, title));
      downloadCsv(results, palette, title);
      h.toast(t('t.batchDone', { n: results.length }));
    } catch (e) {
      if ((e as Error)?.message === 'no-blueprint') return;
      console.error(e);
      h.toast(t('t.batchFail'));
    }
  });

  h.shareBtn.addEventListener('click', async () => {
    if (!store.get().blueprint) { h.toast(t('t.needBlueprint')); return; }
    h.toast(t('t.batchWorking'));
    track('batch-share');
    try {
      const results = await generateAll();
      const palette = PALETTE_BY_ID[store.get().paletteId]!;
      const title = store.get().title;
      const file = resultsToPdfFile(results, palette, title);
      const r = await shareOrDownload(file);
      if (r === 'shared') h.toast(t('t.shared'));
      else if (r === 'downloaded') h.toast(t('t.fallbackDownload'));
    } catch (e) {
      console.error(e);
      h.toast(t('t.batchShareFail'));
    }
  });
}

/** 最近邻重采样：把图纸网格缩放到 n×n（存档无源图时的兜底） */
function rescaleBlueprint(src: Blueprint, n: number): Blueprint {
  const codes: (string | null)[] = new Array(n * n);
  for (let y = 0; y < n; y++) {
    const sy = Math.min(src.h - 1, Math.floor((y * src.h) / n));
    for (let x = 0; x < n; x++) {
      const sx = Math.min(src.w - 1, Math.floor((x * src.w) / n));
      codes[y * n + x] = src.codes[sy * src.w + sx] ?? null;
    }
  }
  return { w: n, h: n, paletteId: src.paletteId, codes, sourceName: src.sourceName };
}

function countUsed(bp: Blueprint): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of bp.codes) if (c) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

/** 合集 → 单个 PDF File（每规格一页海报） */
function resultsToPdfFile(results: BatchResult[], palette: Palette, title: string): File {
  let pdf: jsPDF | null = null;
  for (const r of results) {
    const cv = drawPoster({
      title: `${title} · ${r.size}×${r.size}`,
      blueprint: r.blueprint,
      palette,
      used: r.used,
      meta: `${t('poster.batchMeta')}${new Date().toLocaleDateString(dateLocale())}`,
    });
    if (!pdf) {
      pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [cv.width, cv.height] });
    } else {
      pdf.addPage([cv.width, cv.height], 'portrait');
    }
    pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, cv.width, cv.height);
  }
  const blob = pdf!.output('blob');
  return new File([blob], `${t('file.collection')}${title}.pdf`, { type: 'application/pdf' });
}

function downloadCsv(results: BatchResult[], palette: Palette, title: string) {
  const colorMap = new Map(palette.colors.map((c) => [c.code, c]));
  // 所有规格出现过的色号并集，按合计用量降序
  const total = new Map<string, number>();
  for (const r of results) for (const [code, n] of r.used) total.set(code, (total.get(code) ?? 0) + n);
  const codesUnion = [...total.keys()].sort((a, b) => (total.get(b!)! - total.get(a!)!));

  const head = [t('csv.code'), t('csv.name'), 'HEX', ...results.map((r) => `${r.size}×${r.size}`), t('csv.total')];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [head.map(esc).join(',')];
  for (const code of codesUnion) {
    const c = colorMap.get(code);
    const row = [
      code,
      c?.name ?? '',
      c?.hex ?? '',
      ...results.map((r) => String(r.used.get(code) ?? 0)),
      String(total.get(code) ?? 0),
    ];
    lines.push(row.map(esc).join(','));
  }
  // BOM：让 Excel 正确识别 UTF-8
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadFile(new File([blob], `${t('file.stats')}${title}.csv`, { type: 'text/csv' }));
}
