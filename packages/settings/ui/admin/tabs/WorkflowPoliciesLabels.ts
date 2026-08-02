import type { ResourceTreeNode } from "../components/ResourceTree";

export type WorkflowPolicyMode = "direct" | "optional" | "required" | "permission_only";
export type WorkflowFlowType = "approval" | "review" | "publish";
export type WorkflowSeparationPolicy = "independent_required" | "auto_pass_if_authorized";
export type WorkflowHandlerSource = "direct_manager" | "department_owner" | "permission";
export type BusinessActionEligibility = "workflow_optional" | "workflow_required" | "permission_only" | "internal";
export type WorkflowAccessMode = "workflow" | "permission_only";
export type WorkflowActionStatusKind = "not_applicable" | "not_ready" | "unset" | "enabled" | "default_enabled" | "disabled" | "config_error";
export type WorkflowActionStatusTone = ResourceTreeNode["statusVariant"];
export type WorkflowIntentKind = "default_flow" | "opt_in" | "direct_only" | "not_applicable" | "internal";
export type WorkflowReadinessState = "ready" | "native" | "partial" | "not_ready" | "direct_only" | "not_applicable" | "internal";
export type WorkflowExecutionPath = "approval_request" | "native_business_state";
export type WorkflowProductStatus = "not_applicable" | "not_integrated" | "unset" | "enabled" | "default_enabled" | "disabled";
export type WorkflowProductState = WorkflowActionStatusKind;

export interface WorkflowIntentDto {
  kind: WorkflowIntentKind;
  reason: string;
  risk?: "high";
}

export interface WorkflowReadinessDto {
  state: WorkflowReadinessState;
  executionPath?: WorkflowExecutionPath | null;
  evidence: {
    adapter?: boolean | "not_applicable" | "native_transition" | "ui_only";
    directWriteGuard?: boolean | "not_applicable" | "native_transition" | "ui_only";
    approvedCommitPath?: boolean | "native_transition" | "not_applicable" | "ui_only";
    submissionRoutes?: boolean | "not_applicable";
    statusUi?: boolean | "not_applicable" | "ui_only";
    ledgerVisibility?: boolean | "not_applicable" | "native_transition" | "ui_only";
  };
  missing?: readonly string[];
}

export interface WorkflowActionLabelSource {
  key: string;
  writeKind: string;
  eligibility: BusinessActionEligibility;
  flowType?: WorkflowFlowType;
  workflowIntent: WorkflowIntentDto;
  workflowReadiness: WorkflowReadinessDto;
  productStatus: WorkflowProductStatus;
  workflowProductState: WorkflowProductState;
  actionContract?: {
    workflow?: {
      kind: "not_applicable" | "configurable" | "native";
      whenDisabled?: "direct_write" | "unavailable";
    } | null;
  } | null;
}

export interface WorkflowPolicyLabelSource {
  scopeType: string;
  scopeId: string;
  mode: WorkflowPolicyMode;
  flowType?: WorkflowFlowType;
  separationPolicy?: WorkflowSeparationPolicy;
  handlerSource?: WorkflowHandlerSource | string;
}

export interface WorkflowActionStatusView {
  kind: WorkflowActionStatusKind;
  label: string;
  tone: WorkflowActionStatusTone;
  configurable: boolean;
  detailText: string;
}

export const MODE_LABEL: Record<WorkflowPolicyMode, string> = {
  permission_only: "不接流程",
  direct: "不接流程",
  optional: "接入流程",
  required: "接入流程",
};

export const ACCESS_LABEL: Record<WorkflowAccessMode, string> = {
  permission_only: "权限直写",
  workflow: "接入流程",
};

export const FLOW_LABEL: Record<WorkflowFlowType, string> = {
  approval: "审批",
  review: "复核",
  publish: "发布动作",
};

export const SEPARATION_LABEL: Record<WorkflowSeparationPolicy, string> = {
  independent_required: "必须他人处理",
  auto_pass_if_authorized: "有权限自动处理",
};

export function separationPolicyLabel(policy: WorkflowSeparationPolicy) {
  return SEPARATION_LABEL[workflowSeparationMode(policy)];
}

export const HANDLER_SOURCE_LABEL: Record<string, string> = {
  direct_manager: "直属上级",
  department_owner: "部门负责人",
  permission: "有权限者",
};

export const ELIGIBILITY_LABEL: Record<string, string> = {
  all: "全部行为",
  workflow_optional: "可选接入",
  workflow_required: "默认接入流程",
  permission_only: "未接入/不适用",
  internal: "内部行为",
};

const ACTION_STATUS_VIEW: Record<WorkflowActionStatusKind, WorkflowActionStatusView> = {
  not_applicable: { kind: "not_applicable", label: "不适用", tone: "gray", configurable: false, detailText: "该动作不进入流程设置，仍按权限直接控制。" },
  not_ready: { kind: "not_ready", label: "未接入", tone: "yellow", configurable: false, detailText: "该动作已登记，但流程提交、处理或状态展示尚未完整接入，暂不能启用。" },
  unset: { kind: "unset", label: "未设置", tone: "yellow", configurable: true, detailText: "该动作可以接入流程，当前未启用，用户仍按原权限直接操作。" },
  enabled: { kind: "enabled", label: "已启用", tone: "green", configurable: true, detailText: "该动作已由流程接管，提交后需按设置完成处理。" },
  default_enabled: { kind: "default_enabled", label: "默认启用", tone: "green", configurable: true, detailText: "该动作默认需要流程处理，通常用于高风险或职责分离场景。" },
  disabled: { kind: "disabled", label: "已关闭", tone: "gray", configurable: true, detailText: "该动作已显式关闭流程，当前回到权限直写。" },
  config_error: { kind: "config_error", label: "配置异常", tone: "red", configurable: false, detailText: "当前策略指向不可配置或未完整接入的动作，需要管理员检查配置。" },
};

