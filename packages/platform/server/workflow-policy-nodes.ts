import { serviceError, serviceOk, type ServiceResult } from "./api";
import { workflowBranchConditionsMatchPayload } from "./workflow-policy-node-conditions";
import type { WorkflowHandlerSource } from "./workflow-types";

export type WorkflowNodeApprovalMode = "any_one" | "all";
export type WorkflowNodeConditionFieldKind = "company" | "department";
export type WorkflowNodeAssigneeFieldKind = "relationship" | "position" | "employee";
export type WorkflowPolicyGatewayKind = "exclusive" | "inclusive" | "parallel";
export type WorkflowPolicyNodeKind = "approval" | "gateway";

export type WorkflowNodeCondition = {
  fieldKind: WorkflowNodeConditionFieldKind;
  value: string | null;
};

export type WorkflowNodeAssignee = {
  fieldKind: WorkflowNodeAssigneeFieldKind;
  value: string | null;
};

export type WorkflowPolicyApprovalNodeDefinition = {
  key: string;
  kind: "approval";
  assignees: WorkflowNodeAssignee[];
  approvalMode: WorkflowNodeApprovalMode;
};

export type WorkflowPolicyGatewayBranchDefinition = {
  key: string;
  label: string;
  order: number;
  conditions: WorkflowNodeCondition[];
  assignees: WorkflowNodeAssignee[];
  approvalMode: WorkflowNodeApprovalMode;
  children: WorkflowPolicyNodeDefinition[];
};

export type WorkflowPolicyGatewayNodeDefinition = {
  key: string;
  kind: "gateway";
  gatewayKind: WorkflowPolicyGatewayKind;
  branches: WorkflowPolicyGatewayBranchDefinition[];
};

export type WorkflowPolicyNodeDefinition =
  | WorkflowPolicyApprovalNodeDefinition
  | WorkflowPolicyGatewayNodeDefinition;

export type WorkflowPolicyApprovalTarget = {
  key: string;
  assignees: WorkflowNodeAssignee[];
  approvalMode: WorkflowNodeApprovalMode;
};

export type WorkflowExecutionState = {
  activeNodeKeys: string[];
  joinState: Record<string, string[]>;
};

type WorkflowNodeResolvedPolicy = {
  handlerSource: WorkflowHandlerSource;
  workflowNodes: WorkflowPolicyNodeDefinition[];
  activeWorkflowNodeKey: string | null;
  activeWorkflowNodeKeys: string[];
  workflowJoinState: Record<string, string[]>;
};

type RuntimeBranchArrival = {
  gatewayKey: string;
  branchKey: string;
};

type RuntimeEdge = {
  key: string | null;
  arrival?: RuntimeBranchArrival;
};

type RuntimeApprovalNode = WorkflowPolicyApprovalTarget & {
  kind: "approval";
  next: RuntimeEdge;
};

type RuntimeGatewayBranch = {
  key: string;
  conditions: WorkflowNodeCondition[];
  entry: RuntimeEdge;
};

type RuntimeGatewayNode = {
  key: string;
  kind: "gateway";
  gatewayKind: WorkflowPolicyGatewayKind;
  branches: RuntimeGatewayBranch[];
};

type RuntimeJoinNode = {
  key: string;
  kind: "join";
  gatewayKey: string;
  next: RuntimeEdge;
};

type RuntimeNode = RuntimeApprovalNode | RuntimeGatewayNode | RuntimeJoinNode;

type WorkflowRuntime = {
  entry: RuntimeEdge;
  nodes: Map<string, RuntimeNode>;
};

const MAX_GATEWAY_BRANCHES = 3;

export function resolveWorkflowPolicyForPayload<TPolicy extends WorkflowNodeResolvedPolicy, TPayload>(
  policy: TPolicy,
  payload: TPayload,
): ServiceResult<TPolicy> {
  if (policy.workflowNodes.length === 0) return serviceOk(policy);
  const matched = resolveInitialWorkflowStateForPayload(policy.workflowNodes, payload);
  if (!matched.ok) return matched;
  if (matched.data.activeNodeKeys.length > 0) return serviceOk(policyWithExecutionState(policy, matched.data));
  return serviceError("当前流程图未路由到审批节点，不能提交流程", 409);
}

