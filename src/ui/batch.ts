import { jsPDF } from 'jspdf';
import { store } from '../state/store';
import { PALETTE_BY_ID } from '../data/palettes';
import { SIZES } from '../data/sizes';
import type { Blueprint, Palette } from '../core/types';
import { generateFromImage } from './upload';
import { drawPoster } from '../render/poster';

export interface BatchHandles {
  openBtn: HTMLElement;
  getFile: () => File | null;
  getUsed: () => Map<string, number>;
  toast: (msg: string) => void;
}

/**
 * 批量导出：一图 → 全部标准规格的图纸合集 PDF + 配色统计 CSV。
 * - 有源文件：每档规格从原图重新栅格化+量化（质量最好）
 * - 无源文件（打开的存档）：对当前图纸做最近邻重采样到目标规格
 */
export function setupBatch(h: BatchHandles) {
  h.openBtn.addEventListener('click', async () => {
    const s = store.get();
    if (!s.blueprint) { h.toast('先上传图片生成图纸'); return; }
    const palette = PALETTE_BY_ID[s.paletteId];
    if (!palette) { h.toast('色板异常'); return; }
    h.toast('批量生成中…');

    try {
      const results: { size: number; blueprint: Blueprint; used: Map<string, number> }[] = [];
      for (const spec of SIZES) {
        const size = spec.w;
        let bp: Blueprint;
        let used: Map<string, number>;
        const file = h.getFile();
        if (file) {
          const r = await generateFromImage(file, size, palette, s.maxColors);
          bp = r.blueprint; used = r.used;
        } else {
          bp = rescaleBlueprint(s.blueprint!, size);
          used = countUsed(bp);
        }
        results.push({ size, blueprint: bp, used });
        // 让出主线程，避免大规格连算卡死 UI
        await new Promise((r) => setTimeout(r, 0));
      }

      downloadPdf(results, palette, s.title);
      downloadCsv(results, palette, s.title);
      h.toast(`已导出 ${results.length} 档规格 PDF + CSV`);
    } catch (e) {
      console.error(e);
      h.toast('批量导出失败，看下控制台');
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

function downloadPdf(
  results: { size: number; blueprint: Blueprint; used: Map<string, number> }[],
  palette: Palette,
  title: string
) {
  let pdf: jsPDF | null = null;
  for (const r of results) {
    const cv = drawPoster({
      title: `${title} · ${r.size}×${r.size}`,
      blueprint: r.blueprint,
      palette,
      used: r.used,
      meta: `批量合集 ${new Date().toLocaleDateString('zh-CN')}`,
    });
    if (!pdf) {
      pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [cv.width, cv.height] });
    } else {
      pdf.addPage([cv.width, cv.height], 'portrait');
    }
    pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, cv.width, cv.height);
  }
  pdf?.save(`【拼豆图纸合集】${title}.pdf`);
}

function downloadCsv(
  results: { size: number; blueprint: Blueprint; used: Map<string, number> }[],
  palette: Palette,
  title: string
) {
  const colorMap = new Map(palette.colors.map((c) => [c.code, c]));
  // 所有规格出现过的色号并集，按合计用量降序
  const total = new Map<string, number>();
  for (const r of results) for (const [code, n] of r.used) total.set(code, (total.get(code) ?? 0) + n);
  const codesUnion = [...total.keys()].sort((a, b) => (total.get(b!)! - total.get(a!)!));

  const head = ['色号', '名称', 'HEX', ...results.map((r) => `${r.size}×${r.size}`), '合计'];
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `【拼豆配色统计】${title}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
