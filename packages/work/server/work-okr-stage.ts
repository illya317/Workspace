import { prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { isBoundWorkOkrTimeControlEnabled } from "./domain/work-okr-bound-control";
import { validateWorkOkrStageCommand } from "./domain/work-okr-stage-validation";
import { canMaintainWorkItem, resolveWorkPlanMaintenance } from "./domain/work-plan-maintenance-policy";
import { resolveWorkOkrKrReviewOpensAt } from "./work-okr-control";

export const WORK_OKR_STAGES = [
  "objective_draft",
  "objective_submitted",
  "executing",
  "kr_open",
  "kr_submitted",
  "closed",
] as const;

export type WorkOkrStage = typeof WORK_OKR_STAGES[number];
export type WorkOkrAction = "create" | "update" | "delete";

const STAGE_SET = new Set<string>(WORK_OKR_STAGES);

type PlanStageRow = {
  id: number;
  targetType: string;
  targetId: number;
  kind: string;
  okrStage: string;
  okrCycleId: number | null;
  okrControlScopeType: string | null;
  okrControlScopeId: string | null;
  governanceSnapshotJson: string;
  periodType: string | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  krReviewOpensAt: Date | null;
  status: string;
  isArchived: boolean;
};

type WorkItemStageInput = {
  action: WorkOkrAction;
  planId?: number | null;
  itemType: string;
};

const planStageSelect = {
  id: true,
  targetType: true,
  targetId: true,
  kind: true,
  okrStage: true,
  okrCycleId: true,
  okrControlScopeType: true,
  okrControlScopeId: true,
  governanceSnapshotJson: true,
  periodType: true,
  actualStartDate: true,
  actualEndDate: true,
  plannedStartDate: true,
  plannedEndDate: true,
  krReviewOpensAt: true,
  status: true,
  isArchived: true,
} as const;

export function normalizeWorkOkrStage(value: unknown): WorkOkrStage {
  return typeof value === "string" && STAGE_SET.has(value) ? value as WorkOkrStage : "objective_draft";
}

export function workOkrStageLabel(stage: WorkOkrStage) {
  if (stage === "objective_draft") return "目标草稿";
  if (stage === "objective_submitted") return "目标待审";
  if (stage === "executing") return "执行中";
  if (stage === "kr_open") return "KR开放";
  if (stage === "kr_submitted") return "KR待核查";
  return "已关闭";
}

export function effectiveWorkOkrStage(plan: Pick<PlanStageRow, "okrStage" | "krReviewOpensAt" | "status" | "isArchived">, now = new Date()): WorkOkrStage {
  const stage = normalizeWorkOkrStage(plan.okrStage);
  if (plan.status === "done" || plan.isArchived || stage === "closed") return "closed";
  if (stage === "executing" && plan.krReviewOpensAt && plan.krReviewOpensAt <= now) return "kr_open";
  return stage;
}

async function syncPlanKrReviewState(plan: PlanStageRow, now: Date) {
  if (plan.okrStage !== "executing" && plan.okrStage !== "kr_open") return;
  const opensAt = await resolveWorkOkrKrReviewOpensAt(plan);
  if (!opensAt) return;
  const nextStage = opensAt <= now ? "kr_open" : "executing";
  if (plan.okrStage === nextStage && plan.krReviewOpensAt?.getTime() === opensAt.getTime()) return;
  await prisma.workPlan.update({
    where: { id: plan.id },
    data: { okrStage: nextStage, krReviewOpensAt: opensAt },
  });
}

export async function syncDueKrReviewsForTarget(input: {
  targetType: string;
  targetId: number;
  now?: Date;
}) {
  const command = validateWorkOkrStageCommand("syncDueKrReviewsForTarget");
  if (!command.ok) throw new Error(command.issue.message);
  const now = input.now ?? new Date();
  const plans = await prisma.workPlan.findMany({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      okrStage: { in: ["executing", "kr_open"] },
    },
    select: planStageSelect,
  });
  await Promise.all(plans.map((plan) => syncPlanKrReviewState(plan, now)));
}

export async function syncDueKrReviewForPlan(planId: number, now = new Date()) {
  const command = validateWorkOkrStageCommand("syncDueKrReviewForPlan");
  if (!command.ok) throw new Error(command.issue.message);
  const plan = await prisma.workPlan.findUnique({ where: { id: planId }, select: planStageSelect });
  if (plan) await syncPlanKrReviewState(plan, now);
}

export async function getWorkPlanStage(planId: number) {
  await syncDueKrReviewForPlan(planId);
  const plan = await prisma.workPlan.findUnique({
    where: { id: planId },
    select: planStageSelect,
  });
  if (!plan) return null;
  return {
    ...plan,
    okrStage: effectiveWorkOkrStage(plan),
  };
}