export function resolveNextWorkflowPolicyForPayload<TPolicy extends WorkflowNodeResolvedPolicy, TPayload>(
  policy: TPolicy,
  payload: TPayload,
): ServiceResult<TPolicy | null> {
  if (policy.workflowNodes.length === 0 || !policy.activeWorkflowNodeKey) return serviceOk(null);
  const next = resolveNextWorkflowStateForPayload(
    policy.workflowNodes,
    payload,
    {
      activeNodeKeys: policy.activeWorkflowNodeKeys.length > 0
        ? policy.activeWorkflowNodeKeys
        : [policy.activeWorkflowNodeKey],
      joinState: policy.workflowJoinState,
    },
    policy.activeWorkflowNodeKey,
  );
  if (!next.ok) return next;
  if (next.data.activeNodeKeys.length === 0) return serviceOk(null);
  return serviceOk(policyWithExecutionState(policy, next.data));
}

export function resolveInitialWorkflowStateForPayload<TPayload>(
  nodes: readonly WorkflowPolicyNodeDefinition[],
  payload: TPayload,
): ServiceResult<WorkflowExecutionState> {
  const runtime = compileWorkflowRuntime(nodes);
  return walkRuntimeEdge(runtime.entry, payload, emptyWorkflowExecutionState(), new Set(), runtime);
}

export function resolveNextWorkflowStateForPayload<TPayload>(
  nodes: readonly WorkflowPolicyNodeDefinition[],
  payload: TPayload,
  state: WorkflowExecutionState,
  completedNodeKey: string,
): ServiceResult<WorkflowExecutionState> {
  const runtime = compileWorkflowRuntime(nodes);
  const current = runtime.nodes.get(completedNodeKey);
  if (!current || current.kind !== "approval") return serviceError("当前流程图审批节点不存在，不能继续流程", 409);
  const remaining = {
    activeNodeKeys: state.activeNodeKeys.filter((key) => key !== completedNodeKey),
    joinState: state.joinState,
  };
  return walkRuntimeEdge(current.next, payload, remaining, new Set([current.key]), runtime);
}

export function stringifyWorkflowNodes(nodes: readonly WorkflowPolicyNodeDefinition[]) {
  return JSON.stringify(normalizeWorkflowNodes(nodes, "permission"));
}

export function parseWorkflowNodes(json: string | null | undefined) {
  if (!json) return [];
  try {
    return normalizeWorkflowNodes(JSON.parse(json), "permission");
  } catch {
    return [];
  }
}

export function normalizeWorkflowNodes(value: unknown, fallbackHandlerSource: WorkflowHandlerSource): WorkflowPolicyNodeDefinition[] {
  if (!Array.isArray(value)) return [];
  const usedKeys = new Set<string>();
  return normalizeWorkflowNodeArray(value, fallbackHandlerSource, usedKeys);
}

export function findWorkflowApprovalTarget(
  nodes: readonly WorkflowPolicyNodeDefinition[],
  key: string | null | undefined,
): WorkflowPolicyApprovalTarget | null {
  if (!key) return null;
  for (const node of nodes) {
    const found = findWorkflowApprovalTargetInNode(node, key);
    if (found) return found;
  }
  return null;
}

function walkRuntimeEdge<TPayload>(
  edge: RuntimeEdge,
  payload: TPayload,
  state: WorkflowExecutionState,
  visited: Set<string>,
  runtime: WorkflowRuntime,
): ServiceResult<WorkflowExecutionState> {
  const nextState = edge.arrival ? recordJoinArrival(state, edge.arrival) : state;
  if (!edge.key) return serviceOk(nextState);
  return walkRuntimeNode(edge.key, payload, nextState, visited, runtime);
}

function walkRuntimeNode<TPayload>(
  key: string,
  payload: TPayload,
  state: WorkflowExecutionState,
  visited: Set<string>,
  runtime: WorkflowRuntime,
): ServiceResult<WorkflowExecutionState> {
  if (visited.has(key)) return serviceError("流程图存在循环，不能提交流程", 409);
  const node = runtime.nodes.get(key);
  if (!node) return serviceOk(state);
  if (node.kind === "approval") return serviceOk(addActiveWorkflowNode(state, node.key));
  const nextVisited = new Set(visited);
  nextVisited.add(key);
  if (node.kind === "gateway") return walkRuntimeGateway(node, payload, state, nextVisited, runtime);
  return walkRuntimeJoin(node, payload, state, nextVisited, runtime);
}

