"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type Viewer from "bpmn-js/lib/Viewer";
import { WorkflowElementConfigModal } from "./WorkflowPoliciesBpmnElementModal";
import {
  decorateBpmnViewerSoon,
  disableBpmnViewerWheel,
  useWorkflowBpmnCanvasLayout,
  WorkflowBpmnCanvasFrame,
  type BpmnCanvas,
  type BpmnElementRegistry,
  type BpmnEventBus,
} from "./WorkflowPoliciesBpmnCanvasLayout";
import { parseAssigneeSelection, parseConditionSelection } from "./WorkflowPoliciesBpmnModalFields";
import { workflowGraphBpmnCanvasSize, workflowGraphBpmnElementIdMap, workflowGraphElementsToBpmnXml } from "./WorkflowPoliciesBpmnXml";
import { workflowSelectionForKey } from "./WorkflowPoliciesNodeState";
import { sortedWorkflowBranches, WORKFLOW_START_KEY } from "./WorkflowPoliciesGraphModel";
import { type WorkflowCompanyOptionDto, type WorkflowDepartmentOptionDto, type WorkflowEmployeeOptionDto, type WorkflowHandlerSource, type WorkflowPositionOptionDto } from "./WorkflowPoliciesTabModel";
import type {
  WorkflowNodeRelationshipSource,
  WorkflowPolicyApprovalElementDraft,
  WorkflowPolicyGatewayBranchDraft,
  WorkflowPolicyGraphElementKind,
  WorkflowPolicyGraphSelectionKind,
  WorkflowPolicyTreeNodeDraft,
} from "./WorkflowPoliciesGraphModel";

const RELATIONSHIP_HANDLER_SOURCES = ["direct_manager", "department_owner"] as const satisfies readonly WorkflowNodeRelationshipSource[];

export interface WorkflowPoliciesBpmnDesignerProps {
  elements: readonly WorkflowPolicyTreeNodeDraft[];
  companies: readonly WorkflowCompanyOptionDto[];
  departments: readonly WorkflowDepartmentOptionDto[];
  employees: readonly WorkflowEmployeeOptionDto[];
  handlerSourceOptions: readonly WorkflowHandlerSource[];
  positions: readonly WorkflowPositionOptionDto[];
  saving: boolean;
  selectedElementKey: string;
  onAddElement: (kind: WorkflowPolicyGraphElementKind) => void;
  onAddElementFromStart: (kind: WorkflowPolicyGraphElementKind) => void;
  onAddElementAfter: (key: string, kind: WorkflowPolicyGraphElementKind) => void;
  onAddBranch: (gatewayKey: string) => void;
  onRemoveBranch: (gatewayKey: string, branchKey: string) => void;
  onRemoveElement: (key: string) => void;
  onAddCondition: (key: string) => void;
  onRemoveCondition: (key: string, index: number) => void;
  onAddAssignee: (key: string) => void;
  onRemoveAssignee: (key: string, index: number) => void;
  onSelectElement: (key: string, kind: WorkflowPolicyGraphSelectionKind) => void;
  onUpdateBranch: (key: string, patch: Partial<Pick<WorkflowPolicyGatewayBranchDraft, "conditions" | "assignees" | "approvalMode" | "label">>) => void;
  onUpdateApprovalElement: (key: string, patch: Partial<Pick<WorkflowPolicyApprovalElementDraft, "assignees" | "approvalMode">>) => void;
}

