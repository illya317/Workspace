import { prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { validateWorkOkrStageCommand } from "./domain/work-okr-stage-validation";
import { canMaintainWorkItem, resolveWorkPlanMaintenance, workItemMutationFacets } from "./domain/work-plan-maintenance-policy";
import { workOkrFacetMutationIssue } from "./domain/work-okr-governance-policy";
import { getWorkPlanOkrGovernance } from "./work-plan-governance";

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
  objectiveApprovedAt: Date | null;
  krApprovedAt: Date | null;
};

type WorkItemStageInput = {
  action: WorkOkrAction;
  planId?: number | null;
  itemType: string;
  actorUserId?: number | null;
  changesKrCurrentValue?: boolean;
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
  objectiveApprovedAt: true,
  krApprovedAt: true,
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

export function effectiveWorkOkrStage(plan: Pick<PlanStageRow, "okrStage">): WorkOkrStage {
  return normalizeWorkOkrStage(plan.okrStage);
}

export async function getWorkPlanStage(planId: number) {
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

export async function assertWorkPlanHeaderStageAllowed(
  planId: number,
  actorUserId?: number | null,
): Promise<DomainServiceResult<{ stage: WorkOkrStage }>> {
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (actorUserId) {
    const runtime = await getWorkPlanOkrGovernance({ planId, actorUserId });
    if (runtime) {
      const issue = workOkrFacetMutationIssue(runtime.governance.facets.target, "目标定义");
      if (issue) return { ok: false, error: issue.message, status: issue.status };
      return { ok: true, data: { stage: plan.okrStage } };
    }
  }
  const maintenance = resolveWorkPlanMaintenance({
    kind: plan.kind,
    stage: plan.okrStage,
    status: plan.status,
    isArchived: plan.isArchived,
  });
  if (!maintenance.plan) {
    return {
      ok: false,
      error: plan.isArchived ? "已归档的工作计划不能维护计划信息" : "该计划不支持维护计划信息",
      status: 409,
    };
  }
  return { ok: true, data: { stage: plan.okrStage } };
}

export async function assertWorkItemStageAllowed(input: WorkItemStageInput): Promise<DomainServiceResult<{ stage: WorkOkrStage }>> {
  if (!input.planId) return { ok: false, error: "必须选择 OKR 计划", status: 400 };
  const plan = await getWorkPlanStage(input.planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (input.actorUserId) {
    const runtime = await getWorkPlanOkrGovernance({ planId: input.planId, actorUserId: input.actorUserId });
    const facets = runtime?.governance.facets;
    if (runtime && facets) {
      const requiredFacets = workItemMutationFacets(input.itemType, input);
      if (requiredFacets.length === 0) {
        return { ok: false, error: "该计划不支持维护此类节点", status: 409 };
      }
      for (const facet of requiredFacets) {
        const issue = workOkrFacetMutationIssue(
          facets[facet],
          facet === "target" ? "目标定义" : facet === "result" ? "结果事实" : "执行事实",
        );
        if (issue) return { ok: false, error: issue.message, status: issue.status };
      }
      return { ok: true, data: { stage: plan.okrStage } };
    }
  }
  const maintenance = resolveWorkPlanMaintenance({
    kind: plan.kind,
    stage: plan.okrStage,
    status: plan.status,
    isArchived: plan.isArchived,
  });
  if (!canMaintainWorkItem(maintenance, input.itemType)) {
    return {
      ok: false,
      error: plan.isArchived
        ? "已归档的工作计划不能维护节点"
        : "该计划不支持维护此类节点",
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
  if (plan.isArchived) return { ok: false, error: "已归档计划不能提交目标", status: 409 };
  await prisma.workPlan.update({
    where: { id: planId },
    data: { objectiveSubmittedAt: new Date() },
  });
  return { ok: true, data: { okrStage: plan.okrStage } };
}

export async function approveObjectiveReview(planId: number, actorUserId: number, approvalSnapshot?: unknown): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("approveObjectiveReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.isArchived) return { ok: false, error: "已归档计划不能确认目标", status: 409 };
  const snapshotJson = serializeApprovalSnapshot(approvalSnapshot);
  await prisma.workPlan.update({
    where: { id: planId },
    data: {
      objectiveApprovedAt: new Date(),
      objectiveApprovedByUserId: actorUserId,
      objectiveSubmittedAt: null,
      ...(snapshotJson === undefined ? {} : { objectiveApprovalSnapshotJson: snapshotJson }),
    },
  });
  return { ok: true, data: { okrStage: plan.okrStage } };
}

export async function recordDirectObjectiveConfirmation(
  planId: number,
  actorUserId: number,
  approvalSnapshot?: unknown,
): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("recordDirectObjectiveConfirmation");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.isArchived) return { ok: false, error: "已归档计划不能确认目标", status: 409 };
  const snapshotJson = serializeApprovalSnapshot(approvalSnapshot);
  await prisma.workPlan.update({
    where: { id: planId },
    data: {
      objectiveApprovedAt: new Date(),
      objectiveApprovedByUserId: actorUserId,
      objectiveSubmittedAt: null,
      ...(snapshotJson === undefined ? {} : { objectiveApprovalSnapshotJson: snapshotJson }),
    },
  });
  return { ok: true, data: { okrStage: plan.okrStage } };
}

export async function rejectObjectiveReview(planId: number): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("rejectObjectiveReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  await prisma.workPlan.update({
    where: { id: planId },
    data: { objectiveSubmittedAt: null },
  });
  return { ok: true, data: { okrStage: plan.okrStage } };
}

export async function submitKrReview(planId: number): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("submitKrReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.isArchived) return { ok: false, error: "已归档计划不能提交结果", status: 409 };
  await prisma.workPlan.update({
    where: { id: planId },
    data: { krSubmittedAt: new Date() },
  });
  return { ok: true, data: { okrStage: plan.okrStage } };
}

export async function approveKrReview(planId: number, actorUserId: number, approvalSnapshot?: unknown): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("approveKrReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.isArchived) return { ok: false, error: "已归档计划不能确认结果", status: 409 };
  const snapshotJson = serializeApprovalSnapshot(approvalSnapshot);
  await prisma.workPlan.update({
    where: { id: planId },
    data: {
      krApprovedAt: new Date(),
      krApprovedByUserId: actorUserId,
      krSubmittedAt: null,
      ...(snapshotJson === undefined ? {} : { krApprovalSnapshotJson: snapshotJson }),
    },
  });
  return { ok: true, data: { okrStage: plan.okrStage } };
}

export async function recordDirectKrConfirmation(
  planId: number,
  actorUserId: number,
  approvalSnapshot?: unknown,
): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("recordDirectKrConfirmation");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  if (plan.isArchived) return { ok: false, error: "已归档计划不能确认结果", status: 409 };
  const snapshotJson = serializeApprovalSnapshot(approvalSnapshot);
  await prisma.workPlan.update({
    where: { id: planId },
    data: {
      krApprovedAt: new Date(),
      krApprovedByUserId: actorUserId,
      krSubmittedAt: null,
      ...(snapshotJson === undefined ? {} : { krApprovalSnapshotJson: snapshotJson }),
    },
  });
  return { ok: true, data: { okrStage: plan.okrStage } };
}

export async function rejectKrReview(planId: number): Promise<DomainServiceResult<{ okrStage: WorkOkrStage }>> {
  const command = validateWorkOkrStageCommand("rejectKrReview");
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const plan = await getWorkPlanStage(planId);
  if (!plan) return { ok: false, error: "OKR 计划不存在", status: 404 };
  await prisma.workPlan.update({
    where: { id: planId },
    data: { krSubmittedAt: null },
  });
  return { ok: true, data: { okrStage: plan.okrStage } };
}

function serializeApprovalSnapshot(snapshot: unknown) {
  if (snapshot === undefined) return undefined;
  return JSON.stringify(snapshot ?? {});
}