function walkRuntimeGateway<TPayload>(
  node: RuntimeGatewayNode,
  payload: TPayload,
  state: WorkflowExecutionState,
  visited: Set<string>,
  runtime: WorkflowRuntime,
): ServiceResult<WorkflowExecutionState> {
  const branches = activeGatewayBranches(node, payload);
  if (branches.length === 0) return serviceError("当前流程图未路由到审批节点，不能继续流程", 409);
  const expected = branches.map((branch) => branch.key);
  let nextState = recordJoinExpected(state, node.key, expected);
  for (const branch of branches) {
    const walked = walkRuntimeEdge(branch.entry, payload, nextState, new Set(visited), runtime);
    if (!walked.ok) return walked;
    nextState = walked.data;
  }
  return serviceOk(nextState);
}

function walkRuntimeJoin<TPayload>(
  node: RuntimeJoinNode,
  payload: TPayload,
  state: WorkflowExecutionState,
  visited: Set<string>,
  runtime: WorkflowRuntime,
): ServiceResult<WorkflowExecutionState> {
  const expected = expectedJoinBranchKeys(state, node.gatewayKey);
  const arrived = arrivedJoinBranchKeys(state, node.gatewayKey);
  if (expected.length > 0 && !expected.every((key) => arrived.has(key))) return serviceOk(state);
  return walkRuntimeEdge(node.next, payload, state, visited, runtime);
}

function activeGatewayBranches<TPayload>(node: RuntimeGatewayNode, payload: TPayload) {
  if (node.gatewayKind === "parallel") return node.branches;
  const matched = node.branches.filter((branch) => workflowBranchConditionsMatchPayload(branch.conditions, payload));
  if (node.gatewayKind === "exclusive") return matched.slice(0, 1);
  return matched;
}

function compileWorkflowRuntime(nodes: readonly WorkflowPolicyNodeDefinition[]): WorkflowRuntime {
  const runtime: WorkflowRuntime = {
    entry: { key: null },
    nodes: new Map(),
  };
  runtime.entry = flattenRuntimeSequence(nodes, { key: null }, runtime);
  return runtime;
}

function flattenRuntimeSequence(
  nodes: readonly WorkflowPolicyNodeDefinition[],
  next: RuntimeEdge,
  runtime: WorkflowRuntime,
): RuntimeEdge {
  let edge = next;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    edge = flattenRuntimeNode(nodes[index], edge, runtime);
  }
  return edge;
}

function flattenRuntimeNode(
  node: WorkflowPolicyNodeDefinition,
  next: RuntimeEdge,
  runtime: WorkflowRuntime,
): RuntimeEdge {
  if (node.kind === "approval") {
    runtime.nodes.set(node.key, { ...node, kind: "approval", next });
    return { key: node.key };
  }
  const joinKey = workflowJoinKey(node.key);
  runtime.nodes.set(joinKey, { key: joinKey, kind: "join", gatewayKey: node.key, next });
  const branches = sortedGatewayBranches(node.branches).map((branch) => {
    const branchDone = { key: joinKey, arrival: { gatewayKey: node.key, branchKey: branch.key } };
    const childEntry = flattenRuntimeSequence(branch.children, branchDone, runtime);
    runtime.nodes.set(branch.key, {
      key: branch.key,
      kind: "approval",
      assignees: branch.assignees,
      approvalMode: branch.approvalMode,
      next: childEntry,
    });
    return {
      key: branch.key,
      conditions: branch.conditions,
      entry: { key: branch.key },
    };
  });
  runtime.nodes.set(node.key, {
    key: node.key,
    kind: "gateway",
    gatewayKind: node.gatewayKind,
    branches,
  });
  return { key: node.key };
}

