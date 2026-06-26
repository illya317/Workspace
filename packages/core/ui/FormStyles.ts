// Core Field Spec
// 统一字段容器、输入控件、只读值、标签、辅助文案和标签输入的视觉 token。
// 业务页应优先使用 Page API（FormField / FieldGrid / ReadOnlyField / TagListInput 等），
// 不要直接 import 这些 foundation token。

export const FIELD_CONTROL_TEXT_CLASS = "text-sm";
export const FIELD_LABEL_TEXT_CLASS = "text-sm font-semibold text-slate-500";
export const FIELD_VALUE_TEXT_CLASS = "text-base font-medium text-slate-900";
export const FIELD_HELPER_TEXT_CLASS = "text-xs text-slate-400";
export const FIELD_GROUP_TITLE_TEXT_CLASS = "text-base";

export const FIELD_CONTROL_HEIGHT_CLASS = "h-9";
export const FIELD_BORDER_COLOR_CLASS = "border-slate-200";
export const FIELD_FOCUS_RING_CLASS = "focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
export const FIELD_DISABLED_CLASS = "disabled:bg-slate-100 disabled:text-slate-500";

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
    `inline-flex h-7 max-w-full items-center gap-1 rounded-full border ${FIELD_BORDER_COLOR_CLASS} bg-slate-100 px-2 text-sm font-medium leading-none text-slate-700 shadow-sm`,
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

export function getFieldGridMainRowClassName(className = "") {
  return [
    "grid min-h-11 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2",
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
export function getFieldGridValueClassName(className = "") {
  return [
    "min-w-0 [&>*]:w-full [&_input]:w-full [&_input]:!h-8 [&_input]:!text-sm [&_input]:!shadow-none [&_textarea]:w-full [&_textarea]:!text-sm",
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldGridHelperRowClassName(className = "") {
  return [
    "grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2",
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
