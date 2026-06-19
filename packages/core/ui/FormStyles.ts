export function getFieldInputClassName(className = "") {
  return [
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm",
    "focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500",
    "disabled:bg-slate-100 disabled:text-slate-500",
    className,
  ].filter(Boolean).join(" ");
}

export function getReadOnlyFieldClassName(className = "") {
  return [
    "w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-500 shadow-sm",
    className,
  ].filter(Boolean).join(" ");
}

export function getTagInputShellClassName(className = "") {
  return [
    "flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 shadow-sm",
    "focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500",
    "disabled:bg-slate-100",
    className,
  ].filter(Boolean).join(" ");
}

export function getTagPillClassName(className = "") {
  return [
    "inline-flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm",
    className,
  ].filter(Boolean).join(" ");
}
