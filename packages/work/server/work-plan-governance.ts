import { getActionContractMetadata } from "@workspace/platform/action-contract-registry";
import { resolveBusinessActionRuntime } from "@workspace/platform/server/business-action-executor";
import { businessSpaceScopeId } from "@workspace/platform/server/business-space-permissions";
import type { ApprovalWorkflowPolicySnapshot } from "@workspace/platform/server/approvals";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  resolveWorkflowPolicy,
  type ResolvedWorkflowPolicy,
} from "@workspace/platform/server/workflows";
import type { ActionRuntimeRequestSnapshot } from "@workspace/platform/workflow-action-runtime";
import {
  getEffectiveWorkTaskActionPermissions,
  getWorkTaskPermissionResourceKey,
  normalizeWorkTargetType,
} from "./access";
import {
  getStoredWorkOkrControlPolicyForPlan,
} from "./work-okr-control";
import { getWorkOkrControlSettingsState } from "./work-okr-control-config";
import {
  approvalPayloadReferencesWorkPlan,
  validateWorkPlanGovernanceMigrationCommand,
} from "./domain/work-plan-governance-validation";
import { resolveWorkOkrGovernancePolicy } from "./domain/work-okr-governance-policy";
import {
  workOkrWorkflowBusinessActionKey,
  type WorkOkrWorkflowActionKind,
} from "./task-approval-helpers";
import {
  listWorkPlanActionRuntimeRequests,
  type WorkPlanActionRuntimeRequests,
} from "./work-plan-action-runtime-requests";
export { listWorkPlanActionRuntimeRequests } from "./work-plan-action-runtime-requests";

export type WorkPlanGovernanceMode = "workflow" | "direct" | "unavailable" | "legacy_inferred";
export type WorkPlanGovernanceBindingSource = "created" | "system_generated" | "explicit_migration" | "legacy_inferred";

type WorkPlanGovernanceActionBinding = {
  businessActionKey: string;
  actionContractVersion: number;
  workflowWhenDisabled: "direct_write" | "unavailable";
  policy: ApprovalWorkflowPolicySnapshot;
};

type WorkPlanGovernanceSnapshot = {
  version: 1;
  source: WorkPlanGovernanceBindingSource;
  boundAt: string;
  okrControl: {
    version: number;
    settings: Awaited<ReturnType<typeof getWorkOkrControlSettingsState>>["settings"];
    policy: ReturnType<typeof serializeControlPolicySnapshot>;
  };
  actions: Record<WorkOkrWorkflowActionKind, WorkPlanGovernanceActionBinding>;
};

export type WorkPlanGovernanceRow = {
  id: number;
  targetType: string;
  targetId: number;
  kind: string;
  status: string;
  isArchived: boolean;
  okrStage: string;
  objectiveApprovedAt: Date | null;
  krApprovedAt: Date | null;
  okrCycleId: number | null;
  okrControlScopeType: string | null;
  okrControlScopeId: string | null;
  governanceMode: string;
  governanceRevision: number;
  governanceActionKey: string | null;
  governanceWorkflowPolicyId: number | null;
  governanceWorkflowVersion: number | null;
  governanceActionContractVersion: number | null;
  governanceOkrControlVersion: number | null;
  governanceSnapshotJson: string;
  governanceBoundAt: Date | null;
  governanceBindingSource: string;
};

export type WorkPlanGovernanceFactsRow = WorkPlanGovernanceRow & {
  objectiveApprovedAt: Date | null;
  krApprovedAt: Date | null;
};

type WorkPlanGovernanceActor = {
  userId: number;
  canDirectWrite?: boolean;
  canStartWorkflow?: boolean;
  canProcessWorkflow?: boolean;
};

export const workPlanGovernanceSelect = {
  id: true,
  targetType: true,
  targetId: true,
  kind: true,
  status: true,
  isArchived: true,
  okrStage: true,
  objectiveApprovedAt: true,
  krApprovedAt: true,
  okrCycleId: true,
  okrControlScopeType: true,
  okrControlScopeId: true,
  governanceMode: true,
  governanceRevision: true,
  governanceActionKey: true,
  governanceWorkflowPolicyId: true,
  governanceWorkflowVersion: true,
  governanceActionContractVersion: true,
  governanceOkrControlVersion: true,
  governanceSnapshotJson: true,
  governanceBoundAt: true,
  governanceBindingSource: true,
} satisfies Prisma.WorkPlanSelect;

