import { bottomCenter, diagramEdge, edge, topCenter, type BpmnBounds as Bounds, type BpmnPoint } from "./WorkflowPoliciesBpmnGeometry";
import {
  handlerSourceLabel,
  type WorkflowCompanyOptionDto,
  type WorkflowDepartmentOptionDto,
  type WorkflowEmployeeOptionDto,
  type WorkflowPositionOptionDto,
} from "./WorkflowPoliciesTabModel";
import {
  sortedWorkflowBranches,
  type WorkflowPolicyGatewayBranchDraft,
  type WorkflowPolicyGatewayKind,
  type WorkflowPolicyGatewayNodeDraft,
  type WorkflowPolicyNodeConditionDraft,
  type WorkflowPolicyTreeNodeDraft,
} from "./WorkflowPoliciesGraphModel";

type BpmnLayout = {
  annotations: LayoutAnnotation[];
  bounds: Map<string, Bounds>;
  flows: LayoutFlow[];
  shapes: LayoutShape[];
};

type LayoutAnnotation = {
  associationId: string;
  bounds: Bounds;
  id: string;
  targetId: string;
  text: string;
};

type LayoutFlow = {
  id: string;
  name?: string;
  points?: BpmnPoint[];
  sourceId: string;
  targetId: string;
};

type LayoutShape = {
  bounds: Bounds;
  gatewayKind?: WorkflowPolicyGatewayKind;
  id: string;
  name?: string;
  type: "approval" | "branch" | "end" | "gateway" | "start";
};

type LayoutMetrics = {
  height: number;
  width: number;
};

type LayoutSequenceResult = {
  bottomY: number;
  entryId: string | null;
  exitId: string | null;
};

type LabelInput = {
  companies: readonly WorkflowCompanyOptionDto[];
  departments: readonly WorkflowDepartmentOptionDto[];
  employees: readonly WorkflowEmployeeOptionDto[];
  positions: readonly WorkflowPositionOptionDto[];
};

const APPROVAL_NODE_HEIGHT = 72;
const APPROVAL_NODE_WIDTH = 176;
const BPMN_CANVAS_MIN_WIDTH = 760;
const EVENT_SIZE = 36;
const GATEWAY_SIZE = 50;
const HORIZONTAL_GAP = 64;
const START_Y = 72;
const TEXT_ANNOTATION_HEIGHT = 34;
const TEXT_ANNOTATION_WIDTH = 160;
const VERTICAL_GAP = 108;

export function workflowGraphBpmnCanvasSize(elements: readonly WorkflowPolicyTreeNodeDraft[]) {
  const layout = buildWorkflowLayout(elements, emptyLabelInput(), workflowGraphBpmnElementIdMap(elements));
  const allBounds = Array.from(layout.bounds.values());
  const maxX = Math.max(...allBounds.map((bounds) => bounds.x + bounds.width));
  const maxY = Math.max(...allBounds.map((bounds) => bounds.y + bounds.height));
  return {
    height: Math.max(320, Math.ceil(maxY + 72)),
    width: Math.max(BPMN_CANVAS_MIN_WIDTH, Math.ceil(maxX + 120)),
  };
}

export function workflowGraphBpmnElementIdMap(elements: readonly WorkflowPolicyTreeNodeDraft[]) {
  const counters = { approval: 0, branch: 0, exclusive: 0, inclusive: 0, parallel: 0 };
  const ids = new Map<string, string>();
  const visit = (nodes: readonly WorkflowPolicyTreeNodeDraft[]) => {
    for (const node of nodes) {
      if (node.kind === "approval") {
        counters.approval += 1;
        ids.set(node.key, `Approval_${counters.approval}`);
        continue;
      }
      counters[node.gatewayKind] += 1;
      ids.set(node.key, `${gatewayIdPrefix(node.gatewayKind)}_${counters[node.gatewayKind]}`);
      for (const branch of sortedWorkflowBranches(node.branches)) {
        counters.branch += 1;
        ids.set(branch.key, `Branch_${counters.branch}`);
        visit(branch.children);
      }
    }
  };
  visit(elements);
  return ids;
}