export function WorkflowPoliciesBpmnDesigner({
  elements,
  companies,
  departments,
  employees,
  handlerSourceOptions,
  positions,
  saving,
  selectedElementKey,
  onAddElementFromStart,
  onAddElementAfter,
  onAddBranch,
  onRemoveBranch,
  onRemoveElement,
  onAddCondition,
  onRemoveCondition,
  onAddAssignee,
  onRemoveAssignee,
  onSelectElement,
  onUpdateBranch,
  onUpdateApprovalElement,
}: WorkflowPoliciesBpmnDesignerProps) {
  const viewerRef = useRef<Viewer | null>(null);
  const elementIdsRef = useRef<ReadonlyMap<string, string>>(new Map());
  const onSelectElementRef = useRef(onSelectElement);
  const startSelected = selectedElementKey === WORKFLOW_START_KEY;
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const elementIds = useMemo(() => workflowGraphBpmnElementIdMap(elements), [elements]);
  const bpmnXml = useMemo(() => workflowGraphElementsToBpmnXml(elements, companies, departments, employees, elementIds, positions), [companies, departments, employees, elementIds, elements, positions]);
  const canvasSize = useMemo(() => workflowGraphBpmnCanvasSize(elements), [elements]);
  const canvasLayout = useWorkflowBpmnCanvasLayout(canvasSize);
  const { canvasStageStyle, canvasStyle, containerRef, scrollFrameRef, viewportStyle } = canvasLayout;
  const selected = startSelected ? { node: null, branch: null, parentGateway: null } : workflowSelectionForKey(elements, selectedElementKey);
  const relationshipOptions = RELATIONSHIP_HANDLER_SOURCES.filter((source) => handlerSourceOptions.includes(source));

  useEffect(() => {
    elementIdsRef.current = elementIds;
    onSelectElementRef.current = onSelectElement;
  }, [elementIds, onSelectElement]);

  useEffect(() => {
    let mounted = true;
    let removeClickListener: (() => void) | null = null;
    void import("bpmn-js/lib/Viewer").then(({ default: BpmnViewer }) => {
      if (!mounted || !containerRef.current) return;
      const viewer = new BpmnViewer({ container: containerRef.current });
      viewerRef.current = viewer;
      disableBpmnViewerWheel(viewer);
      const eventBus = viewer.get<BpmnEventBus>("eventBus");
      const handleClick = (event: { element?: { id?: string; type?: string } }) => {
        const element = event.element;
        if (!element?.id) return;
        const selectedElement = graphElementForBpmnId(elementIdsRef.current, element.id);
        if (selectedElement) {
          onSelectElementRef.current(selectedElement.key, selectedElement.kind);
          setEditorOpen(true);
        }
      };
      eventBus.on("element.click", handleClick);
      removeClickListener = () => eventBus.off("element.click", handleClick);
      setViewerReady(true);
    }).catch(() => {
      if (mounted) setError("BPMN 设计器加载失败");
    });
    return () => {
      mounted = false;
      setViewerReady(false);
      removeClickListener?.();
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [containerRef]);

  useEffect(() => {
    let cancelled = false;
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer) return;
    void viewer.importXML(bpmnXml)
      .then(() => {
        if (cancelled) return;
        decorateBpmnViewerSoon(viewer, containerRef.current);
        decorateApprovalNodeLabelsSoon(containerRef.current, elements, elementIds);
        markSelectedElement(viewer, elementIds, selectedElementKey);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("BPMN 图生成失败");
      });
    return () => {
      cancelled = true;
    };
  }, [bpmnXml, containerRef, elementIds, elements, selectedElementKey, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer) markSelectedElement(viewer, elementIds, selectedElementKey);
  }, [elementIds, selectedElementKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleStartClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.djs-element[data-element-id="StartEvent_1"]')) return;
      onSelectElementRef.current(WORKFLOW_START_KEY, "start");
      setEditorOpen(true);
    };
    container.addEventListener("click", handleStartClick);
    return () => container.removeEventListener("click", handleStartClick);
  }, [containerRef]);

  return (
    <>
      <WorkflowBpmnCanvasFrame
        canvasStageStyle={canvasStageStyle}
        canvasStyle={canvasStyle}
        containerRef={containerRef}
        error={error}
        scrollFrameRef={scrollFrameRef}
        viewportStyle={viewportStyle}
      />
      <WorkflowElementConfigModal
        open={editorOpen}
        element={selected.node}
        branch={selected.branch}
        parentGateway={selected.parentGateway}
        elements={elements}
        startSelected={startSelected}
        canRemoveElement={elements.length > 1 || Boolean(selected.branch)}
        companies={companies}
        departments={departments}
        employees={employees}
        positions={positions}
        relationshipOptions={relationshipOptions}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onRemoveElement={() => {
          if (selected.branch && selected.parentGateway) {
            onRemoveBranch(selected.parentGateway.key, selected.branch.key);
            return;
          }
          if (selected.node) onRemoveElement(selected.node.key);
        }}
        onAddElement={(kind) => {
          if (startSelected) {
            onAddElementFromStart(kind);
            return;
          }
          if (selected.branch) {
            onAddElementAfter(selected.branch.key, kind);
            return;
          }
          if (selected.node) onAddElementAfter(selected.node.key, kind);
        }}
        onAddBranch={() => {
          if (selected.node?.kind === "gateway") onAddBranch(selected.node.key);
        }}
        onSelectBranch={(branchKey) => onSelectElement(branchKey, "branch")}
        onRemoveBranch={(branchKey) => {
          if (selected.node?.kind === "gateway") onRemoveBranch(selected.node.key, branchKey);
        }}
        onAddCondition={() => selected.branch ? onAddCondition(selected.branch.key) : undefined}
        onRemoveCondition={(index) => selected.branch ? onRemoveCondition(selected.branch.key, index) : undefined}
        onAddAssignee={() => {
          const key = selected.branch?.key ?? selected.node?.key;
          if (key) onAddAssignee(key);
        }}
        onRemoveAssignee={(index) => {
          const key = selected.branch?.key ?? selected.node?.key;
          if (key) onRemoveAssignee(key, index);
        }}
        onUpdateCondition={(conditionIndex, value) => {
          if (!selected.branch) return;
          onUpdateBranch(selected.branch.key, {
            conditions: selected.branch.conditions.map((item, itemIndex) => (itemIndex === conditionIndex ? parseConditionSelection(value) : item)),
          });
        }}
        onUpdateAssignee={(assigneeIndex, value) => {
          if (selected.branch) {
            onUpdateBranch(selected.branch.key, {
              assignees: selected.branch.assignees.map((item, itemIndex) => (itemIndex === assigneeIndex ? parseAssigneeSelection(value) : item)),
            });
            return;
          }
          if (selected.node?.kind !== "approval") return;
          onUpdateApprovalElement(selected.node.key, {
            assignees: selected.node.assignees.map((item, itemIndex) => (itemIndex === assigneeIndex ? parseAssigneeSelection(value) : item)),
          });
        }}
      />
    </>
  );
}

