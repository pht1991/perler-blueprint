import type { Blueprint } from '../core/types';

export type ViewMode = 'grid' | 'stage';
export type Tool = 'brush' | 'fill' | 'eraser' | 'picker';

export interface AppState {
  title: string;
  view: ViewMode;
  size: number;            // 网格边长（正方形）
  paletteId: string;
  maxColors: number;       // 0 = 不限（用完整色板）
  mirror: boolean;
  meltOn: boolean;
  melt: number;            // 0..1
  scale: number;           // 每格像素（CSS px）
  ox: number; oy: number;  // 平移
  highlight: string | null;
  done: Set<string>;       // 已拼色号
  blueprint: Blueprint | null;
  srcImage: HTMLImageElement | null;
  tool: Tool | null;       // 编辑工具；null = 未进入编辑
  editColor: string | null;// 当前编辑色
}

type Listener = (s: AppState, changed: Set<keyof AppState>) => void;

class Store {
  private state: AppState = {
    title: '拼豆图纸',
    view: 'grid',
    size: 104,
    paletteId: '',
    maxColors: 0,
    mirror: false,
    meltOn: false,
    melt: 0.5,
    scale: 0,
    ox: 0, oy: 0,
    highlight: null,
    done: new Set(),
    blueprint: null,
    srcImage: null,
    tool: null,
    editColor: null,
  };
  private listeners = new Set<Listener>();

  get(): AppState { return this.state; }

  set(patch: Partial<AppState>): void {
    const changed = new Set<keyof AppState>();
    for (const k of Object.keys(patch) as (keyof AppState)[]) {
      (this.state as any)[k] = (patch as any)[k];
      changed.add(k);
    }
    this.emit(changed);
  }

  /** 批量更新但不触发多次渲染：传一个 mutator，最后统一 emit */
  update(mut: (s: AppState) => void, changed: (keyof AppState)[] = []): void {
    mut(this.state);
    this.emit(new Set(changed));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(changed: Set<keyof AppState>) {
    for (const fn of this.listeners) fn(this.state, changed);
  }
}

export const store = new Store();
