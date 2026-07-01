// Core Field Spec
// 统一字段容器、输入控件、只读值、标签、辅助文案和标签输入的视觉 token。
// 业务页应优先使用 Page API（FormField / FieldGrid / ReadOnlyField / TagListInput 等），
// 不要直接 import 这些 foundation token。

/**
 * 字段控件尺寸档。
 *
 * Toolbar 仍使用 CONTROL_SIZES；detail / form 字段使用此套独立 token，
 * 保证默认字段 value 与现有 TextField 视觉一致（text-sm）。
 */
export type FieldControlSize = "sm" | "md" | "lg";

export interface FieldControlSizeTokens {
  height: string;
  minHeight: string;
  paddingX: string;
  paddingY: string;
  text: string;
  leading: string;
  radius: string;
}

export const FIELD_CONTROL_SIZE_TOKENS: Record<FieldControlSize, FieldControlSizeTokens> = {
  sm: {
    height: "h-8",
    minHeight: "min-h-8",
    paddingX: "px-2.5",
    paddingY: "py-0",
    text: "text-xs",
    leading: "leading-none",
    radius: "rounded-md",
  },
  md: {
    height: "h-9",
    minHeight: "min-h-9",
    paddingX: "px-3",
    paddingY: "py-0",
    text: "text-sm",
    leading: "leading-none",
    radius: "rounded-md",
  },
  lg: {
    height: "h-10",
    minHeight: "min-h-10",
    paddingX: "px-4",
    paddingY: "py-0",
    text: "text-sm",
    leading: "leading-tight",
    radius: "rounded-lg",
  },
};

export const FIELD_CONTROL_TEXT_CLASS = FIELD_CONTROL_SIZE_TOKENS.md.text;
export const FIELD_LABEL_TEXT_CLASS = "text-sm font-semibold text-slate-500";
export const FIELD_VALUE_TEXT_CLASS = "text-base font-medium text-slate-900";
export const FIELD_HELPER_TEXT_CLASS = "text-xs text-slate-400";
export const FIELD_GROUP_TITLE_TEXT_CLASS = "text-base";

export const FIELD_CONTROL_HEIGHT_CLASS = FIELD_CONTROL_SIZE_TOKENS.md.height;
export const FIELD_CONTROL_HEIGHT = FIELD_CONTROL_SIZE_TOKENS.md.height;
export const FIELD_CONTROL_PADDING_X_CLASS = FIELD_CONTROL_SIZE_TOKENS.md.paddingX;
export const FIELD_CONTROL_PADDING_X = FIELD_CONTROL_SIZE_TOKENS.md.paddingX;
export const FIELD_CONTROL_TEXT = FIELD_CONTROL_SIZE_TOKENS.md.text;
export const FIELD_LABEL_TEXT = FIELD_LABEL_TEXT_CLASS;

export const FIELD_BORDER_COLOR_CLASS = "border-slate-200";
export const FIELD_FOCUS_RING_CLASS = "focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
export const FIELD_DISABLED_CLASS = "disabled:bg-slate-100 disabled:text-slate-500";

const DENSITY_PADDING_X: Record<"normal" | "compact", Record<FieldControlSize, string>> = {
  normal: { sm: "px-2.5", md: "px-3", lg: "px-4" },
  compact: { sm: "px-2", md: "px-2.5", lg: "px-3" },
};

const DENSITY_PADDING_Y: Record<"normal" | "compact", Record<"default" | "tags", string>> = {
  normal: { default: "py-0", tags: "py-1" },
  compact: { default: "py-0", tags: "py-0.5" },
};

