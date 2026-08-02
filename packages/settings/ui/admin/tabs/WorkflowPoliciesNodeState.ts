import type { Dispatch, SetStateAction } from "react";
import {
  createNodeConditionDraft,
  createWorkflowApprovalElementDraft,
  createWorkflowGatewayBranchDraft,
  createWorkflowGatewayElementDraft,
  defaultNodeAssignee,
  defaultNodeHandlerSource,
  findWorkflowBranch,
  findWorkflowBranchParentGateway,
  findWorkflowNode,
  sortedWorkflowBranches,
  WORKFLOW_START_KEY,
  type WorkflowPolicyApprovalElementDraft,
  type WorkflowPolicyGatewayBranchDraft,
  type WorkflowPolicyGraphElementKind,
  type WorkflowPolicyGraphSelectionKind,
  type WorkflowPolicyTreeNodeDraft,
} from "./WorkflowPoliciesGraphModel";
import type { WorkflowHandlerSource, WorkflowPolicyDraft } from "./WorkflowPoliciesTabModel";

const MAX_GATEWAY_BRANCHES = 3;

export function workflowNodeStateActions(input: {
  draft: WorkflowPolicyDraft | null;
  workflowElements: readonly WorkflowPolicyTreeNodeDraft[];
  setWorkflowElements: Dispatch<SetStateAction<WorkflowPolicyTreeNodeDraft[]>>;
  setSelectedWorkflowElementKey: Dispatch<SetStateAction<string | null>>;
}) {
  const select = (key: string, _kind: WorkflowPolicyGraphSelectionKind) => {
    input.setSelectedWorkflowElementKey(key);
  };
  const createElement = (kind: WorkflowPolicyGraphElementKind, handlerSources: readonly WorkflowHandlerSource[]) => {
    if (!input.draft) return null;
    const handlerSource = defaultNodeHandlerSource(handlerSources);
    if (kind === "approval") return createWorkflowApprovalElementDraft(input.draft.businessActionKey, handlerSource);
    return createWorkflowGatewayElementDraft(input.draft.businessActionKey, kind, handlerSource);
  };
  const insertAfter = (key: string, kind: WorkflowPolicyGraphElementKind, handlerSources: readonly WorkflowHandlerSource[]) => {
    const nextElement = createElement(kind, handlerSources);
    if (!nextElement) return;
    input.setWorkflowElements((current) => {
      if (key === WORKFLOW_START_KEY) return [nextElement, ...current];
      return insertElementAfterKey(current, key, nextElement);
    });
    select(nextElement.key, nextElement.kind === "gateway" ? "gateway" : "approval");
  };
  return {
    add(kind: WorkflowPolicyGraphElementKind, handlerSources: readonly WorkflowHandlerSource[]) {
      const nextElement = createElement(kind, handlerSources);
      if (!nextElement) return;
      input.setWorkflowElements((current) => [...current, nextElement]);
      select(nextElement.key, nextElement.kind === "gateway" ? "gateway" : "approval");
    },
    addAfter(key: string, kind: WorkflowPolicyGraphElementKind, handlerSources: readonly WorkflowHandlerSource[]) {
      insertAfter(key, kind, handlerSources);
    },
    addFromStart(kind: WorkflowPolicyGraphElementKind, handlerSources: readonly WorkflowHandlerSource[]) {
      insertAfter(WORKFLOW_START_KEY, kind, handlerSources);
    },
    addBranch(gatewayKey: string, handlerSources: readonly WorkflowHandlerSource[]) {
      const gateway = findWorkflowNode(input.workflowElements, gatewayKey);
      if (gateway?.kind !== "gateway" || gateway.branches.length >= MAX_GATEWAY_BRANCHES) return;
      const nextOrder = Math.max(0, ...gateway.branches.map((branch) => branch.order)) + 1;
      const nextBranch = createWorkflowGatewayBranchDraft(gateway.actionKey, defaultNodeHandlerSource(handlerSources), nextOrder);
      input.setWorkflowElements((current) => updateGatewayNode(current, gatewayKey, (gateway) => {
        if (gateway.branches.length >= MAX_GATEWAY_BRANCHES) return gateway;
        return {
          ...gateway,
          branches: [...gateway.branches, nextBranch],
        };
      }));
      select(nextBranch.key, "branch");
    },
    removeBranch(gatewayKey: string, branchKey: string) {
      input.setWorkflowElements((current) => updateGatewayNode(current, gatewayKey, (gateway) => {
        const ordered = sortedWorkflowBranches(gateway.branches);
        if (ordered.length <= 1 || ordered[0]?.key === branchKey) return gateway;
        return {
          ...gateway,
          branches: ordered
            .filter((branch) => branch.key !== branchKey)
            .map((branch, index) => ({ ...branch, order: index + 1 })),
        };
      }));
      input.setSelectedWorkflowElementKey((selected) => selected === branchKey ? gatewayKey : selected);
    },
    updateBranch(key: string, patch: Partial<Pick<WorkflowPolicyGatewayBranchDraft, "conditions" | "assignees" | "approvalMode" | "label">>) {
      input.setWorkflowElements((current) => updateBranch(current, key, (branch) => ({ ...branch, ...patch })));
    },
    updateApprovalElement(key: string, patch: Partial<Pick<WorkflowPolicyApprovalElementDraft, "assignees" | "approvalMode">>) {
      input.setWorkflowElements((current) => updateApprovalNode(current, key, (node) => ({ ...node, ...patch })));
    },
    addCondition(key: string) {
      input.setWorkflowElements((current) => updateBranch(current, key, (branch) => ({
        ...branch,
        conditions: [...branch.conditions, createNodeConditionDraft()],
      })));
      select(key, "branch");
    },
    removeCondition(key: string, conditionIndex: number) {
      input.setWorkflowElements((current) => updateBranch(current, key, (branch) => (
        branch.conditions.length > 1
          ? { ...branch, conditions: branch.conditions.filter((_, index) => index !== conditionIndex) }
          : branch
      )));
    },
    addAssignee(key: string, handlerSources: readonly WorkflowHandlerSource[]) {
      input.setWorkflowElements((current) => updateApprovalTarget(current, key, (target) => (
        target.assignees.length < 1
          ? { ...target, assignees: [...target.assignees, defaultNodeAssignee(handlerSources)] }
          : target
      )));
    },
    removeAssignee(key: string, assigneeIndex: number) {
      input.setWorkflowElements((current) => updateApprovalTarget(current, key, (target) => (
        target.assignees.length > 1
          ? { ...target, assignees: target.assignees.filter((_, index) => index !== assigneeIndex) }
          : target
      )));
    },
    remove(key: string) {
      input.setWorkflowElements((current) => {
        if (current.length <= 1 && current[0]?.key === key) return current;
        const next = removeNodeByKey(current, key);
        input.setSelectedWorkflowElementKey((selected) => selected === key ? WORKFLOW_START_KEY : selected);
        return next.length > 0 ? next : current;
      });
    },
    select,
    findNode(key: string | null | undefined) {
      return input.draft ? key : null;
    },
  };
}

