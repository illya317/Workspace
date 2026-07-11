/**
 * Core UI interaction tokens.
 *
 * Two categories:
 * 1. Size Tokens — single control dimensions (height, padding, text, icon, radius)
 * 2. Layout Tokens — container rules (wrap, gap, grid, overflow, alignment)
 *
 * All interactive controls derive dimensions from these tokens.
 * Toolbar picks one size档 and passes it down; it never invents heights.
 */

// ── Size档 ────────────────────────────────────────────────────────────────

export type ControlSize = "sm" | "md" | "lg" | "xl";

// ─── 1. Size Tokens: 控件自身尺寸 ──────────────────────────────────────────

export interface ControlSizeTokens {
  /** 控件高度 h-8 / h-9 / h-10 / h-11 */
  height: string;
  /** 水平内边距 px-2.5 / px-3 / px-4 */
  paddingX: string;
  /** 垂直内边距（单行控件通常不需要，留给 textarea 等多行控件） */
  paddingY: string;
  /** 字号 text-xs / text-sm */
  text: string;
  /** 行高 leading-none / leading-tight */
  leading: string;
  /** 圆角 rounded-md / rounded-lg */
  radius: string;
  /** 图标尺寸 h-3.5 / h-4 / h-5 */
  iconSize: string;
  /** 最小宽度 min-w-20 / min-w-24 / min-w-28 */
  minWidth: string;
  /** 最大宽度（搜索框等需要限制宽度的控件）max-w-48 / max-w-64 / max-w-80 */
  maxWidth: string;
}

export const CONTROL_SIZES: Record<ControlSize, ControlSizeTokens> = {
  sm: {
    height: "h-8",
    paddingX: "px-2.5",
    paddingY: "py-1",
    text: "text-xs",
    leading: "leading-none",
    radius: "rounded-md",
    iconSize: "h-3.5 w-3.5",
    minWidth: "min-w-20",
    maxWidth: "max-w-48",
  },
  md: {
    height: "h-9",
    paddingX: "px-3",
    paddingY: "py-1.5",
    text: "text-xs",
    leading: "leading-none",
    radius: "rounded-md",
    iconSize: "h-4 w-4",
    minWidth: "min-w-24",
    maxWidth: "max-w-64",
  },
  lg: {
    height: "h-10",
    paddingX: "px-4",
    paddingY: "py-2",
    text: "text-sm",
    leading: "leading-tight",
    radius: "rounded-lg",
    iconSize: "h-4 w-4",
    minWidth: "min-w-28",
    maxWidth: "max-w-80",
  },
  xl: {
    height: "h-11",
    paddingX: "px-4",
    paddingY: "py-2.5",
    text: "text-sm",
    leading: "leading-tight",
    radius: "rounded-lg",
    iconSize: "h-5 w-5",
    minWidth: "min-w-32",
    maxWidth: "max-w-96",
  },
};

// ─── Option Group 内部按钮尺寸 ─────────────────────────────────────────────

export interface ControlGroupTokens {
  containerHeight: string;
  containerPadding: string;
  containerGap: string;
  containerRadius: string;
  itemHeight: string;
  itemPaddingX: string;
  itemText: string;
  itemRadius: string;
}

export const CONTROL_GROUP_SIZES: Record<ControlSize, ControlGroupTokens> = {
  sm: {
    containerHeight: "h-8",
    containerPadding: "p-0.5",
    containerGap: "gap-0.5",
    containerRadius: "rounded-md",
    itemHeight: "h-7",
    itemPaddingX: "px-2",
    itemText: "text-xs",
    itemRadius: "rounded-sm",
  },
  md: {
    containerHeight: "h-9",
    containerPadding: "p-1",
    containerGap: "gap-1",
    containerRadius: "rounded-lg",
    itemHeight: "h-7",
    itemPaddingX: "px-3",
    itemText: "text-xs",
    itemRadius: "rounded-md",
  },
  lg: {
    containerHeight: "h-10",
    containerPadding: "p-1",
    containerGap: "gap-1",
    containerRadius: "rounded-lg",
    itemHeight: "h-8",
    itemPaddingX: "px-3",
    itemText: "text-sm",
    itemRadius: "rounded-md",
  },
  xl: {
    containerHeight: "h-11",
    containerPadding: "p-1.5",
    containerGap: "gap-1.5",
    containerRadius: "rounded-lg",
    itemHeight: "h-8",
    itemPaddingX: "px-4",
    itemText: "text-sm",
    itemRadius: "rounded-md",
  },
};

// ─── 2. Layout Tokens: 容器布局规则 ────────────────────────────────────────