function policyWithExecutionState<TPolicy extends WorkflowNodeResolvedPolicy>(policy: TPolicy, state: WorkflowExecutionState): TPolicy {
  const activeWorkflowNodeKey = state.activeNodeKeys[0] ?? null;
  const activeNode = findWorkflowApprovalTarget(policy.workflowNodes, activeWorkflowNodeKey);
  return {
    ...policy,
    handlerSource: activeNode ? workflowNodeHandlerSource(activeNode, policy.handlerSource) : policy.handlerSource,
    activeWorkflowNodeKey,
    activeWorkflowNodeKeys: state.activeNodeKeys,
    workflowJoinState: state.joinState,
  };
}

function emptyWorkflowExecutionState(): WorkflowExecutionState {
  return { activeNodeKeys: [], joinState: {} };
}

function addActiveWorkflowNode(state: WorkflowExecutionState, key: string): WorkflowExecutionState {
  return state.activeNodeKeys.includes(key)
    ? state
    : { ...state, activeNodeKeys: [...state.activeNodeKeys, key] };
}

function recordJoinExpected(
  state: WorkflowExecutionState,
  gatewayKey: string,
  branchKeys: readonly string[],
): WorkflowExecutionState {
  const expected = Array.from(new Set(branchKeys.filter(Boolean)));
  const existingArrived = arrivedJoinBranchKeys(state, gatewayKey);
  const values = [
    ...expected.map((key) => joinStateExpectedKey(key)),
    ...expected.filter((key) => existingArrived.has(key)).map((key) => joinStateArrivedKey(key)),
  ];
  return { ...state, joinState: { ...state.joinState, [gatewayKey]: values } };
}

function recordJoinArrival(state: WorkflowExecutionState, arrival: RuntimeBranchArrival): WorkflowExecutionState {
  const expected = expectedJoinBranchKeys(state, arrival.gatewayKey);
  const values = state.joinState[arrival.gatewayKey] ?? [];
  const shouldRecord = expected.length === 0 || expected.includes(arrival.branchKey);
  const next = shouldRecord
    ? Array.from(new Set([...values, joinStateArrivedKey(arrival.branchKey)]))
    : values;
  return { ...state, joinState: { ...state.joinState, [arrival.gatewayKey]: next } };
}

function expectedJoinBranchKeys(state: WorkflowExecutionState, gatewayKey: string) {
  return (state.joinState[gatewayKey] ?? []).flatMap((item) => (
    item.startsWith("expected:") ? [item.slice("expected:".length)] : []
  ));
}

function arrivedJoinBranchKeys(state: WorkflowExecutionState, gatewayKey: string) {
  return new Set((state.joinState[gatewayKey] ?? []).flatMap((item) => (
    item.startsWith("arrived:") ? [item.slice("arrived:".length)] : []
  )));
}

function joinStateExpectedKey(branchKey: string) {
  return `expected:${branchKey}`;
}

function joinStateArrivedKey(branchKey: string) {
  return `arrived:${branchKey}`;
}

function workflowNodeHandlerSource(node: WorkflowPolicyApprovalTarget, fallback: WorkflowHandlerSource) {
  const relationship = node.assignees.find((assignee) => assignee.fieldKind === "relationship");
  return normalizeHandlerSource(relationship?.value, fallback);
}

function normalizeWorkflowNodeArray(
  value: readonly unknown[],
  fallbackHandlerSource: WorkflowHandlerSource,
  usedKeys: Set<string>,
): WorkflowPolicyNodeDefinition[] {
  return value.flatMap((item, index) => normalizeWorkflowNode(item, index, fallbackHandlerSource, usedKeys) ?? []);
}

function normalizeWorkflowNode(
  item: unknown,
  index: number,
  fallbackHandlerSource: WorkflowHandlerSource,
  usedKeys: Set<string>,
): WorkflowPolicyNodeDefinition | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const kind = record.kind === "gateway" ? "gateway" : "approval";
  const key = uniqueWorkflowKey(String(record.key ?? "").trim() || `node-${index + 1}`, usedKeys);
  if (kind === "gateway") {
    return {
      key,
      kind: "gateway",
      gatewayKind: normalizeGatewayKind(record.gatewayKind),
      branches: normalizeGatewayBranches(record.branches, fallbackHandlerSource, usedKeys),
    };
  }
  return {
    key,
    kind: "approval",
    assignees: normalizeNodeAssignees(record.assignees, fallbackHandlerSource),
    approvalMode: normalizeApprovalMode(record.approvalMode),
  };
}