function insertElementAfterKey(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  key: string,
  nextElement: WorkflowPolicyTreeNodeDraft,
): WorkflowPolicyTreeNodeDraft[] {
  const nodeIndex = nodes.findIndex((node) => node.key === key);
  if (nodeIndex >= 0) {
    return [
      ...nodes.slice(0, nodeIndex + 1),
      nextElement,
      ...nodes.slice(nodeIndex + 1),
    ];
  }
  let changed = false;
  const next = nodes.map((node) => {
    if (node.kind !== "gateway") return node;
    const branch = node.branches.find((item) => item.key === key);
    if (branch) {
      changed = true;
      return {
        ...node,
        branches: node.branches.map((item) => item.key === key ? { ...item, children: [...item.children, nextElement] } : item),
      };
    }
    const branches = node.branches.map((item) => {
      const children = insertElementAfterKey(item.children, key, nextElement);
      if (children !== item.children) changed = true;
      return children === item.children ? item : { ...item, children };
    });
    return changed ? { ...node, branches } : node;
  });
  return changed ? next : [...nodes];
}

function updateGatewayNode(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  gatewayKey: string,
  update: (node: Extract<WorkflowPolicyTreeNodeDraft, { kind: "gateway" }>) => WorkflowPolicyTreeNodeDraft,
): WorkflowPolicyTreeNodeDraft[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.kind === "gateway" && node.key === gatewayKey) {
      changed = true;
      return update(node);
    }
    if (node.kind !== "gateway") return node;
    const branches = node.branches.map((branch) => {
      const children = updateGatewayNode(branch.children, gatewayKey, update);
      if (children !== branch.children) changed = true;
      return children === branch.children ? branch : { ...branch, children };
    });
    return branches === node.branches ? node : { ...node, branches };
  });
  return changed ? next : [...nodes];
}

