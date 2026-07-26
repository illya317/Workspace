import {
  resolveActionRuntime,
  type ActionRuntimeDecision,
} from "../../workflow-action-runtime";
import { serviceError, serviceOk } from "../api";
import type { ApprovalRequestRecord } from "./types";

type RequestLifecycleAction = "submit" | "withdraw" | "revise" | "cancel";

export function assertRequestLifecycleAction<TPayload>(
  request: ApprovalRequestRecord<TPayload>,
  actorUserId: number,
  action: RequestLifecycleAction,
) {
  const runtime = resolveActionRuntime({
    businessActionKey: request.businessActionKey,
    workflowPolicyMode: "required",
    workflowWhenDisabled: "unavailable",
    actor: { userId: actorUserId },
    request,
  });
  const decision = runtime.capabilities.workflowRequest[action];
  if (decision.allowed) return serviceOk({ ok: true as const });
  return lifecycleActionError(action, decision);
}

function lifecycleActionError(action: RequestLifecycleAction, decision: ActionRuntimeDecision) {
  if (decision.allowed) return serviceOk({ ok: true as const });
  if (decision.reason === "status_not_actionable") {
    return serviceError(action === "revise" ? "当前状态不能修订" : "当前状态不能执行该操作", 409);
  }
  if (decision.reason === "request_owner_required") {
    return serviceError("只有流程发起人可以执行该操作", 403);
  }
  if (action === "submit") return serviceError("该流程不允许被驳回后重发", 403);
  if (action === "withdraw") return serviceError("该流程不允许发起人撤回", 403);
  if (action === "revise") return serviceError("该流程不允许发起人修订请求", 403);
  return serviceError("该流程不允许发起人删除请求", 403);
}
