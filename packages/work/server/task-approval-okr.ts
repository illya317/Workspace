import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  approveKrReview,
  approveObjectiveReview,
  getWorkPlanStage,
  submitKrReview,
  submitObjectiveReview,
} from "./work-okr-stage";
import {
  getWorkTaskApprovalResourceKey,
  normalizeApprovalWorkspaceTargetType,
  type WorkTaskKrReviewApprovalPayload,
  type WorkTaskObjectivePlanApprovalPayload,
} from "./task-approval-helpers";
import { workTaskScopeId } from "./task-spaces";
import {
  assertWorkOkrSubmissionAllowed,
  resolveWorkOkrControlScopeForPlan,
  type WorkOkrControlScope,
} from "./work-okr-control";
import {
  workPlanGovernanceSelect,
  workPlanPreparedWorkflowBinding,
} from "./work-plan-governance";

export async function commitObjectivePlanApproval(actorUserId: number, payload: WorkTaskObjectivePlanApprovalPayload) {
  if (payload.data.packageOnly) return serviceOk({ entityType: "work.package", entityId: String(payload.data.packageKey || payload.planId) });
  const stage = await getWorkPlanStage(payload.planId);
  if (stage?.okrStage === "objective_draft") {
    const submitted = await submitObjectiveReview(payload.planId);
    if (!submitted.ok) return serviceError(submitted.error, submitted.status || 400);
  }
  const result = await approveObjectiveReview(payload.planId, actorUserId, payload.data.approvalSnapshot);
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return serviceOk({ entityType: "work.plan", entityId: String(payload.planId) });
}

export async function commitKrReviewApproval(actorUserId: number, payload: WorkTaskKrReviewApprovalPayload) {
  if (payload.data.packageOnly) return serviceOk({ entityType: "work.package", entityId: String(payload.data.packageKey || payload.planId) });
  const stage = await getWorkPlanStage(payload.planId);
  if (stage?.okrStage === "kr_open") {
    const submitted = await submitKrReview(payload.planId);
    if (!submitted.ok) return serviceError(submitted.error, submitted.status || 400);
  }
  const result = await approveKrReview(payload.planId, actorUserId, payload.data.approvalSnapshot);
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return serviceOk({ entityType: "work.plan", entityId: String(payload.planId) });
}

export async function validateObjectivePlanApprovalPayload(
  payload: WorkTaskObjectivePlanApprovalPayload,
  subjectId: string | null | undefined,
) {
  const planId = payload.planId ?? Number(subjectId);
  if (!Number.isInteger(planId) || planId <= 0) return serviceError("OKR 计划 ID 无效", 400);
  const existing = await prisma.workPlan.findUnique({
    where: { id: planId },
    select: okrPlanApprovalSelect,
  });
  if (!existing?.targetId) return serviceError("OKR 计划不存在", 404);
  const workspaceTargetType = normalizeApprovalWorkspaceTargetType(existing.targetType);
  if (!workspaceTargetType) return serviceError("OKR 计划工作空间无效", 400);
  const controlScope = await resolveWorkOkrControlScopeForPlan(existing, { requirePersonalDepartment: true });
  if (!controlScope.ok) return serviceError(controlScope.error, controlScope.status || 400);
  const approvalTarget = approvalTargetFromControlScope(controlScope.data);
  if (!approvalTarget) return serviceError("OKR 审批管控空间无效", 400);
  const unlocked = await assertWorkOkrSubmissionAllowed(existing, "objective_plan");
  if (!unlocked.ok) return serviceError(unlocked.error, unlocked.status || 400);
  if (existing.kind === "okr") {
    const stage = await getWorkPlanStage(planId);
    if (stage?.okrStage !== "objective_draft") return serviceError("只有目标草稿阶段可以提交目标审查", 409);
  }
  const snapshot = await buildPlanApprovalSnapshot(existing, controlScope.data, "objective_plan");
  const packageKey = workPackageKey(existing);
  const workflowBinding = await workPlanPreparedWorkflowBinding(existing, "objective_submit");
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey(approvalTarget.targetType),
    scopeId: workTaskScopeId(approvalTarget.targetType, approvalTarget.targetId),
    subjectId: packageKey,
    ...workflowBinding,
    workflowScopeType: approvalTarget.targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "objective_plan" as const,
      targetType: workspaceTargetType,
      targetId: existing.targetId,
      controlScopeType: approvalTarget.targetType,
      controlScopeId: approvalTarget.targetId,
      planId,
      data: {
        title: String(payload.data.title || existing.title || "目标审查"),
        approvalSnapshot: snapshot,
        packageOnly: existing.kind !== "okr",
        packageKey,
      },
    },
  });
}

