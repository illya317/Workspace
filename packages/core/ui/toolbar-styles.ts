import { CONTROL_SIZES } from "./interactionTokens";
import type { ControlSize } from "./interactionTokens";

export type ActionButtonSize = ControlSize;

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