export async function buildWorkPlanGovernanceBinding(input: {
  targetType: string;
  targetId: number;
  okrCycleId?: number | null;
  okrControlScopeType?: string | null;
  okrControlScopeId?: string | null;
  actorUserId?: number | null;
  source: WorkPlanGovernanceBindingSource;
}) {
  const actionEntries = await Promise.all(WORK_PLAN_GOVERNANCE_ACTION_KINDS.map(async (kind) => {
    const businessActionKey = workOkrWorkflowBusinessActionKey({
      kind,
      workspaceTargetType: input.targetType,
    });
    const [policy, contract] = await Promise.all([
      resolveWorkflowPolicy({ businessActionKey, actorUserId: input.actorUserId }),
      Promise.resolve(getActionContractMetadata(businessActionKey)),
    ]);
    if (!contract || contract.workflow.kind !== "configurable") {
      throw new Error(`OKR 业务行为 ${businessActionKey} 缺少可配置 ActionContract`);
    }
    return [kind, {
      businessActionKey,
      actionContractVersion: contract.version,
      workflowWhenDisabled: contract.workflow.whenDisabled,
      policy: resolvedPolicySnapshot(policy),
    }] as const;
  }));
  const [controlState, controlPolicy] = await Promise.all([
    getWorkOkrControlSettingsState(),
    getStoredWorkOkrControlPolicyForPlan(input),
  ]);
  const actions = Object.fromEntries(actionEntries) as WorkPlanGovernanceSnapshot["actions"];
  const boundAt = new Date();
  const snapshot: WorkPlanGovernanceSnapshot = {
    version: 1,
    source: input.source,
    boundAt: boundAt.toISOString(),
    okrControl: {
      version: controlState.version,
      settings: controlState.settings,
      policy: serializeControlPolicySnapshot(controlPolicy),
    },
    actions,
  };
  const objective = actions.objective_submit;
  return {
    governanceMode: actionMode(objective),
    governanceActionKey: objective.businessActionKey,
    governanceWorkflowPolicyId: objective.policy.policyId,
    governanceWorkflowVersion: objective.policy.policyVersion,
    governanceActionContractVersion: objective.actionContractVersion,
    governanceOkrControlVersion: controlState.version,
    governanceSnapshotJson: JSON.stringify(snapshot),
    governanceBoundAt: boundAt,
    governanceBoundByUserId: input.actorUserId ?? null,
    governanceBindingSource: input.source,
  };
}

export async function resolveWorkPlanGovernanceAction(
  plan: WorkPlanGovernanceRow,
  kind: WorkOkrWorkflowActionKind,
): Promise<WorkPlanGovernanceActionBinding> {
  const parsed = parseWorkPlanGovernanceSnapshot(plan.governanceSnapshotJson);
  const stored = parsed?.actions?.[kind];
  if (!stored) throw new Error(`OKR 计划 ${plan.id} 缺少 ${kind} 治理快照，不能按当前全局设置推断`);
  return normalizeStoredActionBinding(stored, plan, kind);
}

export async function resolveWorkPlanActionRuntime(input: {
  plan: WorkPlanGovernanceRow;
  kind: WorkOkrWorkflowActionKind;
  actor: WorkPlanGovernanceActor;
  request?: ActionRuntimeRequestSnapshot | null;
}) {
  const businessActionKey = workOkrWorkflowBusinessActionKey({
    kind: input.kind,
    workspaceTargetType: input.plan.targetType,
  });
  return resolveBusinessActionRuntime({
    businessActionKey,
    actor: input.actor,
    request: input.request,
    resourceKey: getWorkTaskPermissionResourceKey(input.plan.targetType),
    scopeType: input.plan.targetType,
    scopeId: businessSpaceScopeId(normalizeWorkTargetType(input.plan.targetType), input.plan.targetId),
  });
}

