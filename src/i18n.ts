// [I18N] 轻量中英双语：字典 + t() 动态文案 + data-i18n 静态替换。
// 语言持久化在 localStorage('perler-lang')，默认跟随浏览器（中文环境→zh，否则→en）。

export type Lang = 'zh' | 'en';

const LS_KEY = 'perler-lang';
type Entry = [zh: string, en: string];

const dict: Record<string, Entry> = {
  // ---- header / 通用 ----
  'app.title': ['拼豆图纸', 'Perler Blueprint'],
  'ui.rename': ['改名', 'Rename'],
  'ui.subtitle': ['上传图片 · 生成拼豆图纸', 'Upload an image · make a bead pattern'],
  'ui.upload': ['上传图片', 'Upload'],
  'ui.compare': ['对比', 'Compare'],
  'ui.compareTip': ['原图与图纸并排对照', 'Compare photo & pattern side by side'],
  'ui.batch': ['批量导出', 'Batch Export'],
  'ui.batchShare': ['批量分享', 'Batch Share'],
  'ui.batchShareTip': ['合集 PDF 走系统分享面板（手机可存文件/发微信），不支持时降级下载', 'Collection PDF via the system share sheet (save to Files / WeChat on mobile); falls back to download'],
  'ui.poster': ['导出海报', 'Poster'],
  'ui.exportHtml': ['导出单文件', 'Save HTML'],
  'ui.save': ['保存', 'Save'],
  'ui.close': ['关闭', 'Close'],

  // ---- 侧栏 ----
  'ui.size': ['板规格', 'Board Size'],
  'ui.custom': ['自定义', 'Custom'],
  'ui.sidePh': ['边长', 'Side'],
  'ui.go': ['生成', 'Go'],
  'ui.palette': ['色板', 'Palette'],
  'ui.colorCount': ['颜色数量', 'Color Count'],
  'ui.unlimited': ['不限', 'All'],
  'ui.budgetN': ['≤{n}色', '≤{n}'],
  'ui.viewOps': ['视图 / 操作', 'View / Tools'],
  'ui.viewGrid': ['平面', 'Flat'],
  'ui.viewStage': ['3D 豆板', '3D Board'],
  'ui.mirror': ['镜像', 'Mirror'],
  'ui.codes': ['色号', 'Codes'],
  'ui.codesTip': ['在格子里标注色号（放大后可见）', 'Print color codes in cells (visible when zoomed in)'],
  'ui.pixel': ['像素图', 'Pixels'],
  'ui.pixelTip': ['纯色块平面渲染，方便对照原图检查', 'Flat solid-cell view, handy for checking against the photo'],
  'ui.depth': ['立体分层', 'Depth'],
  'ui.depthTip': ['3D 视图下按图片明暗把豆板堆成立体分层', 'In 3D view, stack the board into layers by image brightness'],
  'ui.island': ['孤立像素', 'Isolated Beads'],
  'ui.islandN': ['{n} 颗', '{n}'],
  'ui.islandClear': ['一键清除散珠', 'Clear All'],
  'ui.islandNote': ['四周无相邻珠子的单颗珠，拼的时候要单独固定，建议清除', 'Lone beads with no neighbors need extra fixing while fusing — clearing them is recommended'],
  'ui.usage': ['颜色用量', 'Color Usage'],
  'ui.allDone': ['全✓', 'All✓'],
  'ui.allDoneTip': ['全部标记已拼 / 全部清除', 'Mark all done / clear all'],
  'ui.allColors': ['全部色号 ▾', 'All colors ▾'],
  'ui.searchPh': ['搜索色号 / 名称 / HEX', 'Search code / name / HEX'],

  // ---- 编辑工具条 ----
  'tool.brush': ['✎ 画笔', '✎ Brush'],
  'tool.brushTip': ['画笔（B）：按住拖动连续绘制', 'Brush (B): hold and drag to paint'],
  'tool.fill': ['▨ 填充', '▨ Fill'],
  'tool.fillTip': ['填充（G）：把相连的同色区域换成当前色', 'Fill (G): recolor a connected same-color area'],
  'tool.eraser': ['⌫ 橡皮', '⌫ Erase'],
  'tool.eraserTip': ['橡皮（X）：清除格子', 'Eraser (X): clear cells'],
  'tool.picker': ['◉ 取色', '◉ Pick'],
  'tool.pickerTip': ['取色（I）：吸取当前格颜色', 'Picker (I): sample the cell color'],
  'ui.undo': ['撤销', 'Undo'],
  'ui.undoTip': ['撤销（Ctrl+Z）', 'Undo (Ctrl+Z)'],
  'ui.redo': ['重做', 'Redo'],
  'ui.redoTip': ['重做（Ctrl+Shift+Z）', 'Redo (Ctrl+Shift+Z)'],
  'ui.reset': ['恢复初始', 'Reset'],
  'ui.resetTip': ['放弃全部编辑，回到生成时的图纸', 'Discard all edits and restore the generated pattern'],

  // ---- 画布 / 视图 ----
  'ui.top': ['俯视', 'Top'],
  'ui.topTip': ['镜头移到豆板正上方', 'Move the camera right above the board'],
  'ui.photo': ['原图', 'Photo'],
  'ui.pattern': ['图纸', 'Pattern'],

  // ---- 海报弹层 ----
  'ui.posterPreview': ['拼豆海报预览', 'Poster Preview'],
  'ui.shareSave': ['分享 / 存相册', 'Share / Save'],
  'ui.shareSaveTip': ['PNG 走系统分享面板，iOS 可「存储图像」直接进相册', 'PNG via the system share sheet; on iOS choose "Save Image" for Photos'],
  'ui.dlPng': ['下载 PNG', 'Download PNG'],
  'ui.dlPdf': ['下载 PDF', 'Download PDF'],

  // ---- 对比弹层 ----
  'ui.compareTitle': ['原图对比', 'Photo Compare'],
  'ui.compareNote': ['拖动中间分隔线，左右滑动对比原图与图纸', 'Drag the middle divider to compare the photo and the pattern'],

  // ---- 动态提示 ----
  't.generated': ['已生成图纸', 'Pattern generated'],
  't.needBlueprint': ['先上传图片生成图纸', 'Upload an image to make a pattern first'],
  't.noSrcImg': ['这份存档没带原图（旧档），重新上传一次即可', 'This saved file has no photo (old archive) — just re-upload it'],
  't.islandCleared': ['已清除 {n} 颗孤立散珠', 'Cleared {n} isolated beads'],
  't.confirmRestore': ['放弃全部编辑，恢复到生成时的图纸？', 'Discard all edits and restore the generated pattern?'],
  't.restored': ['已恢复初始图纸', 'Restored the original pattern'],
  't.allMarked': ['已全部标记为已拼', 'All colors marked as done'],
  't.allCleared': ['已清除全部完成标记', 'All done marks cleared'],
  't.doneMark': ['{code} 标记已拼 · 剩余 {left} 色', '{code} marked done · {left} colors left'],
  't.undoneMark': ['{code} 已取消标记 · 剩余 {left} 色', '{code} unmarked · {left} colors left'],
  't.emptyBoard': ['图纸是空的，没东西可编辑', 'The pattern is empty — nothing to edit'],
  't.autoPick': ['已自动选 {code}（用量最多）· 换色点右侧色块', 'Auto-picked {code} (most used) · tap a swatch to change'],
  't.depthHint': ['立体分层在「3D 豆板」视图生效', 'Depth works in the "3D Board" view'],
  't.devExport': ['自导出请用 npm run build 后的单文件', 'Self-export works with the built single file (npm run build)'],
  't.renamePrompt': ['图纸标题', 'Pattern title'],
  't.batchWorking': ['批量生成中…', 'Generating…'],
  't.batchDone': ['已导出 {n} 档规格 PDF + CSV', 'Exported PDF + CSV for {n} sizes'],
  't.batchFail': ['批量导出失败，看下控制台', 'Batch export failed — see the console'],
  't.batchShareFail': ['批量分享失败，看下控制台', 'Batch share failed — see the console'],
  't.shared': ['已调起分享（PDF 可存「文件」/发微信；相册只收图片）', 'Share sheet opened (PDF → Files / WeChat; Photos only takes images)'],
  't.sharedPoster': ['已调起分享：iOS 选「存储图像」进相册', 'Share sheet opened: on iOS choose "Save Image" for Photos'],
  't.fallbackDownload': ['当前环境不支持分享，已走下载', 'Sharing not supported here — downloaded instead'],
  't.searchCap': ['仅显示前 {cap} / 共 {n} 色，请缩小搜索', 'Showing first {cap} of {n} colors — refine the search'],
  't.hintIdlePick': ['点工具开涂', 'Tap a tool to start'],
  't.hintIdleNoPick': ['点画笔即可开始（自动选色）', 'Tap Brush to start (auto color)'],

  // ---- 工具操作提示 ----
  'hint.brush': ['按住涂抹上色 · 换色点右侧色块', 'Hold to paint · tap a swatch to change color'],
  'hint.fill': ['点一下 = 相连同色区域整体换色', 'Tap = recolor the connected area'],
  'hint.eraser': ['点一下或按住抹掉珠子', 'Tap or hold to remove beads'],
  'hint.picker': ['点图纸上的珠子吸取颜色（吸完自动切回画笔）', 'Tap a bead to sample its color (auto-switches to Brush)'],
  'item.colorTip': ['点色块=选为编辑色 · 点行=高亮追踪 · ✓=标记已拼', 'Swatch = edit color · Row = highlight · ✓ = done'],
  'item.doneTip': ['标记已拼', 'Mark done'],

  // ---- 动态列表文案 ----
  'list.beads': ['{n} 颗', '{n} beads'],
  'list.colors': ['{n}色', '{n} colors'],
  'list.usage': ['{n} 色', '{n} colors'],
  'list.usageDone': ['共 {n} 色 · 已拼 {m}', '{n} colors · {m} done'],

  // ---- 海报画布 ----
  'poster.chart': ['色号对照表', 'Color Chart'],
  'poster.beads': ['{n} 颗 · {pct}%', '{n} beads · {pct}%'],
  'poster.batchMeta': ['批量合集 ', 'Batch collection '],

  // ---- 文件名 ----
  'file.poster': ['【拼豆海报】', '[Perler Poster] '],
  'file.collection': ['【拼豆图纸合集】', '[Perler Patterns] '],
  'file.stats': ['【拼豆配色统计】', '[Perler Color Stats] '],
  'file.html': ['【拼豆图纸】', '[Perler Pattern] '],
  'file.photo': ['源图', 'photo'],

  // ---- CSV 表头 ----
  'csv.code': ['色号', 'Code'],
  'csv.name': ['名称', 'Name'],
  'csv.total': ['合计', 'Total'],
};

let lang: Lang = initLang();

function initLang(): Lang {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en';
}

type Listener = (l: Lang) => void;
const listeners = new Set<Listener>();

export function getLang(): Lang { return lang; }

export function t(key: string, params?: Record<string, string | number>): string {
  const e = dict[key];
  let s = e ? (lang === 'zh' ? e[0] : e[1]) : key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** 语言环境日期（海报 meta / CSV 用） */
export function dateLocale(): string { return lang === 'zh' ? 'zh-CN' : 'en-US'; }

export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem(LS_KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  applyStatic();
  for (const fn of listeners) fn(l);
}

export function onLangChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 初始应用：html lang + 静态 DOM 替换 */
export function initI18n(): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  applyStatic();
}

/** 扫描 data-i18n（textContent）/ data-i18n-title / data-i18n-ph（placeholder）并替换 */
export function applyStatic(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh!);
  });
}
