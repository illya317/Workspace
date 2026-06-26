import type { CSSProperties } from "react";

export type AdaptiveControlWidthMode = "content" | "fill" | "fixed";

export interface AdaptiveControlWidthOptions {
  mode?: AdaptiveControlWidthMode;
  text?: string;
  minChars?: number;
  maxChars?: number;
  extraChars?: number;
}

export function getAdaptiveControlWidthStyle({
  mode = "content",
  text = "",
  minChars = 12,
  maxChars = 32,
  extraChars = 2,
}: AdaptiveControlWidthOptions): CSSProperties | undefined {
  if (mode !== "content") return undefined;
  const preferredChars = Math.min(maxChars, Math.max(minChars, Array.from(text).length + extraChars));
  return {
    width: `${preferredChars}ch`,
    minWidth: `${minChars}ch`,
    maxWidth: `${maxChars}ch`,
  };
}

export function getAdaptiveControlWidthClassName(mode: AdaptiveControlWidthMode = "content", fixedClassName = "w-36") {
  if (mode === "fill") return "w-full";
  if (mode === "fixed") return fixedClassName;
  return "max-w-full";
}
