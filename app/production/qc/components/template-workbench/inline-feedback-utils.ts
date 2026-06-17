export type AnchorKind = "heading" | "field";

export interface InlineAnchor {
  kind: AnchorKind;
  key: string;
  label: string;
  section?: string;
  badgeKind?: string;
  rect: DOMRect;
}

export interface InlineEntry {
  id: string;
  target: {
    kind: AnchorKind;
    key: string;
    label: string;
    section?: string;
    badgeKind?: string;
  };
  note: string;
}

export interface InlineFeedbackItem {
  inlineEntries?: InlineEntry[];
}

export interface FeedbackResponse {
  data?: { inlineEntries?: InlineEntry[] } | null;
  items?: InlineFeedbackItem[];
  keys?: string[];
  error?: string;
}

const MARKER_SIZE = 24;
const MARKER_GAP = 6;
const MARKER_HIT_PADDING = 8;
const EDITOR_WIDTH = 320;
const EDITOR_HEIGHT = 260;

export const HIDE_DELAY_MS = 500;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizePart(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "_");
}

export function anchorId(anchor: Omit<InlineAnchor, "rect">) {
  return [
    anchor.kind,
    normalizePart(anchor.key),
    normalizePart(anchor.section || ""),
    normalizePart(anchor.label),
  ].filter(Boolean).join("/");
}

export function readAnchor(node: HTMLElement | null): InlineAnchor | null {
  if (!node) return null;
  const kind = node.dataset.inlineFeedbackKind;
  const key = node.dataset.inlineFeedbackKey;
  const label = node.dataset.inlineFeedbackLabel;
  if (!kind || !key || !label) return null;
  if (kind !== "heading" && kind !== "field") return null;
  return {
    kind,
    key,
    label,
    section: node.dataset.inlineFeedbackSection || undefined,
    badgeKind: node.dataset.inlineFeedbackBadgeKind || undefined,
    rect: node.getBoundingClientRect(),
  };
}

export function findAnchorElement(anchorLike: Omit<InlineAnchor, "rect">): InlineAnchor | null {
  const nodes = document.querySelectorAll<HTMLElement>("[data-inline-feedback='true']");
  for (const node of nodes) {
    const anchor = readAnchor(node);
    if (anchor && anchorId(anchor) === anchorId(anchorLike)) return anchor;
  }
  return null;
}

export function inlineEntriesFromItems(items?: InlineFeedbackItem[]) {
  return (items || []).flatMap((item) => item.inlineEntries || []);
}

export function markersFromEntries(entries: InlineEntry[]) {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const marker = findAnchorElement(entry.target);
    if (!marker) return [];
    const id = anchorId(marker);
    if (seen.has(id)) return [];
    seen.add(id);
    return [marker];
  });
}

export function markerStyle(rect: DOMRect) {
  return {
    top: clamp(rect.top - MARKER_SIZE / 2 - MARKER_HIT_PADDING, 0, window.innerHeight - MARKER_SIZE - MARKER_HIT_PADDING * 2),
    left: clamp(rect.right + MARKER_GAP - MARKER_HIT_PADDING - 4, 0, window.innerWidth - MARKER_SIZE - MARKER_HIT_PADDING * 2),
  };
}

export function editorStyle(rect: DOMRect) {
  const enoughBelow = rect.bottom + MARKER_GAP + EDITOR_HEIGHT <= window.innerHeight - 16;
  const top = enoughBelow ? rect.bottom + MARKER_GAP : rect.top - EDITOR_HEIGHT - MARKER_GAP;
  return {
    top: clamp(top, 16, window.innerHeight - EDITOR_HEIGHT - 16),
    left: clamp(rect.right - EDITOR_WIDTH, 16, window.innerWidth - EDITOR_WIDTH - 16),
  };
}