export function workflowGraphElementsToBpmnXml(
  elements: readonly WorkflowPolicyTreeNodeDraft[],
  companies: readonly WorkflowCompanyOptionDto[],
  departments: readonly WorkflowDepartmentOptionDto[],
  employees: readonly WorkflowEmployeeOptionDto[],
  elementIds: ReadonlyMap<string, string>,
  positions: readonly WorkflowPositionOptionDto[],
) {
  const labelInput = { companies, departments, employees, positions };
  const layout = buildWorkflowLayout(elements, labelInput, elementIds);
  const process = [
    ...layout.shapes.map(shapeProcessXml),
    ...layout.flows.map(sequenceFlowXml),
    ...layout.annotations.map(annotationProcessXml),
    ...layout.annotations.map(annotationAssociationXml),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_WorkflowPolicy" targetNamespace="https://workspace.local/workflow">
  <bpmn:process id="Workflow" isExecutable="false">${process}</bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_WorkflowPolicy"><bpmndi:BPMNPlane id="Plane_WorkflowPolicy" bpmnElement="Workflow">${diagramXml(layout)}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

export function conditionLabel(
  conditions: readonly WorkflowPolicyNodeConditionDraft[],
  input: { companies: readonly WorkflowCompanyOptionDto[]; departments: readonly WorkflowDepartmentOptionDto[] },
) {
  const meaningful = conditions.filter((condition) => condition.value);
  if (meaningful.length === 0) return "默认";
  return meaningful.map((condition) => conditionPartLabel(condition, input, "=")).join(" / ");
}

function buildWorkflowLayout(
  elements: readonly WorkflowPolicyTreeNodeDraft[],
  labelInput: LabelInput,
  elementIds: ReadonlyMap<string, string>,
): BpmnLayout {
  const metrics = measureSequence(elements);
  const centerX = Math.max(BPMN_CANVAS_MIN_WIDTH / 2, metrics.width / 2 + 80);
  const layout: BpmnLayout = { annotations: [], bounds: new Map(), flows: [], shapes: [] };
  const startBounds = centeredBounds(centerX, START_Y, EVENT_SIZE, EVENT_SIZE);
  pushShape(layout, { id: "StartEvent_1", type: "start", bounds: startBounds, name: "开始" });
  const sequence = layoutSequence(elements, centerX, START_Y + EVENT_SIZE + VERTICAL_GAP, layout, labelInput, elementIds);
  const endY = Math.max(sequence.bottomY + VERTICAL_GAP, START_Y + EVENT_SIZE + VERTICAL_GAP);
  const endBounds = centeredBounds(centerX, endY, EVENT_SIZE, EVENT_SIZE);
  pushShape(layout, { id: "EndEvent_Approved", type: "end", bounds: endBounds, name: "完成" });
  if (sequence.entryId && sequence.exitId) {
    pushFlow(layout, "Flow_Start_First", "StartEvent_1", sequence.entryId);
    pushFlow(layout, "Flow_Last_Approved", sequence.exitId, "EndEvent_Approved");
  } else {
    pushFlow(layout, "Flow_Start_Approved", "StartEvent_1", "EndEvent_Approved");
  }
  return layout;
}

function layoutSequence(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  centerX: number,
  topY: number,
  layout: BpmnLayout,
  labelInput: LabelInput,
  elementIds: ReadonlyMap<string, string>,
): LayoutSequenceResult {
  let y = topY;
  let entryId: string | null = null;
  let previousExitId: string | null = null;
  for (const node of nodes) {
    const laidOut = layoutNode(node, centerX, y, layout, labelInput, elementIds);
    if (!entryId) entryId = laidOut.entryId;
    if (previousExitId && laidOut.entryId) {
      pushFlow(layout, `Flow_${previousExitId}_${laidOut.entryId}`, previousExitId, laidOut.entryId);
    }
    previousExitId = laidOut.exitId;
    y = laidOut.bottomY + VERTICAL_GAP;
  }
  return {
    bottomY: nodes.length > 0 ? y - VERTICAL_GAP : topY,
    entryId,
    exitId: previousExitId,
  };
}

function layoutNode(
  node: WorkflowPolicyTreeNodeDraft,
  centerX: number,
  topY: number,
  layout: BpmnLayout,
  labelInput: LabelInput,
  elementIds: ReadonlyMap<string, string>,
): LayoutSequenceResult {
  if (node.kind === "approval") {
    const id = elementId(node.key, elementIds);
    const bounds = centeredBounds(centerX, topY, APPROVAL_NODE_WIDTH, APPROVAL_NODE_HEIGHT);
    pushShape(layout, {
      id,
      type: "approval",
      bounds,
      name: approvalAssigneeLabel(node.assignees, labelInput),
    });
    return { bottomY: bounds.y + bounds.height, entryId: id, exitId: id };
  }
  return layoutGatewayNode(node, centerX, topY, layout, labelInput, elementIds);
}

function layoutGatewayNode(
  node: WorkflowPolicyGatewayNodeDraft,
  centerX: number,
  topY: number,
  layout: BpmnLayout,
  labelInput: LabelInput,
  elementIds: ReadonlyMap<string, string>,
): LayoutSequenceResult {
  const metrics = measureGateway(node);
  const splitId = elementId(node.key, elementIds);
  const joinId = gatewayJoinId(splitId);
  const splitBounds = centeredBounds(centerX, topY, GATEWAY_SIZE, GATEWAY_SIZE);
  const joinBounds = centeredBounds(centerX, topY + metrics.height - GATEWAY_SIZE, GATEWAY_SIZE, GATEWAY_SIZE);
  const mergeY = joinBounds.y - Math.round(VERTICAL_GAP / 2);
  pushShape(layout, { id: splitId, type: "gateway", gatewayKind: node.gatewayKind, bounds: splitBounds });
  const branches = sortedWorkflowBranches(node.branches);
  const branchMetrics = branches.map((branch) => branchLayoutMetrics(branch));
  const branchWidths = branchMetrics.map((metric) => Math.max(APPROVAL_NODE_WIDTH, metric.width));
  const totalWidth = branchWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, branches.length - 1) * HORIZONTAL_GAP;
  let nextLeft = centerX - totalWidth / 2;
  const branchTopY = splitBounds.y + splitBounds.height + VERTICAL_GAP;
  branches.forEach((branch, index) => {
    const branchWidth = branchWidths[index] ?? APPROVAL_NODE_WIDTH;
    const branchCenterX = nextLeft + branchWidth / 2;
    nextLeft += branchWidth + HORIZONTAL_GAP;
    const branchId = elementId(branch.key, elementIds);
    const branchBounds = centeredBounds(branchCenterX, branchTopY, APPROVAL_NODE_WIDTH, APPROVAL_NODE_HEIGHT);
    const conditionText = node.gatewayKind === "parallel" ? null : conditionLabel(branch.conditions, labelInput);
    pushShape(layout, {
      id: branchId,
      type: "branch",
      bounds: branchBounds,
      name: approvalAssigneeLabel(branch.assignees, labelInput),
    });
    if (conditionText) {
      pushAnnotation(layout, {
        id: sanitizeId(`TextAnnotation_${branchId}`),
        associationId: sanitizeId(`Association_${branchId}`),
        bounds: centeredBounds(branchCenterX, branchBounds.y - TEXT_ANNOTATION_HEIGHT - 14, TEXT_ANNOTATION_WIDTH, TEXT_ANNOTATION_HEIGHT),
        targetId: branchId,
        text: conditionText,
      });
    }
    pushFlow(layout, `Flow_${splitId}_${branchId}`, splitId, branchId);
    const childrenTopY = branchBounds.y + branchBounds.height + VERTICAL_GAP;
    const children = layoutSequence(branch.children, branchCenterX, childrenTopY, layout, labelInput, elementIds);
    if (children.entryId && children.exitId) {
      pushFlow(layout, `Flow_${branchId}_${children.entryId}`, branchId, children.entryId);
      pushFlow(layout, `Flow_${children.exitId}_${joinId}`, children.exitId, joinId, undefined, branchJoinRoute(layout, children.exitId, joinBounds, mergeY));
    } else {
      pushFlow(layout, `Flow_${branchId}_${joinId}`, branchId, joinId, undefined, branchJoinRoute(layout, branchId, joinBounds, mergeY));
    }
  });
  pushShape(layout, { id: joinId, type: "gateway", gatewayKind: node.gatewayKind, bounds: joinBounds });
  return { bottomY: joinBounds.y + joinBounds.height, entryId: splitId, exitId: joinId };
}

function measureSequence(nodes: readonly WorkflowPolicyTreeNodeDraft[]): LayoutMetrics {
  if (nodes.length === 0) return { width: APPROVAL_NODE_WIDTH, height: 0 };
  const metrics = nodes.map(measureNode);
  return {
    width: Math.max(...metrics.map((metric) => metric.width), APPROVAL_NODE_WIDTH),
    height: metrics.reduce((sum, metric) => sum + metric.height, 0) + (metrics.length - 1) * VERTICAL_GAP,
  };
}

function measureNode(node: WorkflowPolicyTreeNodeDraft): LayoutMetrics {
  if (node.kind === "approval") return { width: APPROVAL_NODE_WIDTH, height: APPROVAL_NODE_HEIGHT };
  return measureGateway(node);
}

function measureGateway(node: WorkflowPolicyGatewayNodeDraft): LayoutMetrics {
  const branches = sortedWorkflowBranches(node.branches);
  const branchMetrics = branches.map(branchLayoutMetrics);
  const branchWidths = branchMetrics.map((metric) => Math.max(APPROVAL_NODE_WIDTH, metric.width));
  const branchHeights = branchMetrics.map((metric) => APPROVAL_NODE_HEIGHT + (metric.height > 0 ? VERTICAL_GAP + metric.height : 0));
  return {
    width: Math.max(GATEWAY_SIZE, branchWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, branchWidths.length - 1) * HORIZONTAL_GAP),
    height: GATEWAY_SIZE + VERTICAL_GAP + Math.max(APPROVAL_NODE_HEIGHT, ...branchHeights) + VERTICAL_GAP + GATEWAY_SIZE,
  };
}