export async function resolveWorkPlanOkrGovernance(input: {
  plan: WorkPlanGovernanceFactsRow;
  actor: WorkPlanGovernanceActor;
  requests?: WorkPlanActionRuntimeRequests;
}) {
  const requests = input.requests ?? {};
  const [objectiveSubmit, objectiveRevise, reportSubmit, reportCorrect] = await Promise.all([
    resolveWorkPlanActionRuntime({ plan: input.plan, kind: "objective_submit", actor: input.actor, request: requests.objective_submit }),
    resolveWorkPlanActionRuntime({ plan: input.plan, kind: "objective_revise", actor: input.actor, request: requests.objective_revise }),
    resolveWorkPlanActionRuntime({ plan: input.plan, kind: "report_submit", actor: input.actor, request: requests.report_submit }),
    resolveWorkPlanActionRuntime({ plan: input.plan, kind: "report_correct", actor: input.actor, request: requests.report_correct }),
  ]);
  const governance = resolveWorkOkrGovernancePolicy({
    canUpdate: input.actor.canDirectWrite === true,
    isArchived: input.plan.isArchived,
    lifecycleStatus: input.plan.status,
    targetConfirmed: input.plan.objectiveApprovedAt !== null,
    resultConfirmed: input.plan.krApprovedAt !== null,
    actionRuntimes: {
      objectiveSubmit,
      objectiveRevise,
      reportSubmit,
      reportCorrect,
    },
  });
  return {
    governance,
    actionRuntimes: {
      objectiveSubmit,
      objectiveRevise,
      reportSubmit,
      reportCorrect,
      planRevision: objectiveRevise,
    },
  };
}

export async function getWorkPlanOkrGovernance(input: {
  planId: number;
  actorUserId: number;
}) {
  const plan = await prisma.workPlan.findUnique({
    where: { id: input.planId },
    select: workPlanGovernanceSelect,
  });
  if (!plan || plan.kind !== "okr") return null;
  const [permissions, requestsByPlanId] = await Promise.all([
    getEffectiveWorkTaskActionPermissions(input.actorUserId, plan.targetType, plan.targetId),
    listWorkPlanActionRuntimeRequests([plan]),
  ]);
  const actor: WorkPlanGovernanceActor = {
    userId: input.actorUserId,
    canDirectWrite: permissions.canUpdate,
    canStartWorkflow: permissions.canSubmit,
    canProcessWorkflow: permissions.canApprove,
  };
  return {
    plan,
    permissions,
    ...(await resolveWorkPlanOkrGovernance({
      plan,
      actor,
      requests: requestsByPlanId.get(plan.id),
    })),
  };
}

export async function workPlanPreparedWorkflowBinding(
  plan: WorkPlanGovernanceRow,
  kind: WorkOkrWorkflowActionKind,
) {
  const businessActionKey = workOkrWorkflowBusinessActionKey({
    kind,
    workspaceTargetType: plan.targetType,
  });
  const [policy, contract, controlState] = await Promise.all([
    resolveWorkflowPolicy({
      businessActionKey,
      resourceKey: getWorkTaskPermissionResourceKey(plan.targetType),
      scopeType: plan.targetType,
      scopeId: businessSpaceScopeId(normalizeWorkTargetType(plan.targetType), plan.targetId),
    }),
    Promise.resolve(getActionContractMetadata(businessActionKey)),
    getWorkOkrControlSettingsState(),
  ]);
  if (!contract || contract.workflow.kind !== "configurable") {
    throw new Error(`OKR 业务行为 ${businessActionKey} 缺少可配置 ActionContract`);
  }
  return {
    businessActionKey,
    workflowPolicySnapshot: resolvedPolicySnapshot(policy),
    sourceActionContractVersion: contract.version,
    sourceOkrControlVersion: controlState.version,
  };
}

export function parseWorkPlanGovernanceSnapshot(value: string | null | undefined): WorkPlanGovernanceSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as WorkPlanGovernanceSnapshot;
    return parsed && parsed.version === 1 && parsed.actions ? parsed : null;
  } catch {
    return null;
  }
}

