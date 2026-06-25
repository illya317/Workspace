const FIELD_CONTROL_TEXT_CLASS = "text-sm";
const FIELD_LABEL_TEXT_CLASS = "text-sm";
const FIELD_GROUP_TITLE_TEXT_CLASS = "text-base";
const FIELD_CONTROL_HEIGHT_CLASS = "h-9";

export function getFieldInputClassName(className = "") {
  return [
    `${FIELD_CONTROL_HEIGHT_CLASS} w-full rounded-md border border-sky-200 bg-white px-3 py-0 font-sans ${FIELD_CONTROL_TEXT_CLASS} text-slate-800 shadow-sm tabular-nums`,
    "focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500",
    "disabled:bg-sky-100/60 disabled:text-slate-500",
    className,
  ].filter(Boolean).join(" ");
}

export function getTextareaInputClassName(className = "") {
  return [
    `min-h-9 w-full rounded-md border border-sky-200 bg-white px-3 py-2 font-sans ${FIELD_CONTROL_TEXT_CLASS} leading-6 text-slate-800 shadow-sm`,
    "focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500",
    "disabled:bg-sky-100/60 disabled:text-slate-500",
    className,
  ].filter(Boolean).join(" ");
}

export function getReadOnlyFieldClassName(className = "") {
  return [
    `flex ${FIELD_CONTROL_HEIGHT_CLASS} w-full items-center rounded-md border border-sky-200 bg-sky-100/60 px-3 py-0 font-sans ${FIELD_CONTROL_TEXT_CLASS} text-slate-600 shadow-sm tabular-nums`,
    className,
  ].filter(Boolean).join(" ");
}

export function getTagInputShellClassName(className = "") {
  return [
    `flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-sky-200 bg-white px-2 py-1 ${FIELD_CONTROL_TEXT_CLASS} text-slate-800 shadow-sm`,
    "focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500",
    "disabled:bg-slate-100",
    className,
  ].filter(Boolean).join(" ");
}

export function getTagPillClassName(className = "") {
  return [
    `inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-sky-200 bg-sky-100 px-2 text-xs font-medium leading-none text-sky-900 shadow-sm`,
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
    "grid min-h-11 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-1.5",
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldGridLabelClassName(className = "") {
  return [
    `min-w-0 truncate ${FIELD_LABEL_TEXT_CLASS} font-semibold text-sky-950/65`,
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldGridValueClassName(className = "") {
  return [
    "min-w-0 [&_input]:!h-8 [&_input]:!text-sm [&_input]:!shadow-none [&_textarea]:!text-sm",
    className,
  ].filter(Boolean).join(" ");
}

export function getFieldGroupTitleClassName(className = "") {
  return [
    `mb-2 flex h-7 items-center ${FIELD_GROUP_TITLE_TEXT_CLASS} font-semibold text-sky-950`,
    className,
  ].filter(Boolean).join(" ");
}
