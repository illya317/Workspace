export type BpmnBounds = { x: number; y: number; width: number; height: number };
export type BpmnPoint = [number, number];

export function diagramEdge(
  id: string,
  source: BpmnBounds,
  target: BpmnBounds,
  sourcePoint?: BpmnPoint,
  targetPoint?: BpmnPoint,
) {
  const [defaultFrom, defaultTo] = connectionPoints(source, target);
  const from = sourcePoint ?? defaultFrom;
  const to = targetPoint ?? (sourcePoint ? targetPointFrom(sourcePoint, target) : defaultTo);
  return edge(id, orthogonalRoute(from, to));
}

export function bottomCenter(bounds: BpmnBounds) {
  return [bounds.x + bounds.width / 2, bounds.y + bounds.height] as BpmnPoint;
}

function connectionPoints(source: BpmnBounds, target: BpmnBounds): [BpmnPoint, BpmnPoint] {
  const sourceCenterX = source.x + source.width / 2;
  const targetCenterX = target.x + target.width / 2;
  if (target.y > source.y + source.height + 24) return [bottomCenter(source), topCenter(target)];
  if (source.y > target.y + target.height + 24) return [topCenter(source), bottomCenter(target)];
  if (targetCenterX < sourceCenterX - 8) return [centerLeft(source), centerRight(target)];
  return [centerRight(source), centerLeft(target)];
}

export function targetPointFrom(sourcePoint: BpmnPoint, target: BpmnBounds) {
  if (sourcePoint[1] < target.y) return topCenter(target);
  if (sourcePoint[1] > target.y + target.height) return bottomCenter(target);
  return sourcePoint[0] > target.x + target.width / 2 ? centerRight(target) : centerLeft(target);
}

export function sourcePointFromTarget(targetPoint: BpmnPoint, source: BpmnBounds) {
  if (targetPoint[1] > source.y + source.height) return bottomCenter(source);
  if (targetPoint[1] < source.y) return topCenter(source);
  return targetPoint[0] > source.x + source.width / 2 ? centerRight(source) : centerLeft(source);
}

export function centerLeft(bounds: BpmnBounds) { return [bounds.x, bounds.y + bounds.height / 2] as BpmnPoint; }
export function centerRight(bounds: BpmnBounds) { return [bounds.x + bounds.width, bounds.y + bounds.height / 2] as BpmnPoint; }
export function topCenter(bounds: BpmnBounds) { return [bounds.x + bounds.width / 2, bounds.y] as BpmnPoint; }

export function orthogonalRoute(from: BpmnPoint, to: BpmnPoint) {
  if (from[1] === to[1] || from[0] === to[0]) return [from, to];
  const middleY = Math.round((from[1] + to[1]) / 2);
  return [from, [from[0], middleY] as BpmnPoint, [to[0], middleY] as BpmnPoint, to];
}

export function edge(id: string, points: BpmnPoint[]) {
  return `<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${points.map(([x, y]) => `<di:waypoint x="${x}" y="${y}" />`).join("")}</bpmndi:BPMNEdge>`;
}