export async function assertWorkPlanHeaderStageAllowed(planId: number): Promise<DomainServiceResult<{ stage: WorkOkrStage }>> {
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  const maintenance = resolveWorkPlanMaintenance({
    kind: plan.kind,
    stage: plan.okrStage,
    status: plan.status,
    isArchived: plan.isArchived,
    timeControlEnabled: isBoundWorkOkrTimeControlEnabled(plan.governanceSnapshotJson),
  });
  if (!maintenance.plan) {
    return { ok: false, error: `当前阶段为「${workOkrStageLabel(plan.okrStage)}」，目标审查后计划头已锁定`, status: 409 };
  }
  return { ok: true, data: { stage: plan.okrStage } };
}

export async function assertWorkItemStageAllowed(input: WorkItemStageInput): Promise<DomainServiceResult<{ stage: WorkOkrStage }>> {
  if (!input.planId) return { ok: false, error: "必须选择 OKR 计划", status: 400 };
  const plan = await getWorkPlanStage(input.planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  const maintenance = resolveWorkPlanMaintenance({
    kind: plan.kind,
    stage: plan.okrStage,
    status: plan.status,
    isArchived: plan.isArchived,
    timeControlEnabled: isBoundWorkOkrTimeControlEnabled(plan.governanceSnapshotJson),
  });
  if (!canMaintainWorkItem(maintenance, input.itemType)) {
    return {
      ok: false,
      error: plan.isArchived || plan.status === "done" || plan.okrStage === "closed"
        ? "已关闭或归档的工作计划不能维护节点"
        : `当前阶段为「${workOkrStageLabel(plan.okrStage)}」，不能维护该类型节点`,
      status: 409,
    };
  }
  return { ok: true, data: { stage: plan.okrStage } };
}

export async function submitObjectiveReview(planId: number): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("submitObjectiveReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.okrStage !== "objective_draft") return { ok: false, error: "只有目标草稿阶段可以提交目标审查", status: 409 };
  await prisma.workPlan.update({
    where: { id: planId },
    data: { okrStage: "objective_submitted", objectiveSubmittedAt: new Date() },
  });
  return { ok: true, data: { okrStage: "objective_submitted" } };
}

export async function approveObjectiveReview(planId: number, actorUserId: number, approvalSnapshot?: unknown): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("approveObjectiveReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.okrStage !== "objective_submitted") return { ok: false, error: "只有目标待审阶段可以通过目标审查", status: 409 };
  const krReviewOpensAt = await resolveWorkOkrKrReviewOpensAt(plan);
  const snapshotJson = serializeApprovalSnapshot(approvalSnapshot);
  await prisma.workPlan.update({
    where: { id: planId },
    data: {
      okrStage: "executing",
      status: "active",
      objectiveApprovedAt: new Date(),
      objectiveApprovedByUserId: actorUserId,
      krReviewOpensAt,
      ...(snapshotJson === undefined ? {} : { objectiveApprovalSnapshotJson: snapshotJson }),
    },
  });
  await syncDueKrReviewForPlan(planId);
  return { ok: true, data: { okrStage: "executing" } };
}

export async function rejectObjectiveReview(planId: number): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("rejectObjectiveReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  await prisma.workPlan.update({
    where: { id: planId },
    data: { okrStage: "objective_draft", objectiveSubmittedAt: null },
  });
  return { ok: true, data: { okrStage: "objective_draft" } };
}

export async function submitKrReview(planId: number): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("submitKrReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.okrStage !== "kr_open") return { ok: false, error: "只有考核结果开放阶段可以提交考核结果", status: 409 };
  await prisma.workPlan.update({
    where: { id: planId },
    data: { okrStage: "kr_submitted", krSubmittedAt: new Date() },
  });
  return { ok: true, data: { okrStage: "kr_submitted" } };
}

export async function approveKrReview(planId: number, actorUserId: number, approvalSnapshot?: unknown): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("approveKrReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.okrStage !== "kr_submitted") return { ok: false, error: "只有 KR 待核查阶段可以通过核查", status: 409 };
  const snapshotJson = serializeApprovalSnapshot(approvalSnapshot);
  await prisma.workPlan.update({
    where: { id: planId },
    data: {
      okrStage: "closed",
      status: "done",
      krApprovedAt: new Date(),
      krApprovedByUserId: actorUserId,
      ...(snapshotJson === undefined ? {} : { krApprovalSnapshotJson: snapshotJson }),
    },
  });
  return { ok: true, data: { okrStage: "closed" } };
}

export async function rejectKrReview(planId: number): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("rejectKrReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  await prisma.workPlan.update({
    where: { id: planId },
    data: { okrStage: "kr_open", krSubmittedAt: null },
  });
  return { ok: true, data: { okrStage: "kr_open" } };
}

function serializeApprovalSnapshot(snapshot: unknown) {
  if (snapshot === undefined) return undefined;
  return JSON.stringify(snapshot ?? {});
}