export async function validateKrReviewApprovalPayload(
  payload: WorkTaskKrReviewApprovalPayload,
  subjectId: string | null | undefined,
) {
  const planId = payload.planId ?? Number(subjectId);
  if (!Number.isInteger(planId) || planId <= 0) return serviceError("OKR 计划 ID 无效", 400);
  const existing = await prisma.workPlan.findUnique({
    where: { id: planId },
    select: okrPlanApprovalSelect,
  });
  if (!existing?.targetId) return serviceError("OKR 计划不存在", 404);
  const workspaceTargetType = normalizeApprovalWorkspaceTargetType(existing.targetType);
  if (!workspaceTargetType) return serviceError("OKR 计划工作空间无效", 400);
  const controlScope = await resolveWorkOkrControlScopeForPlan(existing, { requirePersonalDepartment: true });
  if (!controlScope.ok) return serviceError(controlScope.error, controlScope.status || 400);
  const approvalTarget = approvalTargetFromControlScope(controlScope.data);
  if (!approvalTarget) return serviceError("OKR 审批管控空间无效", 400);
  const unlocked = await assertWorkOkrSubmissionAllowed(existing, "kr_review");
  if (!unlocked.ok) return serviceError(unlocked.error, unlocked.status || 400);
  if (existing.kind === "okr") {
    const stage = await getWorkPlanStage(planId);
    if (stage?.okrStage !== "kr_open") return serviceError("只有考核结果开放阶段可以提交考核结果", 409);
  }
  const snapshot = await buildPlanApprovalSnapshot(existing, controlScope.data, "kr_review");
  const packageKey = workPackageKey(existing);
  const workflowBinding = await workPlanPreparedWorkflowBinding(existing, "report_submit");
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey(approvalTarget.targetType),
    scopeId: workTaskScopeId(approvalTarget.targetType, approvalTarget.targetId),
    subjectId: packageKey,
    ...workflowBinding,
    workflowScopeType: approvalTarget.targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "kr_review" as const,
      targetType: workspaceTargetType,
      targetId: existing.targetId,
      controlScopeType: approvalTarget.targetType,
      controlScopeId: approvalTarget.targetId,
      planId,
      data: {
        title: String(payload.data.title || existing.title || "考核结果"),
        summary: payload.data.summary,
        approvalSnapshot: snapshot,
        packageOnly: existing.kind !== "okr",
        packageKey,
      },
    },
  });
}