function branchLayoutMetrics(branch: WorkflowPolicyGatewayBranchDraft) {
  return measureSequence(branch.children);
}

function pushShape(layout: BpmnLayout, shape: LayoutShape) {
  layout.shapes.push(shape);
  layout.bounds.set(shape.id, shape.bounds);
}

function pushFlow(layout: BpmnLayout, id: string, sourceId: string, targetId: string, name?: string, points?: BpmnPoint[]) {
  layout.flows.push({ id: sanitizeId(id), name, points, sourceId, targetId });
}

function pushAnnotation(layout: BpmnLayout, annotation: LayoutAnnotation) {
  layout.annotations.push(annotation);
  layout.bounds.set(annotation.id, annotation.bounds);
}

function shapeProcessXml(shape: LayoutShape) {
  if (shape.type === "start") return `<bpmn:startEvent id="${shape.id}" />`;
  if (shape.type === "end") return `<bpmn:endEvent id="${shape.id}" />`;
  if (shape.type === "gateway") return `<bpmn:${gatewayTag(shape.gatewayKind ?? "exclusive")} id="${shape.id}" />`;
  return `<bpmn:userTask id="${shape.id}" name="${escapeXml(shape.name ?? "")}" />`;
}

function sequenceFlowXml(flow: LayoutFlow) {
  const name = flow.name ? ` name="${escapeXml(flow.name)}"` : "";
  return `<bpmn:sequenceFlow id="${flow.id}"${name} sourceRef="${flow.sourceId}" targetRef="${flow.targetId}" />`;
}