function normalizeGatewayBranches(
  value: unknown,
  fallbackHandlerSource: WorkflowHandlerSource,
  usedKeys: Set<string>,
): WorkflowPolicyGatewayBranchDefinition[] {
  const raw = Array.isArray(value) && value.length > 0 ? value : [{}];
  return raw.slice(0, MAX_GATEWAY_BRANCHES).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const key = uniqueWorkflowKey(String(record.key ?? "").trim() || `branch-${index + 1}`, usedKeys);
    const label = String(record.label ?? "").trim() || `分支 ${index + 1}`;
    const orderValue = Number(record.order);
    return {
      key,
      label,
      order: Number.isFinite(orderValue) ? orderValue : index + 1,
      conditions: normalizeNodeConditions(record.conditions),
      assignees: normalizeNodeAssignees(record.assignees, fallbackHandlerSource),
      approvalMode: normalizeApprovalMode(record.approvalMode),
      children: normalizeWorkflowNodeArray(Array.isArray(record.children) ? record.children : [], fallbackHandlerSource, usedKeys),
    };
  });
}

function normalizeGatewayKind(value: unknown): WorkflowPolicyGatewayKind {
  return value === "inclusive" || value === "parallel" ? value : "exclusive";
}

function normalizeApprovalMode(value: unknown): WorkflowNodeApprovalMode {
  return value === "all" ? "all" : "any_one";
}

function normalizeNodeConditions(value: unknown): WorkflowNodeCondition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const fieldKind = record.fieldKind === "department" ? "department" : "company";
    const rawValue = record.value;
    return [{ fieldKind, value: rawValue === null || rawValue === undefined || rawValue === "" ? null : String(rawValue) }];
  });
}

function normalizeNodeAssignees(value: unknown, fallbackHandlerSource: WorkflowHandlerSource): WorkflowNodeAssignee[] {
  if (!Array.isArray(value)) return [defaultRelationshipAssignee(fallbackHandlerSource)];
  const assignees = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const fieldKind: WorkflowNodeAssigneeFieldKind = record.fieldKind === "position" || record.fieldKind === "employee"
      ? record.fieldKind
      : "relationship";
    const rawValue = record.value;
    return [{ fieldKind, value: rawValue === null || rawValue === undefined || rawValue === "" ? null : String(rawValue) }];
  });
  return assignees.length > 0 ? assignees : [defaultRelationshipAssignee(fallbackHandlerSource)];
}

function defaultRelationshipAssignee(fallbackHandlerSource: WorkflowHandlerSource): WorkflowNodeAssignee {
  return {
    fieldKind: "relationship",
    value: fallbackHandlerSource === "direct_manager" || fallbackHandlerSource === "department_owner"
      ? fallbackHandlerSource
      : null,
  };
}

function findWorkflowApprovalTargetInNode(
  node: WorkflowPolicyNodeDefinition,
  key: string,
): WorkflowPolicyApprovalTarget | null {
  if (node.kind === "approval") return node.key === key ? node : null;
  for (const branch of node.branches) {
    if (branch.key === key) return branch;
    const found = findWorkflowApprovalTarget(branch.children, key);
    if (found) return found;
  }
  return null;
}

function sortedGatewayBranches(branches: readonly WorkflowPolicyGatewayBranchDefinition[]) {
  return [...branches].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "zh-CN"));
}

function workflowJoinKey(gatewayKey: string) {
  return `${gatewayKey}__join`;
}

function uniqueWorkflowKey(rawKey: string, usedKeys: Set<string>) {
  const base = rawKey.trim() || "workflow-node";
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }
  let suffix = 2;
  while (usedKeys.has(`${base}-${suffix}`)) suffix += 1;
  const key = `${base}-${suffix}`;
  usedKeys.add(key);
  return key;
}

function normalizeHandlerSource(value: string | null | undefined, fallback: WorkflowHandlerSource): WorkflowHandlerSource {
  return value === "direct_manager" || value === "department_owner" || value === "permission" ? value : fallback;
}
