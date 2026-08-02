import type { MapNetworkLabelSelection } from "./VisualizationNetworkMapInteraction";

export const MAP_PRIMARY_LABEL_FONT_SIZE = 13;
export const MAP_RELATED_LABEL_FONT_SIZE = 12;

interface ScreenNode {
  key: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  degree: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MapNetworkLabelLayout extends ScreenRect {
  key: string;
  label: string;
  width: number;
  height: number;
  primary: boolean;
}

interface LayoutInput {
  nodes: readonly ScreenNode[];
  selection: MapNetworkLabelSelection;
  width: number;
  height: number;
  reservedRects?: readonly ScreenRect[];
  measureText?: MapLabelTextMeasurer;
}

export type MapLabelTextMeasurer = (line: string, primary: boolean) => number;

const LABEL_GAP = 8;
const VIEWPORT_INSET = 6;
const COLLISION_PADDING = 3;
const LABEL_HORIZONTAL_PADDING = 12;
const LABEL_MEASUREMENT_SAFETY = 2;
const PRIMARY_LABEL_MAX_WIDTH = 144;
const RELATED_LABEL_MAX_WIDTH = 132;

export function layoutMapNetworkLabels({
  nodes,
  selection,
  width,
  height,
  reservedRects = [],
  measureText,
}: LayoutInput) {
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const root = nodeByKey.get(selection.rootNodeKey);
  if (!root || width <= 0 || height <= 0) return [];

  const related = [...new Set(selection.relatedNodeKeys)]
    .flatMap((key) => nodeByKey.get(key) ?? [])
    .sort((left, right) => right.degree - left.degree || left.key.localeCompare(right.key));
  const candidates = [{ node: root, primary: true }, ...related.map((node) => ({ node, primary: false }))];
  const occupied: ScreenRect[] = [...reservedRects];
  const layouts: MapNetworkLabelLayout[] = [];

  for (const candidate of candidates) {
    const label = wrapMapNodeLabel(compactMapNodeLabel(candidate.node.label), candidate.primary, measureText);
    const size = mapLabelSize(label, candidate.primary, measureText);
    const directions = candidate.primary
      ? PRIMARY_DIRECTIONS
      : radialDirections(root, candidate.node);
    const rings = candidate.primary ? [0, 16, 32, 48, 64, 88] : [0, 14, 28, 44];
    const placement = rings.flatMap((extra) => directions.map((direction) => (
      labelRect(candidate.node, size, direction, extra)
    ))).find((rect) => (
      insideViewport(rect, width, height)
      && !occupied.some((item) => rectsOverlap(rect, item, COLLISION_PADDING))
      && !nodes.some((node) => rectIntersectsCircle(rect, node, COLLISION_PADDING))
    ));
    if (!placement) continue;
    occupied.push(placement);
    layouts.push({
      key: candidate.node.key,
      label,
      ...placement,
      width: size.width,
      height: size.height,
      primary: candidate.primary,
    });
  }
  return layouts;
}

export function compactMapNodeLabel(label: string) {
  if (label.length <= 16 || /[\s\n]/.test(label) || /\p{Script=Han}/u.test(label)) return label;
  const boundaries = [...label.matchAll(/(?<=[a-z0-9])(?=[A-Z])/g)].map((match) => match.index);
  const midpoint = label.length / 2;
  const splitAt = boundaries.length > 0
    ? boundaries.sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint))[0]
    : Math.ceil(midpoint);
  return `${label.slice(0, splitAt)}\n${label.slice(splitAt)}`;
}

function wrapMapNodeLabel(label: string, primary: boolean, measureText?: MapLabelTextMeasurer) {
  const maxContentWidth = labelMaxWidth(primary) - LABEL_HORIZONTAL_PADDING - LABEL_MEASUREMENT_SAFETY;
  return label.split("\n").flatMap((sourceLine) => {
    if (!sourceLine || measureLabelLine(sourceLine, primary, measureText) <= maxContentWidth) return [sourceLine];
    const wrapped: string[] = [];
    let line = "";
    for (const character of [...sourceLine]) {
      const candidate = `${line}${character}`;
      if (line && measureLabelLine(candidate, primary, measureText) > maxContentWidth) {
        wrapped.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    if (line) wrapped.push(line);
    return wrapped;
  }).join("\n");
}

function mapLabelSize(label: string, primary: boolean, measureText?: MapLabelTextMeasurer) {
  const lines = label.split("\n");
  const contentWidth = Math.max(...lines.map((line) => measureLabelLine(line, primary, measureText)));
  return {
    width: Math.min(
      labelMaxWidth(primary),
      Math.max(42, Math.ceil(contentWidth + LABEL_HORIZONTAL_PADDING + LABEL_MEASUREMENT_SAFETY)),
    ),
    height: lines.length * (primary ? 18 : 16) + 4,
  };
}

function labelMaxWidth(primary: boolean) {
  return primary ? PRIMARY_LABEL_MAX_WIDTH : RELATED_LABEL_MAX_WIDTH;
}

function measureLabelLine(line: string, primary: boolean, measureText?: MapLabelTextMeasurer) {
  return measureText?.(line, primary)
    ?? estimatedLineWidth(line, primary ? MAP_PRIMARY_LABEL_FONT_SIZE : MAP_RELATED_LABEL_FONT_SIZE);
}

function estimatedLineWidth(line: string, fontSize: number) {
  return [...line].reduce((width, character) => (
    width + (/\p{Script=Han}/u.test(character) ? fontSize : /[A-Z]/.test(character) ? fontSize * 0.68 : fontSize * 0.56)
  ), 0);
}

function labelRect(
  node: ScreenNode,
  size: { width: number; height: number },
  direction: readonly [number, number],
  extra: number,
) {
  const distanceX = node.radius + LABEL_GAP + extra + size.width / 2;
  const distanceY = node.radius + LABEL_GAP + extra + size.height / 2;
  const centerX = node.x + direction[0] * distanceX;
  const centerY = node.y + direction[1] * distanceY;
  return {
    left: centerX - size.width / 2,
    top: centerY - size.height / 2,
    right: centerX + size.width / 2,
    bottom: centerY + size.height / 2,
  };
}

function radialDirections(root: ScreenNode, node: ScreenNode) {
  const base = Math.atan2(node.y - root.y, node.x - root.x);
  return [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * 3 / 4, -Math.PI * 3 / 4, Math.PI]
    .map((offset) => [Math.cos(base + offset), Math.sin(base + offset)] as const);
}

const PRIMARY_DIRECTIONS = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
] as const;

function insideViewport(rect: ScreenRect, width: number, height: number) {
  return rect.left >= VIEWPORT_INSET
    && rect.top >= VIEWPORT_INSET
    && rect.right <= width - VIEWPORT_INSET
    && rect.bottom <= height - VIEWPORT_INSET;
}

function rectsOverlap(left: ScreenRect, right: ScreenRect, padding: number) {
  return left.left < right.right + padding
    && left.right > right.left - padding
    && left.top < right.bottom + padding
    && left.bottom > right.top - padding;
}

function rectIntersectsCircle(rect: ScreenRect, node: ScreenNode, padding: number) {
  const closestX = Math.max(rect.left, Math.min(node.x, rect.right));
  const closestY = Math.max(rect.top, Math.min(node.y, rect.bottom));
  const dx = node.x - closestX;
  const dy = node.y - closestY;
  return dx * dx + dy * dy < (node.radius + padding) ** 2;
}