const okrPlanApprovalSelect = {
  ...workPlanGovernanceSelect,
  title: true,
  description: true,
  ownerEmployeeId: true,
  periodType: true,
  plannedStartDate: true,
  plannedEndDate: true,
  actualStartDate: true,
  actualEndDate: true,
  krReviewOpensAt: true,
  okrCycle: {
    select: {
      id: true,
      code: true,
      label: true,
      periodType: true,
      startDate: true,
      endDate: true,
      parentId: true,
    },
  },
  items: {
    where: { isArchived: false },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      itemType: true,
      content: true,
      description: true,
      status: true,
      krStartValue: true,
      krTargetValue: true,
      krCurrentValue: true,
      krUnit: true,
      parentWorkItemId: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.WorkPlanSelect;

type OkrPlanApprovalSnapshotRow = Prisma.WorkPlanGetPayload<{ select: typeof okrPlanApprovalSelect }>;

function approvalTargetFromControlScope(scope: WorkOkrControlScope) {
  return scope.targetType && scope.targetId ? { targetType: scope.targetType, targetId: scope.targetId } : null;
}

async function buildPlanApprovalSnapshot(
  plan: OkrPlanApprovalSnapshotRow,
  controlScope: WorkOkrControlScope,
  kind: "objective_plan" | "kr_review",
) {
  const packagePlans = await prisma.workPlan.findMany({
    where: {
      targetType: plan.targetType,
      targetId: plan.targetId,
      periodType: plan.okrCycle?.periodType ?? plan.periodType,
      ...(plan.okrCycleId
        ? { okrCycleId: plan.okrCycleId }
        : { plannedStartDate: plan.plannedStartDate, plannedEndDate: plan.plannedEndDate }),
      isArchived: false,
    },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    select: okrPlanApprovalSelect,
  });
  return {
    kind,
    capturedAt: new Date().toISOString(),
    plan: {
      id: plan.id,
      kind: plan.kind,
      title: plan.title,
      description: plan.description,
      status: plan.status,
      okrStage: plan.okrStage,
      targetType: plan.targetType,
      targetId: plan.targetId,
      controlScopeType: controlScope.type,
      controlScopeId: controlScope.id,
      okrCycleId: plan.okrCycleId,
      periodType: plan.okrCycle?.periodType ?? plan.periodType,
      plannedStartDate: isoDate(plan.plannedStartDate ?? plan.okrCycle?.startDate),
      plannedEndDate: isoDate(plan.plannedEndDate ?? plan.okrCycle?.endDate),
      actualStartDate: isoDate(plan.actualStartDate),
      actualEndDate: isoDate(plan.actualEndDate),
      krReviewOpensAt: isoDate(plan.krReviewOpensAt),
    },
    package: {
      key: workPackageKey(plan),
      plans: packagePlans.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        description: item.description,
        status: item.status,
        okrStage: item.okrStage,
        ownerEmployeeId: item.ownerEmployeeId,
        itemCounts: {
          objective: item.items.filter((work) => work.itemType === "objective").length,
          keyResult: item.items.filter((work) => work.itemType === "key_result").length,
          task: item.items.filter((work) => work.itemType === "task").length,
        },
        items: item.items.map(snapshotItem),
      })),
    },
    cycle: plan.okrCycle ? {
      id: plan.okrCycle.id,
      code: plan.okrCycle.code,
      label: plan.okrCycle.label,
      periodType: plan.okrCycle.periodType,
      startDate: isoDate(plan.okrCycle.startDate),
      endDate: isoDate(plan.okrCycle.endDate),
      parentId: plan.okrCycle.parentId,
    } : null,
    items: plan.items.map(snapshotItem),
  };
}

function snapshotItem(item: OkrPlanApprovalSnapshotRow["items"][number]) {
  return {
    id: item.id,
    itemType: item.itemType,
    content: item.content,
    description: item.description,
    status: item.status,
    parentWorkItemId: item.parentWorkItemId,
    sortOrder: item.sortOrder,
    krStartValue: item.krStartValue,
    krTargetValue: item.krTargetValue,
    krCurrentValue: item.krCurrentValue,
    krUnit: item.krUnit,
  };
}

function workPackageKey(plan: Pick<OkrPlanApprovalSnapshotRow, "targetType" | "targetId" | "periodType" | "plannedStartDate" | "plannedEndDate" | "okrCycle">) {
  const periodType = plan.okrCycle?.periodType ?? plan.periodType ?? "";
  const cycleStartDate = isoDate(plan.okrCycle?.startDate ?? plan.plannedStartDate)?.slice(0, 10) ?? "";
  const cycleEndDate = isoDate(plan.okrCycle?.endDate ?? plan.plannedEndDate)?.slice(0, 10) ?? "";
  return `${plan.targetType}:${plan.targetId}:${periodType}:${cycleStartDate}:${cycleEndDate}`;
}

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}
