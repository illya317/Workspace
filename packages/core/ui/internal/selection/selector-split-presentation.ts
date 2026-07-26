import type { SelectorSurfaceCardSpec } from "../../SelectorSurface.types";

export function resolveSelectorCardPresentation(
  card: SelectorSurfaceCardSpec,
  presentation: "default" | "compact",
): SelectorSurfaceCardSpec {
  if (presentation !== "compact") return card;
  if (card.metaLine !== undefined) {
    return { ...card, subtitle: undefined, meta: undefined };
  }
  const firstMeta = Array.isArray(card.meta) ? card.meta[0] : card.meta;
  if (firstMeta !== undefined) {
    return { ...card, subtitle: undefined, meta: firstMeta };
  }
  return card;
}
