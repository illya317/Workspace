import type { WorkflowHandlerSource, WorkflowPolicyDraft } from "./WorkflowPoliciesTabModel";

export type WorkflowNodeApprovalMode = "any_one" | "all";
export type WorkflowNodeRelationshipSource = Extract<WorkflowHandlerSource, "direct_manager" | "department_owner">;
export type WorkflowConditionFieldKind = "company" | "department";
export type WorkflowAssigneeFieldKind = "relationship" | "position" | "employee";
export type WorkflowPolicyGatewayKind = "exclusive" | "inclusive" | "parallel";
export type WorkflowPolicyInsertKind = "approval" | WorkflowPolicyGatewayKind;
export type WorkflowPolicyGraphElementKind = WorkflowPolicyInsertKind;
export type WorkflowPolicyGraphSelectionKind = "start" | "approval" | "gateway" | "branch";

export const WORKFLOW_START_KEY = "__workflow-start__";

export interface WorkflowPolicyNodeConditionDraft {
  fieldKind: WorkflowConditionFieldKind;
  value: string | null;
}

export interface WorkflowPolicyNodeAssigneeDraft {
  fieldKind: WorkflowAssigneeFieldKind;
  value: string | null;
}

export interface WorkflowPolicyApprovalNodeDraft {
  key: string;
  kind: "approval";
  actionKey: string;
  assignees: WorkflowPolicyNodeAssigneeDraft[];
  approvalMode: WorkflowNodeApprovalMode;
}

export interface WorkflowPolicyGatewayBranchDraft {
  key: string;
  actionKey: string;
  label: string;
  order: number;
  conditions: WorkflowPolicyNodeConditionDraft[];
  assignees: WorkflowPolicyNodeAssigneeDraft[];
  approvalMode: WorkflowNodeApprovalMode;
  children: WorkflowPolicyTreeNodeDraft[];
}

export interface WorkflowPolicyGatewayNodeDraft {
  key: string;
  kind: "gateway";
  gatewayKind: WorkflowPolicyGatewayKind;
  actionKey: string;
  branches: WorkflowPolicyGatewayBranchDraft[];
}

export type WorkflowPolicyTreeNodeDraft =
  | WorkflowPolicyApprovalNodeDraft
  | WorkflowPolicyGatewayNodeDraft;

export type WorkflowPolicyGraphElementDraft = WorkflowPolicyTreeNodeDraft;
export type WorkflowPolicyApprovalElementDraft = WorkflowPolicyApprovalNodeDraft;
export type WorkflowPolicyConditionElementDraft = WorkflowPolicyGatewayBranchDraft;

export interface WorkflowPolicyApprovalNodePayload {
  key: string;
  kind: "approval";
  assignees: WorkflowPolicyNodeAssigneeDraft[];
  approvalMode: WorkflowNodeApprovalMode;
}

export interface WorkflowPolicyGatewayBranchPayload {
  key: string;
  label: string;
  order: number;
  conditions: WorkflowPolicyNodeConditionDraft[];
  assignees: WorkflowPolicyNodeAssigneeDraft[];
  approvalMode: WorkflowNodeApprovalMode;
  children: WorkflowPolicyNodeDraft[];
}

export interface WorkflowPolicyGatewayNodePayload {
  key: string;
  kind: "gateway";
  gatewayKind: WorkflowPolicyGatewayKind;
  branches: WorkflowPolicyGatewayBranchPayload[];
}

export type WorkflowPolicyNodeDraft =
  | WorkflowPolicyApprovalNodePayload
  | WorkflowPolicyGatewayNodePayload;

export function createWorkflowApprovalElementDraft(
  actionKey: string,
  handlerSource: WorkflowHandlerSource,
  approvalMode: WorkflowNodeApprovalMode = "any_one",
): WorkflowPolicyApprovalNodeDraft {
  return {
    key: createWorkflowElementKey("approval"),
    kind: "approval",
    actionKey,
    assignees: [createNodeAssigneeDraft(handlerSource)],
    approvalMode,
  };
}

export function createWorkflowGatewayElementDraft(
  actionKey: string,
  gatewayKind: WorkflowPolicyGatewayKind,
  handlerSource: WorkflowHandlerSource,
): WorkflowPolicyGatewayNodeDraft {
  return {
    key: createWorkflowElementKey(gatewayKind),
    kind: "gateway",
    gatewayKind,
    actionKey,
    branches: [createWorkflowGatewayBranchDraft(actionKey, handlerSource, 1)],
  };
}