export function handlerSourceLabel(source: string) {
  return HANDLER_SOURCE_LABEL[source] ?? source;
}

export function workflowAccessMode(mode: WorkflowPolicyMode): WorkflowAccessMode {
  return mode === "required" || mode === "optional" ? "workflow" : "permission_only";
}

export function workflowModeFromAccess(accessMode: WorkflowAccessMode): WorkflowPolicyMode {
  return accessMode === "permission_only" ? "permission_only" : "required";
}

export function workflowSeparationMode(policy: WorkflowSeparationPolicy): WorkflowSeparationPolicy {
  return policy === "independent_required" ? "independent_required" : "auto_pass_if_authorized";
}

export function canConfigureWorkflowAction(action: WorkflowActionLabelSource) {
  const runtimeReady = (action.workflowReadiness.state === "ready" && action.workflowReadiness.executionPath === "approval_request")
    || (action.workflowReadiness.state === "native" && action.workflowReadiness.executionPath === "native_business_state");
  return runtimeReady && Boolean(action.actionContract?.workflow && action.actionContract.workflow.kind !== "not_applicable");
}

export function workflowActionStatus(action: WorkflowActionLabelSource, policies?: readonly WorkflowPolicyLabelSource[]): WorkflowActionStatusView {
  const policy = selectGlobalPolicy(policies ?? []);
  const configurable = canConfigureWorkflowAction(action);
  if (policy && !configurable) return ACTION_STATUS_VIEW.config_error;
  if (policy) {
    if (workflowAccessMode(policy.mode) === "workflow") return ACTION_STATUS_VIEW.enabled;
    return action.actionContract?.workflow?.whenDisabled === "unavailable"
      ? { ...ACTION_STATUS_VIEW.disabled, detailText: "该动作的流程已关闭，新的提交入口和 API 执行均不可用；历史流程单仍按原快照处理。" }
      : ACTION_STATUS_VIEW.disabled;
  }
  return decorateActionStatus(ACTION_STATUS_VIEW[action.workflowProductState] ?? ACTION_STATUS_VIEW.not_ready, action);
}

export function workflowActionRoutingLabel(input: {
  flowType?: WorkflowFlowType;
  handlerSource?: WorkflowHandlerSource | string;
  separationPolicy?: WorkflowSeparationPolicy;
}) {
  const base = baseRoutingLabel(input.flowType ?? "approval", input.handlerSource ?? "permission");
  const suffix = input.separationPolicy === "auto_pass_if_authorized" ? "自动/豁免" : null;
  return [base, suffix].filter(Boolean).join(" · ");
}

export function workflowActionRoutingTooltip(input: {
  flowType?: WorkflowFlowType;
  handlerSource?: WorkflowHandlerSource | string;
  separationPolicy?: WorkflowSeparationPolicy;
}) {
  if (input.separationPolicy === "auto_pass_if_authorized") return "满足权限条件时自动通过或跳过人工处理。";
  if ((input.flowType ?? "approval") === "review") return "由有复核职责或权限的人检查结果是否正确，不要求是直属上级。";
  if (input.handlerSource === "direct_manager") return "由发起人的直属上级判断该事项是否允许执行。";
  if (input.handlerSource === "department_owner") return "由部门负责人判断该事项是否允许执行。";
  return "由有处理权限者判断该事项是否允许执行。";
}

function selectGlobalPolicy(policies: readonly WorkflowPolicyLabelSource[]) {
  return policies.find((policy) => policy.scopeType === "global" && policy.scopeId === "") ?? policies[0] ?? null;
}

function baseRoutingLabel(flowType: WorkflowFlowType, handlerSource: WorkflowHandlerSource | string) {
  if (flowType === "review") return "复核";
  const approvalLabel = handlerSource === "direct_manager"
    ? "直属上级审批"
    : handlerSource === "department_owner"
      ? "部门负责人审批"
      : "有权限者审批";
  if (flowType === "publish") return `发布动作 · ${approvalLabel}`;
  return approvalLabel;
}

function decorateActionStatus(status: WorkflowActionStatusView, action: WorkflowActionLabelSource): WorkflowActionStatusView {
  if (action.workflowIntent.kind === "internal" || action.workflowReadiness.state === "internal") {
    return {
      ...status,
      detailText: "内部或系统维护动作不进入业务流程设置，仍按权限直接控制。",
    };
  }
  if (status.kind === "config_error" && !action.actionContract) {
    return {
      ...status,
      detailText: "该动作具备流程运行能力，但缺少 ActionContract，后台不能安全开放配置。",
    };
  }
  if (action.workflowReadiness.executionPath === "native_business_state") {
    return {
      ...status,
      detailText: "该动作使用业务原生复核状态，不生成 ApprovalRequest，也不进入通用流程台账。",
    };
  }
  if ((action.workflowReadiness.state === "not_ready" || action.workflowReadiness.state === "partial") && action.workflowReadiness.missing?.length) {
    return {
      ...status,
      detailText: `缺少：${action.workflowReadiness.missing.join("、")}。`,
    };
  }
  return status;
}
