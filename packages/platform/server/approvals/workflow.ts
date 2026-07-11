import { serviceError, serviceOk, type ServiceResult } from "../api";
import {
  resolveWorkflowPolicy,
  type WorkflowExecutionState,
  resolveNextWorkflowPolicyForPayload,
  resolveWorkflowPolicyForPayload,
  stringifyWorkflowNodes,
  type ResolvedWorkflowPolicy,
  type WorkflowPolicyDefaults,
} from "../workflows";
import { stringifyStringArray, stringifyWorkflowJoinState } from "./serialization";
import { activeWorkflowNodeKeys, requestForWorkflowNode } from "./runtime";
import type {
  ApprovalAdapter,
  ApprovalEventType,
  ApprovalOperation,
  ApprovalPreparedPayload,
  ApprovalRequestRecord,
} from "./types";

export async function resolveApprovalWorkflowPolicy<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    actorUserId?: number | null;
    operation: ApprovalOperation;
    prepared?: ApprovalPreparedPayload<TPayload>;
    request?: ApprovalRequestRecord<TPayload>;
  },
): Promise<ResolvedWorkflowPolicy> {
  if (input.request) return workflowPolicyFromRequest(input.request, input.prepared);
  const defaults = await resolveAdapterDefaults(adapter, input);
  const resourceKey = input.prepared?.resourceKey ?? null;
  const scopeId = input.prepared?.scopeId ?? null;
  return resolveWorkflowPolicy({
    businessActionKey: defaults.businessActionKey,
    resourceKey,
    scopeType: defaults.scopeType,
    scopeId,
    actorUserId: input.actorUserId,
    defaults,
  });
}

function workflowPolicyFromRequest<TPayload>(
  request: ApprovalRequestRecord<TPayload>,
  prepared?: ApprovalPreparedPayload<TPayload>,
): ResolvedWorkflowPolicy {
  return {
    businessActionKey: request.businessActionKey,
    resourceKey: prepared?.resourceKey ?? request.resourceKey,
    scopeType: prepared?.workflowScopeType ?? "global",
    scopeId: prepared?.scopeId ?? request.scopeId ?? "",
    mode: "required",
    flowType: request.flowType,
    separationPolicy: request.separationPolicy,
    handlerSource: request.handlerSource,
    workflowNodes: request.workflowNodes,
    activeWorkflowNodeKey: request.activeWorkflowNodeKey,
    activeWorkflowNodeKeys: request.activeWorkflowNodeKeys,
    workflowJoinState: request.workflowJoinState,
    handlerCanRevise: request.handlerCanRevise,
    requestCanWithdraw: request.requestCanWithdraw,
    requestCanResubmit: request.requestCanResubmit,
    requestCanCancel: request.requestCanCancel,
    requestCanRevise: request.requestCanRevise,
    source: "policy",
    policyId: null,
    version: null,
  };
}

export function workflowUpdateData(policy: ResolvedWorkflowPolicy) {
  return {
    businessActionKey: policy.businessActionKey,
    flowType: policy.flowType,
    separationPolicy: policy.separationPolicy,
    handlerSource: policy.handlerSource,
    workflowNodesJson: stringifyWorkflowNodes(policy.workflowNodes),
    activeWorkflowNodeKey: policy.activeWorkflowNodeKey,
    activeWorkflowNodeKeysJson: stringifyStringArray(policy.activeWorkflowNodeKeys),
    workflowJoinStateJson: stringifyWorkflowJoinState(policy.workflowJoinState),
    handlerCanRevise: policy.handlerCanRevise,
    requestCanWithdraw: policy.requestCanWithdraw,
    requestCanResubmit: policy.requestCanResubmit,
    requestCanCancel: policy.requestCanCancel,
    requestCanRevise: policy.requestCanRevise,
  };
}

export function workflowStateUpdateData(state: WorkflowExecutionState) {
  return {
    activeWorkflowNodeKey: state.activeNodeKeys[0] ?? null,
    activeWorkflowNodeKeysJson: stringifyStringArray(state.activeNodeKeys),
    workflowJoinStateJson: stringifyWorkflowJoinState(state.joinState),
  };
}

export function resolveExecutableWorkflowPolicy<TPayload>(
  policy: ResolvedWorkflowPolicy,
  payload: TPayload,
) {
  return resolveWorkflowPolicyForPayload(policy, payload);
}

