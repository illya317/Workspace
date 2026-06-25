export type ActionButtonSize = "sm" | "md";

export function getToolbarActionClassName(
  variant: "primary" | "secondary" | "danger" = "secondary",
  size: ActionButtonSize = "md",
) {
  const sizeClass =
    size === "sm"
      ? "h-8 px-2.5 py-1.5 text-xs"
      : "h-10 px-4 py-2 text-xs";
  if (variant === "primary") {
    return `inline-flex ${sizeClass} items-center justify-center rounded-lg bg-emerald-600 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300`;
  }
  if (variant === "danger") {
    return `inline-flex ${sizeClass} items-center justify-center rounded-lg border border-red-200 bg-white font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300`;
  }
  return `inline-flex ${sizeClass} items-center justify-center rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300`;
}
