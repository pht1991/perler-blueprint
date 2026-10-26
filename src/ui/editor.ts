import { store } from '../state/store';
import { saveBlueprint } from '../persist/storage';
import type { Tool } from '../state/store';

// [EDIT-MODE] 编辑器：画笔/填充/橡皮/取色 + diff 版撤销/重做。
// 撤销栈存「变更批次」（本批 touched 格子的 from/to），不存整图快照——156×156 全量快照一批几百 KB，diff 只存改动格。

interface CellChange { idx: number; from: string | null; to: string | null; }

const MAX_UNDO = 100;

export class Editor {
  private canvas: HTMLCanvasElement;
  private undoStack: CellChange[][] = [];
  private redoStack: CellChange[][] = [];
  private drawing = false;
  private batch: CellChange[] = [];
  private touched = new Set<number>();
  private activePointer: number | null = null;

  /** 每改一格（拖动中实时重绘用） */
  onPaint: (() => void) | null = null;
  /** 一批结束（松手/填充完成）：重算用量、保存 */
  onCommit: (() => void) | null = null;
  /** 取色后自动切回画笔等工具状态变化，让 main 同步按钮态 */
  onToolChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Pointer Events 统一鼠标/触摸/笔：移动端单指可画（main.ts 里双指捏合会调 cancelDraw 让位）
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  // ---- 坐标换算（含镜像反算：屏幕列 -> 数据列） ----
  private cellAt(p: { clientX: number; clientY: number }): number | null {
    const s = store.get();
    const bp = s.blueprint; if (!bp) return null;
    const rect = this.canvas.getBoundingClientRect();
    const cell = s.scale || 6;
    const col = Math.floor((p.clientX - rect.left - s.ox) / cell);
    const row = Math.floor((p.clientY - rect.top - s.oy) / cell);
    if (col < 0 || col >= bp.w || row < 0 || row >= bp.h) return null;
    const dataCol = s.mirror ? bp.w - 1 - col : col;
    return row * bp.w + dataCol;
  }

  private onDown(e: PointerEvent) {
    const s = store.get();
    if (!s.blueprint || !s.tool || !s.editColor && s.tool !== 'eraser' && s.tool !== 'picker') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.activePointer !== null) return; // 已在绘制中（防第二根手指误触发）
    const idx = this.cellAt(e); if (idx === null) return;
    this.drawing = true;
    this.activePointer = e.pointerId;
    this.batch = []; this.touched.clear();
    this.apply(idx);
    this.onPaint?.();
  }

  private onMove(e: PointerEvent) {
    if (!this.drawing || e.pointerId !== this.activePointer) return;
    const s = store.get();
    // 只有画笔/橡皮支持按住拖动；填充、取色按下一次即完成
    if (s.tool !== 'brush' && s.tool !== 'eraser') return;
    const idx = this.cellAt(e); if (idx === null) return;
    this.apply(idx);
    this.onPaint?.();
  }

  private onUp(e: PointerEvent) {
    if (!this.drawing || e.pointerId !== this.activePointer) return;
    this.finish();
  }

  /** 结束本批绘制（松手或被捏合手势打断） */
  cancelDraw() { this.finish(); }

  private finish() {
    if (!this.drawing) return;
    this.drawing = false;
    this.activePointer = null;
    if (this.batch.length) {
      this.undoStack.push(this.batch);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.redoStack = [];
      saveBlueprint(store.get());
    }
    this.batch = []; this.touched.clear();
    this.onCommit?.();
  }

  /** 记录并应用单格变更；同批次同格合并（保留最初 from、最终 to） */
  private record(idx: number, to: string | null) {
    const codes = store.get().blueprint!.codes;
    const from = codes[idx] ?? null;
    if (from === to) return;
    if (this.touched.has(idx)) {
      const prev = this.batch.find((c) => c.idx === idx);
      if (prev) prev.to = to;
    } else {
      this.touched.add(idx);
      this.batch.push({ idx, from, to });
    }
    codes[idx] = to;
  }

  private apply(idx: number) {
    const s = store.get();
    const bp = s.blueprint!;
    switch (s.tool) {
      case 'brush':
        this.record(idx, s.editColor);
        break;
      case 'eraser':
        this.record(idx, null);
        break;
      case 'picker': {
        const c = bp.codes[idx] ?? null;
        if (c) {
          store.set({ editColor: c, highlight: c, tool: 'brush' });
          this.onToolChange?.();
        }
        break;
      }
      case 'fill': {
        const target = bp.codes[idx] ?? null;
        const replacement = s.editColor;
        if (target === replacement) return;
        const { w, h, codes } = bp;
        const stack = [idx]; const seen = new Set<number>([idx]);
        while (stack.length) {
          const cur = stack.pop()!;
          this.record(cur, replacement);
          const x = cur % w;
          const y = (cur - x) / w;
          const nbs = [x > 0 ? cur - 1 : -1, x < w - 1 ? cur + 1 : -1, y > 0 ? cur - w : -1, y < h - 1 ? cur + w : -1];
          for (const n of nbs) {
            if (n < 0 || seen.has(n)) continue;
            if ((codes[n] ?? null) === target) { seen.add(n); stack.push(n); }
          }
        }
        break;
      }
    }
  }

  // ---- 撤销 / 重做 ----
  undo() {
    const batch = this.undoStack.pop(); if (!batch) return;
    const codes = store.get().blueprint!.codes;
    for (let i = batch.length - 1; i >= 0; i--) { const c = batch[i]; codes[c.idx] = c.from; }
    this.redoStack.push(batch);
    saveBlueprint(store.get());
    this.onPaint?.(); this.onCommit?.();
  }

  redo() {
    const batch = this.redoStack.pop(); if (!batch) return;
    const codes = store.get().blueprint!.codes;
    for (const c of batch) codes[c.idx] = c.to;
    this.undoStack.push(batch);
    saveBlueprint(store.get());
    this.onPaint?.(); this.onCommit?.();
  }
}