function updateApprovalNode(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  key: string,
  update: (node: WorkflowPolicyApprovalElementDraft) => WorkflowPolicyApprovalElementDraft,
): WorkflowPolicyTreeNodeDraft[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.kind === "approval" && node.key === key) {
      changed = true;
      return update(node);
    }
    if (node.kind !== "gateway") return node;
    const branches = node.branches.map((branch) => {
      const children = updateApprovalNode(branch.children, key, update);
      if (children !== branch.children) changed = true;
      return children === branch.children ? branch : { ...branch, children };
    });
    return branches === node.branches ? node : { ...node, branches };
  });
  return changed ? next : [...nodes];
}

function updateBranch(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  key: string,
  update: (branch: WorkflowPolicyGatewayBranchDraft) => WorkflowPolicyGatewayBranchDraft,
): WorkflowPolicyTreeNodeDraft[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.kind !== "gateway") return node;
    const branches = node.branches.map((branch) => {
      if (branch.key === key) {
        changed = true;
        return update(branch);
      }
      const children = updateBranch(branch.children, key, update);
      if (children !== branch.children) changed = true;
      return children === branch.children ? branch : { ...branch, children };
    });
    return changed ? { ...node, branches } : node;
  });
  return changed ? next : [...nodes];
}

function updateApprovalTarget(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  key: string,
  update: <TTarget extends Pick<WorkflowPolicyGatewayBranchDraft, "assignees" | "approvalMode">>(target: TTarget) => TTarget,
): WorkflowPolicyTreeNodeDraft[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.kind === "approval" && node.key === key) {
      changed = true;
      return update(node);
    }
    if (node.kind !== "gateway") return node;
    const branches = node.branches.map((branch) => {
      if (branch.key === key) {
        changed = true;
        return update(branch);
      }
      const children = updateApprovalTarget(branch.children, key, update);
      if (children !== branch.children) changed = true;
      return children === branch.children ? branch : { ...branch, children };
    });
    return changed ? { ...node, branches } : node;
  });
  return changed ? next : [...nodes];
}

function removeNodeByKey(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  key: string,
): WorkflowPolicyTreeNodeDraft[] {
  if (nodes.some((node) => node.key === key)) return nodes.filter((node) => node.key !== key);
  let changed = false;
  const next = nodes.map((node) => {
    if (node.kind !== "gateway") return node;
    const branches = node.branches.map((branch) => {
      const children = removeNodeByKey(branch.children, key);
      if (children !== branch.children) changed = true;
      return children === branch.children ? branch : { ...branch, children };
    });
    return changed ? { ...node, branches } : node;
  });
  return changed ? next : [...nodes];
}

export function workflowSelectionForKey(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  key: string | null | undefined,
) {
  const node = findWorkflowNode(nodes, key);
  if (node) return { node, branch: null, parentGateway: null };
  const branch = findWorkflowBranch(nodes, key);
  if (!branch) return { node: null, branch: null, parentGateway: null };
  return { node: null, branch, parentGateway: findWorkflowBranchParentGateway(nodes, key) };
}