function markSelectedElement(viewer: Viewer, elementIds: ReadonlyMap<string, string>, selectedElementKey: string | null) {
  const canvas = viewer.get<BpmnCanvas>("canvas");
  const elementRegistry = viewer.get<BpmnElementRegistry>("elementRegistry");
  for (const element of elementRegistry.getAll()) {
    if (selectableBpmnType(element.type)) canvas.removeMarker(element.id, "workflow-node-selected");
  }
  const elementId = selectedElementKey === WORKFLOW_START_KEY ? "StartEvent_1" : selectedElementKey ? elementIds.get(selectedElementKey) : null;
  const selectedElement = elementId ? elementRegistry.get(elementId) : null;
  if (selectedElement) canvas.addMarker(selectedElement.id, "workflow-node-selected");
}

function graphElementForBpmnId(elementIds: ReadonlyMap<string, string>, bpmnId: string) {
  const normalizedId = bpmnId.endsWith("_label") ? bpmnId.slice(0, -"_label".length) : bpmnId;
  if (normalizedId === "StartEvent_1") {
    return { key: WORKFLOW_START_KEY, kind: "start" as const };
  }
  for (const [key, id] of elementIds.entries()) {
    if (id === normalizedId || `${id}_Join` === normalizedId) {
      if (id.startsWith("Approval_")) return { key, kind: "approval" as const };
      if (id.startsWith("Branch_")) return { key, kind: "branch" as const };
      return { key, kind: "gateway" as const };
    }
  }
  return null;
}

function selectableBpmnType(type: string | undefined) {
  return type === "bpmn:UserTask"
    || type === "bpmn:ExclusiveGateway"
    || type === "bpmn:InclusiveGateway"
    || type === "bpmn:ParallelGateway"
    || type === "bpmn:StartEvent";
}

function decorateApprovalNodeLabelsSoon(
  container: HTMLDivElement | null,
  elements: readonly WorkflowPolicyTreeNodeDraft[],
  elementIds: ReadonlyMap<string, string>,
) {
  decorateApprovalNodeLabels(container, elements, elementIds);
  window.requestAnimationFrame(() => decorateApprovalNodeLabels(container, elements, elementIds));
  window.setTimeout(() => decorateApprovalNodeLabels(container, elements, elementIds), 80);
}

function decorateApprovalNodeLabels(
  container: HTMLDivElement | null,
  elements: readonly WorkflowPolicyTreeNodeDraft[],
  elementIds: ReadonlyMap<string, string>,
) {
  if (!container) return;
  collectDecoratedLabels(elements).forEach((item) => {
    const id = elementIds.get(item.key);
    if (!id) return;
    const visual = container.querySelector<SVGGElement>(`.djs-element[data-element-id="${id}"] .djs-visual`);
    if (!visual) return;
    visual.querySelector(".workflow-approval-node-label")?.remove();
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "workflow-approval-node-label");
    label.setAttribute("x", "10");
    label.setAttribute("y", "17");
    label.textContent = item.label;
    visual.appendChild(label);
  });
}

function collectDecoratedLabels(elements: readonly WorkflowPolicyTreeNodeDraft[]) {
  const labels: Array<{ key: string; label: string }> = [];
  let nodeIndex = 0;
  const visit = (nodes: readonly WorkflowPolicyTreeNodeDraft[]) => {
    for (const node of nodes) {
      if (node.kind === "approval") {
        nodeIndex += 1;
        labels.push({ key: node.key, label: `节点 ${nodeIndex}` });
        continue;
      }
      for (const branch of sortedWorkflowBranches(node.branches)) {
        nodeIndex += 1;
        labels.push({ key: branch.key, label: `节点 ${nodeIndex}` });
        visit(branch.children);
      }
    }
  };
  visit(elements);
  return labels;
}
