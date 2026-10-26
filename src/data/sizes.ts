import type { SizeSpec } from '../core/types';

// 板规格（与原文件一致）。正方形网格；自定义 N 由 UI 动态追加。
export const SIZES: SizeSpec[] = [
  { key: '36', w: 36, h: 36 },
  { key: '52', w: 52, h: 52 },
  { key: '78', w: 78, h: 78 },
  { key: '104', w: 104, h: 104 },
  { key: '156', w: 156, h: 156 },
];

export const DEFAULT_SIZE = '104';
export const MIN_CUSTOM = 15;
export const MAX_CUSTOM = 156;

export function sizeKeyOf(n: number): string { return String(n); }
