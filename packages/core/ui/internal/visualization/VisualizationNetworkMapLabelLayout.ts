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
}

const LABEL_GAP = 8;
const VIEWPORT_INSET = 6;
const COLLISION_PADDING = 3;

export function layoutMapNetworkLabels({
  nodes,
  selection,
  width,
  height,
  reservedRects = [],
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
    const label = compactMapNodeLabel(candidate.node.label);
    const size = mapLabelSize(label, candidate.primary);
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

function mapLabelSize(label: string, primary: boolean) {
  const fontSize = primary ? MAP_PRIMARY_LABEL_FONT_SIZE : MAP_RELATED_LABEL_FONT_SIZE;
  const lines = label.split("\n").slice(0, 2);
  const contentWidth = Math.max(...lines.map((line) => estimatedLineWidth(line, fontSize)));
  return {
    width: Math.min(primary ? 144 : 132, Math.max(42, Math.ceil(contentWidth + 12))),
    height: lines.length * (primary ? 18 : 16) + 4,
  };
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