function annotationProcessXml(annotation: LayoutAnnotation) {
  return `<bpmn:textAnnotation id="${annotation.id}"><bpmn:text>${escapeXml(annotation.text)}</bpmn:text></bpmn:textAnnotation>`;
}

function annotationAssociationXml(annotation: LayoutAnnotation) {
  return `<bpmn:association id="${annotation.associationId}" sourceRef="${annotation.id}" targetRef="${annotation.targetId}" />`;
}

function diagramXml(layout: BpmnLayout) {
  return [
    ...layout.shapes.map((item) => shape(item.id, item.bounds)),
    ...layout.flows.map((flow) => {
      if (flow.points) return edge(flow.id, flow.points);
      const source = layout.bounds.get(flow.sourceId);
      const target = layout.bounds.get(flow.targetId);
      return source && target ? diagramEdge(flow.id, source, target) : "";
    }),
    ...layout.annotations.map((annotation) => annotationEdge(annotation.associationId, annotation.bounds, layout.bounds.get(annotation.targetId))),
    ...layout.annotations.map((item) => shape(item.id, item.bounds)),
  ].join("");
}

function annotationEdge(id: string, source: Bounds, target: Bounds | undefined) {
  if (!target) return "";
  const from = bottomCenter(source);
  const to = topCenter(target);
  return edge(id, [from, to]);
}