export interface FieldShellClassOptions {
  size?: FieldControlSize;
  density?: "normal" | "compact";
  layout?: "default" | "tags";
  hasAffix?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

/**
 * 统一字段壳 className 生成器。
 *
 * 所有表单字段（text、readonly、fk、select、tags）进入 FieldGrid / EntityDetailLayout 时
 * 都应通过此函数拿到一致的高度、边框、圆角、阴影、焦点环、padding、字号和垂直居中。
 */
export function getFieldShellClassName(options: FieldShellClassOptions = {}): string {
  const {
    size = "md",
    density = "normal",
    layout = "default",
    hasAffix = false,
    disabled = false,
    readOnly = false,
    className = "",
  } = options;
  const tokens = FIELD_CONTROL_SIZE_TOKENS[size];
  const isTags = layout === "tags";
  const heightClass = isTags ? tokens.minHeight : tokens.height;
  const layoutClass = isTags
    ? "flex flex-wrap items-center gap-1.5"
    : "flex items-center overflow-hidden";
  const paddingX = hasAffix ? "px-0" : DENSITY_PADDING_X[density][size];
  const paddingY = DENSITY_PADDING_Y[density][layout];

  return [
    layoutClass,
    heightClass,
    "w-full min-w-0",
    tokens.radius,
    "border",
    FIELD_BORDER_COLOR_CLASS,
    disabled ? "bg-slate-100" : readOnly ? "bg-slate-50" : "bg-white",
    paddingX,
    paddingY,
    "font-sans",
    tokens.text,
    tokens.leading,
    disabled ? "text-slate-500" : readOnly ? "text-slate-600" : "text-slate-800",
    "shadow-sm",
    "focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500",
    isTags ? "" : "tabular-nums",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * 默认单行字段壳（text / readonly / fk / select）。
 */
export const FIELD_SHELL_CLASS = getFieldShellClassName({ size: "md", density: "normal", layout: "default" });

/**
 * Tag 输入字段壳。
 */
export const FIELD_TAG_CONTAINER_CLASS = getFieldShellClassName({
  size: "md",
  density: "normal",
  layout: "tags",
});

export function getFieldLabelClassName(className = "") {
  return [FIELD_LABEL_TEXT_CLASS, className].filter(Boolean).join(" ");
}

export function getFieldValueClassName(className = "") {
  return [FIELD_VALUE_TEXT_CLASS, className].filter(Boolean).join(" ");
}

export function getFieldHelperClassName(className = "") {
  return [FIELD_HELPER_TEXT_CLASS, className].filter(Boolean).join(" ");
}

export function getFieldInputClassName(className = "") {
  return [
    `${FIELD_CONTROL_HEIGHT_CLASS} w-full rounded-md border ${FIELD_BORDER_COLOR_CLASS} bg-white px-3 py-0 font-sans ${FIELD_CONTROL_TEXT_CLASS} text-slate-800 shadow-sm tabular-nums`,
    FIELD_FOCUS_RING_CLASS,
    FIELD_DISABLED_CLASS,
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldInputShellClassName(className = "") {
  return [
    `${FIELD_CONTROL_HEIGHT_CLASS} w-full min-w-0 rounded-md border ${FIELD_BORDER_COLOR_CLASS} bg-white px-3 py-0 font-sans ${FIELD_CONTROL_TEXT_CLASS} text-slate-800 shadow-sm tabular-nums`,
    "focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500",
    className,
  ].filter(Boolean).join(" ");
}

export function getTextareaInputClassName(className = "") {
  return [
    `min-h-9 w-full rounded-md border ${FIELD_BORDER_COLOR_CLASS} bg-white px-3 py-2 font-sans ${FIELD_CONTROL_TEXT_CLASS} leading-6 text-slate-800 shadow-sm`,
    FIELD_FOCUS_RING_CLASS,
    FIELD_DISABLED_CLASS,
    className,
  ].filter(Boolean).join(" ");
}

export function getReadOnlyFieldClassName(className = "") {
  return [
    `flex ${FIELD_CONTROL_HEIGHT_CLASS} w-full items-center rounded-md border ${FIELD_BORDER_COLOR_CLASS} bg-slate-50 px-3 py-0 font-sans ${FIELD_CONTROL_TEXT_CLASS} text-slate-600 shadow-sm tabular-nums`,
    className,
  ].filter(Boolean).join(" ");
}

export function getTagInputShellClassName(className = "") {
  return [
    `flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border ${FIELD_BORDER_COLOR_CLASS} bg-white px-2 py-1 ${FIELD_CONTROL_TEXT_CLASS} text-slate-800 shadow-sm`,
    "focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500",
    "disabled:bg-slate-100",
    className,
  ].filter(Boolean).join(" ");
}

export function getTagPillClassName(className = "") {
  return [
    `inline-flex min-h-7 max-w-full min-w-0 items-center gap-1 rounded-full border ${FIELD_BORDER_COLOR_CLASS} bg-slate-100 px-2 py-1 text-sm font-medium leading-tight text-slate-700 shadow-sm`,
    className,
  ].filter(Boolean).join(" ");
}

export function getTagInlineInputClassName(className = "") {
  return [
    `min-w-20 flex-1 border-0 bg-transparent px-1 py-0 ${FIELD_CONTROL_TEXT_CLASS} leading-none text-slate-800 outline-none placeholder:text-slate-400`,
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldGridCellClassName(className = "") {
  return [
    "flex flex-col px-3 py-1.5",
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldGridMainRowClassName(className = "", mode?: "view" | "edit" | "mixed" | "detail") {
  return [
    mode === "detail"
      ? "grid min-h-11 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2"
      : "grid min-h-11 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2",
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldGridLabelClassName(className = "") {
  return [
    `min-w-0 truncate ${FIELD_LABEL_TEXT_CLASS}`,
    className,
  ].filter(Boolean).join(" ");
}

// TODO: [&_input]/[&_textarea] 是全局 descendant 规则，会命中 FieldGrid 内部弹层里的输入框。
// 后续应收窄为只作用于直接 field control，或让控件通过 props/className 自行声明嵌入式样式。
export function getFieldGridValueClassName(className = "", mode?: "view" | "edit" | "mixed" | "detail") {
  return [
    "min-w-0 [&>*]:w-full [&_input]:w-full [&_textarea]:w-full",
    mode === "detail" ? "" : "",
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldGridHelperRowClassName(className = "", mode?: "view" | "edit" | "mixed" | "detail") {
  return [
    "grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2",
    mode === "detail" ? "" : "",
    className,
  ].filter(Boolean).join(" ");
}

export function fieldGridColumnsClass(columns: 1 | 2 | 3 = 3) {
  if (columns === 1) return "grid-cols-1";
  if (columns === 2) return "grid-cols-2";
  return "grid-cols-3";
}

export function getFieldGroupTitleClassName(className = "") {
  return [
    `mb-2 flex h-7 items-center ${FIELD_GROUP_TITLE_TEXT_CLASS} font-semibold text-slate-900`,
    className,
  ].filter(Boolean).join(" ");
}
