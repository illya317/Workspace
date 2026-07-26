import type { ApprovalRequestRecord } from "./types";
import type { WorkflowExecutionState } from "../workflows";
import { stringifyStringArray, stringifyWorkflowJoinState } from "./serialization";

export function activeWorkflowNodeKeys<TPayload>(request: ApprovalRequestRecord<TPayload>) {
  return request.activeWorkflowNodeKeys.length > 0
    ? request.activeWorkflowNodeKeys
    : request.activeWorkflowNodeKey
    ? [request.activeWorkflowNodeKey]
    : [];
}

export function requestForWorkflowNode<TPayload>(
  request: ApprovalRequestRecord<TPayload>,
  workflowNodeKey: string | null,
): ApprovalRequestRecord<TPayload> {
  return {
    ...request,
    activeWorkflowNodeKey: workflowNodeKey,
  };
}

export function requestWithWorkflowState<TPayload>(
  request: ApprovalRequestRecord<TPayload>,
  state: WorkflowExecutionState,
): ApprovalRequestRecord<TPayload> {
  return {
    ...request,
    activeWorkflowNodeKey: state.activeNodeKeys[0] ?? null,
    activeWorkflowNodeKeys: state.activeNodeKeys,
    workflowJoinState: state.joinState,
  };
}

export function workflowRuntimeUpdateData(state: WorkflowExecutionState) {
  return {
    activeWorkflowNodeKey: state.activeNodeKeys[0] ?? null,
    activeWorkflowNodeKeysJson: stringifyStringArray(state.activeNodeKeys),
    workflowJoinStateJson: stringifyWorkflowJoinState(state.joinState),
  };
}