export function resolveNextExecutableWorkflowPolicy<TPayload>(
  policy: ResolvedWorkflowPolicy,
  payload: TPayload,
) {
  return resolveNextWorkflowPolicyForPayload(policy, payload);
}

export function assertWorkflowProcessAllowed<TPayload>(
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
) {
  if (request.separationPolicy !== "independent_required") return serviceOk({ ok: true as const });
  if (request.submitterUserId !== actorUserId) return serviceOk({ ok: true as const });
  return serviceError("该流程要求提交人和处理人分离", 403);
}

export async function assertApprovalHandlersAvailable<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
): Promise<ServiceResult<{ ok: true }>> {
  if (!adapter.resolveHandlers) return serviceOk({ ok: true as const });
  const activeKeys = activeWorkflowNodeKeys(request);
  if (activeKeys.length > 1) {
    for (const activeKey of activeKeys) {
      const available = await assertApprovalHandlersAvailable(
        adapter,
        { ...requestForWorkflowNode(request, activeKey), activeWorkflowNodeKeys: [activeKey] },
        actorUserId,
      );
      if (!available.ok) return available;
    }
    return serviceOk({ ok: true as const });
  }
  const handlers = dedupeUserIds(await adapter.resolveHandlers({
    handlerSource: request.handlerSource,
    request,
    actorUserId,
  }));
  const eligibleHandlers = request.separationPolicy === "independent_required"
    ? handlers.filter((handlerUserId) => handlerUserId !== request.submitterUserId)
    : handlers;
  if (eligibleHandlers.length > 0) return serviceOk({ ok: true as const });
  return serviceError(`未找到${handlerSourceLabel(request.handlerSource)}，不能提交该流程`, 409);
}

export function workflowResolutionEventType(flowType: string): ApprovalEventType {
  if (flowType === "review") return "review";
  if (flowType === "publish") return "publish";
  return "approve";
}

function handlerSourceLabel(source: ApprovalRequestRecord<unknown>["handlerSource"]) {
  if (source === "direct_manager") return "直属上级";
  if (source === "department_owner") return "部门负责人";
  return "有权限者";
}

function dedupeUserIds(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

async function resolveAdapterDefaults<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    actorUserId?: number | null;
    operation: ApprovalOperation;
    prepared?: ApprovalPreparedPayload<TPayload>;
    request?: ApprovalRequestRecord<TPayload>;
  },
): Promise<WorkflowPolicyDefaults> {
  const fromAdapter = typeof adapter.workflowDefaults === "function"
    ? await adapter.workflowDefaults(input)
    : adapter.workflowDefaults;
  return {
    businessActionKey: input.prepared?.businessActionKey
      ?? input.request?.businessActionKey
      ?? fromAdapter?.businessActionKey
      ?? `${adapter.subjectType}.${input.operation}`,
    scopeType: input.prepared?.workflowScopeType ?? fromAdapter?.scopeType ?? null,
    mode: input.prepared?.workflowMode ?? fromAdapter?.mode ?? null,
    flowType: input.prepared?.flowType ?? input.request?.flowType ?? fromAdapter?.flowType ?? "approval",
    separationPolicy: input.prepared?.separationPolicy
      ?? input.request?.separationPolicy
      ?? fromAdapter?.separationPolicy
      ?? "auto_pass_if_authorized",
    handlerSource: input.prepared?.workflowHandlerSource ?? fromAdapter?.handlerSource ?? "permission",
    workflowNodes: input.request?.workflowNodes ?? fromAdapter?.workflowNodes ?? null,
    handlerCanRevise: input.prepared?.workflowHandlerCanRevise ?? input.request?.handlerCanRevise ?? fromAdapter?.handlerCanRevise ?? true,
    requestCanWithdraw: input.prepared?.workflowRequestCanWithdraw ?? input.request?.requestCanWithdraw ?? fromAdapter?.requestCanWithdraw ?? true,
    requestCanResubmit: input.prepared?.workflowRequestCanResubmit ?? input.request?.requestCanResubmit ?? fromAdapter?.requestCanResubmit ?? true,
    requestCanCancel: input.prepared?.workflowRequestCanCancel ?? input.request?.requestCanCancel ?? fromAdapter?.requestCanCancel ?? true,
    requestCanRevise: input.prepared?.workflowRequestCanRevise ?? input.request?.requestCanRevise ?? fromAdapter?.requestCanRevise ?? true,
  };
}