export async function listWorkPlanGovernanceSummary() {
  const [groups, inFlightRequests] = await Promise.all([
    prisma.workPlan.groupBy({
      by: ["governanceMode", "governanceBindingSource"],
      where: { kind: "okr", isArchived: false },
      _count: { _all: true },
      orderBy: [{ governanceMode: "asc" }, { governanceBindingSource: "asc" }],
    }),
    prisma.approvalRequest.count({
      where: {
        subjectType: "work.task",
        status: { in: ["draft", "submitted", "committing", "withdrawn", "rejected"] },
        businessActionKey: { startsWith: "work.tasks.goal." },
      },
    }),
  ]);
  return {
    groups: groups.map((group) => ({
      mode: group.governanceMode,
      source: group.governanceBindingSource,
      count: group._count._all,
    })),
    inFlightRequests,
  };
}

export async function migrateWorkPlanGovernance(input: {
  planIds: unknown;
  actorUserId?: number | null;
  reason: unknown;
}) {
  const command = validateWorkPlanGovernanceMigrationCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const { planIds, actorUserId, reason } = command.data;
  const plans = await prisma.workPlan.findMany({ where: { id: { in: planIds } }, select: workPlanGovernanceSelect });
  if (plans.length !== planIds.length) return serviceError("部分 OKR 计划不存在", 404);
  const invalid = plans.find((plan) => plan.kind !== "okr" || plan.isArchived || plan.status === "done" || plan.okrStage === "closed");
  if (invalid) return serviceError(`计划「${invalid.id}」已完成、关闭或归档，不能迁移治理规则`, 409);
  const inFlight = await findInFlightPlanGovernanceRequest(planIds);
  if (inFlight) return serviceError(`计划「${inFlight.planId}」存在未结束流程（审批单 ${inFlight.requestId}），请先处理后再迁移`, 409);

  const bindings = await Promise.all(plans.map(async (plan) => ({
    plan,
    binding: await buildWorkPlanGovernanceBinding({
      targetType: plan.targetType,
      targetId: plan.targetId,
      okrCycleId: plan.okrCycleId,
      okrControlScopeType: plan.okrControlScopeType,
      okrControlScopeId: plan.okrControlScopeId,
      actorUserId,
      source: "explicit_migration",
    }),
  })));

  await prisma.$transaction(async (tx) => {
    for (const { plan, binding } of bindings) {
      const updated = await tx.workPlan.updateMany({
        where: { id: plan.id, governanceRevision: plan.governanceRevision },
        data: { ...binding, governanceRevision: { increment: 1 } },
      });
      if (updated.count !== 1) throw new Error(`计划 ${plan.id} 的治理规则已被其他人更新`);
      await tx.workPlanGovernanceEvent.create({
        data: {
          workPlanId: plan.id,
          fromMode: plan.governanceMode,
          toMode: binding.governanceMode,
          fromSnapshotJson: plan.governanceSnapshotJson,
          toSnapshotJson: binding.governanceSnapshotJson,
          reason,
          actorUserId,
        },
      });
    }
  });
  return serviceOk({ migratedPlanIds: planIds });
}

const WORK_PLAN_GOVERNANCE_ACTION_KINDS: WorkOkrWorkflowActionKind[] = [
  "objective_submit",
  "objective_revise",
  "report_submit",
  "report_correct",
];

function actionMode(binding: WorkPlanGovernanceActionBinding): WorkPlanGovernanceMode {
  if (binding.policy.mode === "optional" || binding.policy.mode === "required") return "workflow";
  return binding.workflowWhenDisabled === "direct_write" ? "direct" : "unavailable";
}

