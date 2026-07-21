import { CONTROL_SIZES } from "../common/interactionTokens";
import type { ControlSize } from "../common/interactionTokens";

export type ActionButtonSize = ControlSize;

export const TOOLBAR_DEFAULT_AUTOCOMPLETE_WIDTH_CLASS = "w-full min-w-0 max-w-none sm:w-[140px] sm:min-w-[140px] sm:max-w-[140px]";
export const TOOLBAR_FIXED_CHOICE_WIDTH_CLASS = "w-full min-w-0 max-w-none sm:w-[120px] sm:min-w-[120px] sm:max-w-[120px]";
export const TOOLBAR_FIXED_SEARCH_WIDTH_CLASS = "w-full min-w-0 max-w-none sm:w-[160px] sm:min-w-[160px] sm:max-w-[160px]";

export function getToolbarOptionInputClassName(
  size: ControlSize,
  widthClass = TOOLBAR_DEFAULT_AUTOCOMPLETE_WIDTH_CLASS,
) {
  return [
    "border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm placeholder:text-slate-400 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500",
    CONTROL_SIZES[size].height,
    CONTROL_SIZES[size].radius,
    CONTROL_SIZES[size].paddingX,
    CONTROL_SIZES[size].text,
    CONTROL_SIZES[size].leading,
    widthClass,
  ].join(" ");
}

export function getToolbarActionClassName(
  variant: "primary" | "secondary" | "danger" = "secondary",
  size: ActionButtonSize = "md",
) {
  const t = CONTROL_SIZES[size];
  const sizeClass = `${t.height} ${t.paddingX} ${t.text}`;
  if (variant === "primary") {
    return `inline-flex ${sizeClass} items-center justify-center ${t.radius} bg-emerald-600 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300`;
  }
  if (variant === "danger") {
    return `inline-flex ${sizeClass} items-center justify-center ${t.radius} border border-red-200 bg-white font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300`;
  }
  return `inline-flex ${sizeClass} items-center justify-center ${t.radius} border border-slate-300 bg-white font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300`;
}