export function createWorkflowGatewayBranchDraft(
  actionKey: string,
  handlerSource: WorkflowHandlerSource,
  order: number,
): WorkflowPolicyGatewayBranchDraft {
  return {
    key: createWorkflowElementKey("branch"),
    actionKey,
    label: "",
    order,
    conditions: [createNodeConditionDraft()],
    assignees: [createNodeAssigneeDraft(handlerSource)],
    approvalMode: "any_one",
    children: [],
  };
}

export function initialWorkflowGraphElements(draft: WorkflowPolicyDraft): WorkflowPolicyTreeNodeDraft[] {
  return [createWorkflowApprovalElementDraft(draft.businessActionKey, draft.handlerSource)];
}

export function savedWorkflowGraphElementsForAction(
  actionKey: string,
  policy: { workflowNodes?: readonly WorkflowPolicyNodeDraft[] } | null,
  fallbackDraft: WorkflowPolicyDraft,
): WorkflowPolicyTreeNodeDraft[] {
  if (!policy?.workflowNodes?.length) return initialWorkflowGraphElements(fallbackDraft);
  const nodes = policy.workflowNodes.flatMap((node) => savedWorkflowNodeForAction(actionKey, node, fallbackDraft.handlerSource) ?? []);
  return nodes.length > 0 ? nodes : initialWorkflowGraphElements(fallbackDraft);
}

export function workflowNodesFromGraphElements(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
): WorkflowPolicyNodeDraft[] {
  return nodes.map(workflowNodePayloadFromDraft);
}

export function workflowNodePrimaryHandlerSource(
  node: WorkflowPolicyNodeDraft | readonly WorkflowPolicyNodeDraft[] | undefined,
  fallback: WorkflowHandlerSource,
): WorkflowHandlerSource {
  if (!node) return fallback;
  if (isWorkflowNodeArray(node)) {
    const target = firstApprovalPayload(node);
    if (!target) return fallback;
    return target.kind === "approval"
      ? handlerSourceFromAssignees(target.assignees, fallback)
      : fallback;
  }
  if (node.kind === "approval") return handlerSourceFromAssignees(node.assignees, fallback);
  const branch = node.branches[0];
  return branch ? handlerSourceFromAssignees(branch.assignees, fallback) : fallback;
}

export function defaultNodeHandlerSource(options: readonly WorkflowHandlerSource[]) {
  return options.includes("permission") ? "permission" : options[0] ?? "permission";
}

export function createNodeConditionDraft(): WorkflowPolicyNodeConditionDraft {
  return { fieldKind: "company", value: null };
}

export function createNodeAssigneeDraft(
  handlerSource: WorkflowHandlerSource | null,
): WorkflowPolicyNodeAssigneeDraft {
  const relationshipSource = normalizeRelationshipSource(handlerSource);
  return relationshipSource
    ? { fieldKind: "relationship", value: relationshipSource }
    : { fieldKind: "position", value: null };
}

export function defaultNodeAssignee(options: readonly WorkflowHandlerSource[]) {
  const relationshipSource = (["direct_manager", "department_owner"] as const)
    .find((source) => options.includes(source)) ?? null;
  return relationshipSource
    ? { fieldKind: "relationship" as const, value: relationshipSource }
    : { fieldKind: "position" as const, value: null };
}

export function findWorkflowNode(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  key: string | null | undefined,
): WorkflowPolicyTreeNodeDraft | null {
  if (!key) return null;
  for (const node of nodes) {
    if (node.key === key) return node;
    if (node.kind === "gateway") {
      for (const branch of node.branches) {
        const child = findWorkflowNode(branch.children, key);
        if (child) return child;
      }
    }
  }
  return null;
}

export function findWorkflowBranch(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  key: string | null | undefined,
): WorkflowPolicyGatewayBranchDraft | null {
  if (!key) return null;
  for (const node of nodes) {
    if (node.kind !== "gateway") continue;
    const branch = node.branches.find((item) => item.key === key);
    if (branch) return branch;
    for (const childBranch of node.branches) {
      const nested = findWorkflowBranch(childBranch.children, key);
      if (nested) return nested;
    }
  }
  return null;
}