/** Toolbar / 工具栏行内间距 */
export const TOOLBAR_GAP: Record<ControlSize, string> = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-3",
  xl: "gap-3",
};

/** 表单网格列数 → 列宽 className */
export const FIELD_GRID_COLS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

/** 表单网格行间距 */
export const FIELD_GRID_GAP: Record<ControlSize, string> = {
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
  xl: "gap-4",
};

/** 文字溢出处理 */
export const TEXT_OVERFLOW = {
  /** 单行截断 */
  truncate: "min-w-0 flex-1 truncate",
  /** 多行截断（需配合 line-clamp） */
  lineClamp2: "min-w-0 flex-1 line-clamp-2",
  /** 不截断，允许撑开 */
  expand: "min-w-0 flex-1",
} as const;

/** 自动换行容器 */
export const FLEX_WRAP = "flex flex-wrap items-center" as const;

/** 每行等高（用于表单行内控件对齐） */
export const ROW_EQUAL_HEIGHT = "items-stretch" as const;

/** Label 固定宽度（用于表单 label + control 对齐） */
export const LABEL_WIDTHS: Record<ControlSize, string> = {
  sm: "w-20",
  md: "w-24",
  lg: "w-28",
  xl: "w-32",
};

// ─── 3. Typography Tokens: 字体排印 ────────────────────────────────────────

/** 字族 */
export const FONT_FAMILY = {
  sans: "font-sans",
  mono: "font-mono",
} as const;

/** 字重 */
export const FONT_WEIGHT = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
} as const;

/** 字号（比 CONTROL_SIZES.text 更完整的字号阶梯，用于非控件场景） */
export const FONT_SIZE = {
  xs: "text-xs",        // 12px - 控件默认
  sm: "text-sm",        // 14px - 正文
  base: "text-base",    // 16px - 大正文
  lg: "text-lg",        // 18px - 小标题
  xl: "text-xl",        // 20px - 标题
} as const;

/** 行高 */
export const LINE_HEIGHT = {
  none: "leading-none",       // 1 - 紧凑控件
  tight: "leading-tight",     // 1.25 - 控件
  snug: "leading-snug",       // 1.375 - 紧凑正文
  normal: "leading-normal",   // 1.5 - 正文默认
  relaxed: "leading-relaxed", // 1.625 - 宽松正文
} as const;

/** 控件常用字重（按钮、标签等默认 semibold） */
export const CONTROL_FONT_WEIGHT = FONT_WEIGHT.semibold;

/** 正文常用字重 */
export const BODY_FONT_WEIGHT = FONT_WEIGHT.normal;

/** 标签/标题常用字重 */
export const LABEL_FONT_WEIGHT = FONT_WEIGHT.semibold;

/** 代码/等宽字体场景 */
export const MONO_FONT_WEIGHT = FONT_WEIGHT.normal;

/** 语义化文字样式（按使用场景分，避免混用） */
export const TEXT_STYLES = {
  /** 控件文字：按钮、输入框、select/field-filter trigger */
  controlText: `${FONT_SIZE.xs} ${FONT_WEIGHT.semibold} ${LINE_HEIGHT.none} text-slate-700`,
  /** 标签文字：字段 label、表头、section title */
  labelText: `${FONT_SIZE.xs} ${FONT_WEIGHT.semibold} ${LINE_HEIGHT.none} text-slate-500`,
  /** 正文文字：说明、值展示、正文内容 */
  contentText: `${FONT_SIZE.sm} ${FONT_WEIGHT.normal} ${LINE_HEIGHT.normal} text-slate-700`,
  /** 辅助文字：hint、placeholder、次要信息 */
  mutedText: `${FONT_SIZE.xs} ${FONT_WEIGHT.normal} ${LINE_HEIGHT.normal} text-slate-400`,
} as const;

// ── 便捷函数 ──────────────────────────────────────────────────────────────

export function getControlClassName(size: ControlSize = "md"): string {
  const t = CONTROL_SIZES[size];
  return `${t.height} ${t.paddingX} ${t.text} ${t.leading} ${t.radius}`;
}

export function getControlGroupClassName(size: ControlSize = "md"): string {
  const t = CONTROL_GROUP_SIZES[size];
  return `${t.containerHeight} ${t.containerPadding} ${t.containerGap} ${t.containerRadius}`;
}

export function getControlGroupItemClassName(size: ControlSize = "md"): string {
  const t = CONTROL_GROUP_SIZES[size];
  return `${t.itemHeight} ${t.itemPaddingX} ${t.itemText} ${t.itemRadius}`;
}
