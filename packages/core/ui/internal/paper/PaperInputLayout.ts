import type { CSSProperties } from "react";
import type { PaperInputLayoutSpec } from "../../PaperInputSurface.types";

function configuredPaperInputWidth(value: string | undefined) {
  const width = value?.trim();
  return width || "3rem";
}

export function adaptivePaperInputWidth(part: PaperInputLayoutSpec): CSSProperties {
  const configured = configuredPaperInputWidth(part.width);
  const minWidth = configured === "auto" ? "3rem" : `max(${configured}, 3rem)`;
  return { width: "auto", minWidth, maxWidth: "100%" };
}