export function findWorkflowBranchParentGateway(
  nodes: readonly WorkflowPolicyTreeNodeDraft[],
  branchKey: string | null | undefined,
): WorkflowPolicyGatewayNodeDraft | null {
  if (!branchKey) return null;
  for (const node of nodes) {
    if (node.kind !== "gateway") continue;
    if (node.branches.some((branch) => branch.key === branchKey)) return node;
    for (const branch of node.branches) {
      const nested = findWorkflowBranchParentGateway(branch.children, branchKey);
      if (nested) return nested;
    }
  }
  return null;
}

export function workflowContainsKey(nodes: readonly WorkflowPolicyTreeNodeDraft[], key: string | null | undefined) {
  if (!key) return false;
  return Boolean(findWorkflowNode(nodes, key) || findWorkflowBranch(nodes, key));
}

export function sortedWorkflowBranches(branches: readonly WorkflowPolicyGatewayBranchDraft[]) {
  return [...branches].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "zh-CN"));
}

function savedWorkflowNodeForAction(
  actionKey: string,
  node: WorkflowPolicyNodeDraft,
  fallbackHandlerSource: WorkflowHandlerSource,
): WorkflowPolicyTreeNodeDraft | null {
  if (node.kind === "gateway") {
    return {
      key: node.key,
      kind: "gateway",
      gatewayKind: node.gatewayKind,
      actionKey,
      branches: node.branches.slice(0, 3).map((branch, index) => ({
        key: branch.key,
        actionKey,
        label: branch.label,
        order: Number.isFinite(branch.order) ? branch.order : index + 1,
        conditions: branch.conditions.length > 0 ? branch.conditions : [createNodeConditionDraft()],
        assignees: branch.assignees.length > 0 ? branch.assignees : [createNodeAssigneeDraft(fallbackHandlerSource)],
        approvalMode: branch.approvalMode,
        children: branch.children.flatMap((child) => savedWorkflowNodeForAction(actionKey, child, fallbackHandlerSource) ?? []),
      })),
    };
  }
  return {
    key: node.key,
    kind: "approval",
    actionKey,
    assignees: node.assignees.length > 0 ? node.assignees : [createNodeAssigneeDraft(fallbackHandlerSource)],
    approvalMode: node.approvalMode,
  };
}

function workflowNodePayloadFromDraft(node: WorkflowPolicyTreeNodeDraft): WorkflowPolicyNodeDraft {
  if (node.kind === "approval") {
    return {
      key: node.key,
      kind: "approval",
      assignees: node.assignees.slice(0, 1),
      approvalMode: node.approvalMode,
    };
  }
  return {
    key: node.key,
    kind: "gateway",
    gatewayKind: node.gatewayKind,
    branches: sortedWorkflowBranches(node.branches).map((branch, index) => ({
      key: branch.key,
      label: branch.label,
      order: index + 1,
      conditions: node.gatewayKind === "parallel" ? [] : branch.conditions,
      assignees: branch.assignees.slice(0, 1),
      approvalMode: branch.approvalMode,
      children: workflowNodesFromGraphElements(branch.children),
    })),
  };
}

function firstApprovalPayload(nodes: readonly WorkflowPolicyNodeDraft[]): WorkflowPolicyNodeDraft | null {
  for (const node of nodes) {
    if (node.kind === "approval") return node;
    if (node.branches[0]) return {
      key: node.branches[0].key,
      kind: "approval",
      assignees: node.branches[0].assignees,
      approvalMode: node.branches[0].approvalMode,
    };
  }
  return null;
}

function isWorkflowNodeArray(
  value: WorkflowPolicyNodeDraft | readonly WorkflowPolicyNodeDraft[],
): value is readonly WorkflowPolicyNodeDraft[] {
  return Array.isArray(value);
}

function handlerSourceFromAssignees(
  assignees: readonly WorkflowPolicyNodeAssigneeDraft[],
  fallback: WorkflowHandlerSource,
) {
  const assignee = assignees[0];
  return assignee?.fieldKind === "relationship" ? normalizeRelationshipSource(assignee.value) ?? fallback : fallback;
}

function normalizeRelationshipSource(value: unknown): WorkflowNodeRelationshipSource | null {
  return value === "direct_manager" || value === "department_owner" ? value : null;
}

function createWorkflowElementKey(kind: WorkflowPolicyInsertKind | "branch") {
  return `workflow-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
