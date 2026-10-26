// 全局类型定义

export type RGB = [number, number, number];
export type LAB = [number, number, number];

export interface BeadColor {
  code: string;       // 色号，如 "A1"
  name: string;       // 中文名
  rgb: RGB;
  hex: string;
  lab?: LAB;          // 预计算 Lab，用于更准的色差匹配
}

export interface Palette {
  id: string;
  label: string;
  group?: string;
  sub?: string;
  colors: BeadColor[];
}

export interface SizeSpec {
  key: string;
  w: number;
  h: number;
  isCustom?: boolean;
}

/** 一张生成的拼豆图纸：网格里每格是色号，null 表示空（背景/留白） */
export interface Blueprint {
  w: number;
  h: number;
  paletteId: string;
  codes: (string | null)[];   // 长度 = w * h，行优先
  sourceName?: string;
}