function resolvedPolicySnapshot(policy: ResolvedWorkflowPolicy): ApprovalWorkflowPolicySnapshot {
  return {
    businessActionKey: policy.businessActionKey,
    scopeType: policy.scopeType,
    scopeId: policy.scopeId,
    mode: policy.mode,
    flowType: policy.flowType,
    separationPolicy: policy.separationPolicy,
    handlerSource: policy.handlerSource,
    workflowNodes: policy.workflowNodes,
    handlerCanRevise: policy.handlerCanRevise,
    requestCanWithdraw: policy.requestCanWithdraw,
    requestCanResubmit: policy.requestCanResubmit,
    requestCanCancel: policy.requestCanCancel,
    requestCanRevise: policy.requestCanRevise,
    policyId: policy.policyId,
    policyVersion: policy.version,
  };
}

function normalizeStoredActionBinding(
  stored: WorkPlanGovernanceActionBinding | Record<string, unknown>,
  plan: WorkPlanGovernanceRow,
  kind: WorkOkrWorkflowActionKind,
): WorkPlanGovernanceActionBinding {
  const expectedBusinessActionKey = workOkrWorkflowBusinessActionKey({ kind, workspaceTargetType: plan.targetType });
  const businessActionKey = typeof stored.businessActionKey === "string" ? stored.businessActionKey : "";
  if (businessActionKey !== expectedBusinessActionKey) {
    throw new Error(`OKR 计划 ${plan.id} 的 ${kind} 治理动作与工作空间不匹配`);
  }
  const contract = getActionContractMetadata(businessActionKey);
  if (!contract || contract.workflow.kind !== "configurable") {
    throw new Error(`OKR 业务行为 ${businessActionKey} 缺少可配置 ActionContract`);
  }
  const storedPolicy = "policy" in stored && stored.policy && typeof stored.policy === "object"
    ? stored.policy as ApprovalWorkflowPolicySnapshot
    : null;
  const actionContractVersion = positiveInteger(stored.actionContractVersion);
  if (!actionContractVersion || storedPolicy?.businessActionKey !== businessActionKey || !Array.isArray(storedPolicy.workflowNodes)) {
    throw new Error(`OKR 计划 ${plan.id} 的 ${kind} 治理快照不完整，不能按当前全局设置补齐`);
  }
  if (stored.workflowWhenDisabled !== "direct_write" && stored.workflowWhenDisabled !== "unavailable") {
    throw new Error(`OKR 计划 ${plan.id} 的 ${kind} 关闭流程行为缺失`);
  }
  return {
    businessActionKey,
    actionContractVersion,
    workflowWhenDisabled: stored.workflowWhenDisabled,
    policy: storedPolicy,
  };
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function serializeControlPolicySnapshot(policy: Awaited<ReturnType<typeof getStoredWorkOkrControlPolicyForPlan>>) {
  if (!policy) return null;
  return {
    id: policy.id,
    cycleId: policy.cycleId,
    scopeType: policy.scopeType,
    scopeId: policy.scopeId,
    isLocked: policy.isLocked,
    objectiveSubmitDeadline: policy.objectiveSubmitDeadline?.toISOString() ?? null,
    krReviewOpensAt: policy.krReviewOpensAt?.toISOString() ?? null,
    krSubmitDeadline: policy.krSubmitDeadline?.toISOString() ?? null,
    version: policy.version,
  };
}

async function findInFlightPlanGovernanceRequest(planIds: number[]) {
  const requests = await prisma.approvalRequest.findMany({
    where: {
      subjectType: "work.task",
      status: { in: ["draft", "submitted", "committing", "withdrawn", "rejected"] },
      businessActionKey: { startsWith: "work.tasks.goal." },
      OR: planIds.flatMap((planId) => [
        { subjectId: String(planId) },
        { subjectId: `revision:plan:${planId}` },
        { latestPayloadJson: { contains: `"workPlanId":${planId}` } },
        { latestPayloadJson: { contains: `\"planId\":${planId}` } },
      ]),
    },
    select: { id: true, subjectId: true, latestPayloadJson: true },
    orderBy: { id: "asc" },
  });
  for (const request of requests) {
    const planId = planIds.find((id) => request.subjectId === String(id)
      || request.subjectId === `revision:plan:${id}`
      || approvalPayloadReferencesWorkPlan(request.latestPayloadJson, id));
    if (planId) return { planId, requestId: request.id };
  }
  return null;
}