function branchJoinRoute(layout: BpmnLayout, sourceId: string, joinBounds: Bounds, mergeY: number) {
  const sourceBounds = layout.bounds.get(sourceId);
  if (!sourceBounds) return undefined;
  const from = bottomCenter(sourceBounds);
  const to = topCenter(joinBounds);
  return [from, [from[0], mergeY] as BpmnPoint, [to[0], mergeY] as BpmnPoint, to];
}

function conditionPartLabel(
  condition: WorkflowPolicyNodeConditionDraft,
  input: { companies: readonly WorkflowCompanyOptionDto[]; departments: readonly WorkflowDepartmentOptionDto[] },
  operator: "=" | "!=",
) {
  if (condition.fieldKind === "company") {
    const option = input.companies.find((company) => company.code === condition.value);
    return `公司${operator}${option?.name ?? condition.value}`;
  }
  const option = input.departments.find((department) => String(department.id) === condition.value);
  return `部门${operator}${option?.name ?? condition.value}`;
}

function approvalAssigneeLabel(
  assignees: readonly { fieldKind: string; value: string | null }[],
  input: { employees: readonly WorkflowEmployeeOptionDto[]; positions: readonly WorkflowPositionOptionDto[] },
) {
  const assignee = assignees[0];
  if (!assignee?.value) return "不指定";
  if (assignee.fieldKind === "relationship") return handlerSourceLabel(assignee.value);
  if (assignee.fieldKind === "employee") {
    return input.employees.find((employee) => String(employee.id) === assignee.value)?.name ?? assignee.value;
  }
  return input.positions.find((position) => String(position.id) === assignee.value)?.name ?? assignee.value;
}

function elementId(key: string, elementIds: ReadonlyMap<string, string>) {
  return elementIds.get(key) ?? sanitizeId(`Workflow_${key}`);
}

function gatewayIdPrefix(kind: WorkflowPolicyGatewayKind) {
  if (kind === "parallel") return "ParallelGateway";
  if (kind === "inclusive") return "InclusiveGateway";
  return "ExclusiveGateway";
}

function gatewayJoinId(splitId: string) {
  return `${splitId}_Join`;
}

function gatewayTag(kind: WorkflowPolicyGatewayKind) {
  if (kind === "parallel") return "parallelGateway";
  if (kind === "inclusive") return "inclusiveGateway";
  return "exclusiveGateway";
}

function centeredBounds(centerX: number, y: number, width: number, height: number): Bounds {
  return { x: Math.round(centerX - width / 2), y: Math.round(y), width, height };
}

function shape(id: string, bounds: Bounds) {
  return `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" /></bpmndi:BPMNShape>`;
}

function sanitizeId(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function emptyLabelInput(): LabelInput {
  return { companies: [], departments: [], employees: [], positions: [] };
}
