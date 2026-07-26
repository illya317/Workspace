import { prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { validateWorkKpiResultCommitCommand } from "./domain/work-kpi-result-validation";
import { canUpdateWorkTaskAction, canViewWorkTaskTarget } from "./access";
import { calculateWorkKpiScore, parseWorkKpiScoringRuleJson } from "./work-kpi-scoring";
import { decimalNumber, parseJsonObject, workKpiAssignmentInclude } from "./work-kpi-dto";
import type { WorkKpiDirection, WorkKpiResultAdjustmentInput, WorkKpiScoringRule } from "./work-kpi-types";
import { getWorkPlanOkrGovernance } from "./work-plan-governance";

export async function prepareKpiResultSubmission(input: {
  actorUserId: number;
  planId: number;
}): Promise<ServiceResult<{
  results: WorkKpiResultPreview[];
  weightedScore: number;
  workReport: { id: number; periodType: string; periodStart: string; periodEnd: string; submittedAt: string | null } | null;
}>> {
  const plan = await prisma.workPlan.findUnique({ where: { id: input.planId }, select: { targetType: true, targetId: true, okrStage: true, status: true, isArchived: true } });
  if (!plan) return serviceError("OKR 计划不存在", 404);
  if (!(await canViewWorkTaskTarget(input.actorUserId, plan.targetType, plan.targetId))) return serviceError("无权限查看 KPI 结果", 403);
  if (plan.isArchived) return serviceError("已归档计划没有可填写的 KPI 结果", 409);
  const preview = await buildKpiResultPreview(input.planId);
  if (!preview.ok) return preview;
  const report = await prisma.workReport.findFirst({
    where: {
      targetType: plan.targetType,
      targetId: plan.targetId,
      reportStage: "final",
      items: { some: { workPlanId: input.planId } },
    },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    select: { id: true, periodType: true, periodStart: true, periodEnd: true, submittedAt: true },
  });
  return serviceOk({
    ...preview.data,
    workReport: report ? {
      ...report,
      periodStart: report.periodStart.toISOString(),
      periodEnd: report.periodEnd.toISOString(),
      submittedAt: report.submittedAt?.toISOString() ?? null,
    } : null,
  });
}

export async function validateKpiResultFinalization(input: {
  actorUserId: number;
  planId: number;
  workReportId: unknown;
  adjustments?: unknown;
}): Promise<ServiceResult<{
  workReportId: number;
  adjustments: WorkKpiResultAdjustmentInput[];
}>> {
  const command = validateWorkKpiResultCommitCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status ?? 400);
  const plan = await prisma.workPlan.findUnique({
    where: { id: command.data.planId },
    select: { targetType: true, targetId: true, okrStage: true, isArchived: true, krApprovedAt: true },
  });
  if (!plan) return serviceError("OKR 计划不存在", 404);
  const governance = await getWorkPlanOkrGovernance({ planId: command.data.planId, actorUserId: input.actorUserId });
  const resultFacet = governance?.governance.facets.result;
  if (plan.isArchived || !resultFacet?.editable) return serviceError("当前治理状态不能提交 KPI 结果", resultFacet?.lockReason === "permission_required" ? 403 : 409);
  if (!(await canViewWorkTaskTarget(input.actorUserId, plan.targetType, plan.targetId))) return serviceError("无权限查看 KPI 结果", 403);
  const report = await prisma.workReport.findUnique({
    where: { id: command.data.workReportId },
    select: { targetType: true, targetId: true },
  });
  if (!report || report.targetType !== plan.targetType || report.targetId !== plan.targetId) return serviceError("目标考核表与 KPI 计划空间不一致", 400);
  const preview = await buildKpiResultPreview(command.data.planId);
  if (!preview.ok) return preview;
  const unknownAdjustment = command.data.adjustments.find((adjustment) => !preview.data.results.some((result) => result.assignmentId === adjustment.assignmentId));
  if (unknownAdjustment) return serviceError("调分指标不属于当前 KPI 计分卡", 400);
  return serviceOk({ workReportId: command.data.workReportId, adjustments: command.data.adjustments });
}

export async function commitApprovedKpiResults(input: {
  actorUserId: number;
  planId: number;
  workReportId: number;
  adjustments?: unknown;
  authorization: "direct" | "workflow-approved";
}): Promise<ServiceResult<{ snapshotIds: number[]; weightedScore: number }>> {
  const command = validateWorkKpiResultCommitCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status ?? 400);
  const plan = await prisma.workPlan.findUnique({ where: { id: command.data.planId }, select: { targetType: true, targetId: true, okrStage: true, status: true, isArchived: true, krApprovedAt: true } });
  if (!plan) return serviceError("OKR 计划不存在", 404);
  if (plan.isArchived) return serviceError("已归档计划不能确认 KPI 结果", 409);
  if (input.authorization === "direct") {
    const governance = await getWorkPlanOkrGovernance({ planId: command.data.planId, actorUserId: input.actorUserId });
    const actionKind = governance?.governance.facets.result.action?.kind;
    const runtime = actionKind === "report_correct"
      ? governance?.actionRuntimes.reportCorrect
      : governance?.actionRuntimes.reportSubmit;
    if (!governance?.governance.facets.result.editable || runtime?.executionMode !== "direct" || !runtime.actions.includes("record.save")) {
      return serviceError("当前 KPI 结果已启用流程，请使用提交按钮", 409);
    }
    if (!(await canUpdateWorkTaskAction(input.actorUserId, plan.targetType, plan.targetId))) return serviceError("无权限确认 KPI 结果", 403);
  }
  const report = await prisma.workReport.findUnique({ where: { id: command.data.workReportId }, select: { id: true, targetType: true, targetId: true } });
  if (!report || report.targetType !== plan.targetType || report.targetId !== plan.targetId) return serviceError("目标考核表与 KPI 计划空间不一致", 400);
  const preview = await buildKpiResultPreview(command.data.planId);
  if (!preview.ok) return preview;
  const adjustments = new Map(command.data.adjustments.map((adjustment) => [adjustment.assignmentId, adjustment]));
  const unknownAdjustment = command.data.adjustments.find((adjustment) => !preview.data.results.some((result) => result.assignmentId === adjustment.assignmentId));
  if (unknownAdjustment) return serviceError("调分指标不属于当前 KPI 计分卡", 400);
  const snapshotIds = await prisma.$transaction(async (tx) => {
    const ids: number[] = [];
    for (const result of preview.data.results) {
      const adjustment = adjustments.get(result.assignmentId);
      const confirmedScore = adjustment?.confirmedScore ?? result.calculatedScore;
      const previous = await tx.workKpiResultSnapshot.findFirst({
        where: { assignmentId: result.assignmentId },
        orderBy: { version: "desc" },
        select: { id: true, version: true },
      });
      const created = await tx.workKpiResultSnapshot.create({
        data: {
          assignmentId: result.assignmentId,
          workReportId: command.data.workReportId,
          version: (previous?.version ?? 0) + 1,
          previousSnapshotId: previous?.id ?? null,
          actualValue: result.actualValue,
          scoreBeforeAdjustment: result.calculatedScore,
          confirmedScore,
          adjustmentReason: adjustment?.adjustmentReason ?? "",
          definitionSnapshotJson: JSON.stringify(result.definitionSnapshot),
          assignmentSnapshotJson: JSON.stringify(result.assignmentSnapshot),
          scoringRuleSnapshotJson: JSON.stringify(result.scoringRule),
          evidenceSnapshotJson: JSON.stringify(result.evidence),
          approvedByUserId: input.actorUserId,
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    return ids;
  });
  const weightedScore = round(preview.data.results.reduce((sum, result) => {
    const adjustment = adjustments.get(result.assignmentId);
    return sum + (adjustment?.confirmedScore ?? result.calculatedScore) * result.weight / 100;
  }, 0));
  return serviceOk({ snapshotIds, weightedScore });
}

async function buildKpiResultPreview(planId: number): Promise<ServiceResult<{ results: WorkKpiResultPreview[]; weightedScore: number }>> {
  const assignments = await prisma.workKpiAssignment.findMany({
    where: { workPlanId: planId },
    include: workKpiAssignmentInclude,
    orderBy: [{ workItem: { sortOrder: "asc" } }, { id: "asc" }],
  });
  if (!assignments.length) return serviceError("KPI 计分卡为空", 400);
  const results: WorkKpiResultPreview[] = [];
  for (const assignment of assignments) {
    const actualValue = decimalNumber(assignment.currentValue);
    if (actualValue === null) return serviceError(`指标「${assignment.workItem.content}」尚未填写实际值`, 400);
    const scoringRule = parseWorkKpiScoringRuleJson(assignment.scoringRuleSnapshotJson);
    if (!scoringRule.ok) return serviceError(`指标「${assignment.workItem.content}」评分规则无效`, 409);
    let calculatedScore: number;
    try {
      calculatedScore = calculateWorkKpiScore({
        direction: assignment.definition.direction as WorkKpiDirection,
        actualValue,
        baselineValue: decimalNumber(assignment.baselineValue),
        targetValue: decimalNumber(assignment.targetValue),
        targetLowerBound: decimalNumber(assignment.targetLowerBound),
        targetUpperBound: decimalNumber(assignment.targetUpperBound),
        rule: scoringRule.data,
      });
    } catch (error) {
      return serviceError(error instanceof Error ? error.message : "KPI 评分失败", 400);
    }
    results.push({
      assignmentId: assignment.id,
      weight: decimalNumber(assignment.weight) ?? 0,
      actualValue,
      calculatedScore,
      definitionSnapshot: parseJsonObject(assignment.definitionSnapshotJson),
      assignmentSnapshot: {
        schemaVersion: 1,
        assignmentId: assignment.id,
        workPlanId: assignment.workPlanId,
        workItemId: assignment.workItemId,
        ownerEmployeeId: assignment.ownerEmployeeId,
        sourceAssignmentId: assignment.sourceAssignmentId,
        weight: decimalNumber(assignment.weight),
        baselineValue: decimalNumber(assignment.baselineValue),
        targetValue: decimalNumber(assignment.targetValue),
        targetLowerBound: decimalNumber(assignment.targetLowerBound),
        targetUpperBound: decimalNumber(assignment.targetUpperBound),
      },
      scoringRule: scoringRule.data,
      evidence: {
        schemaVersion: 1,
        tasks: assignment.workItem.krEvidenceTasks.map((evidence) => ({
          taskId: evidence.taskWorkItem.id,
          content: evidence.taskWorkItem.content,
          status: evidence.taskWorkItem.status,
          completedAt: evidence.taskWorkItem.completedAt?.toISOString() ?? null,
          updatedAt: evidence.taskWorkItem.updatedAt.toISOString(),
          note: evidence.note,
        })),
      },
    });
  }
  return serviceOk({
    results,
    weightedScore: round(results.reduce((sum, result) => sum + result.calculatedScore * result.weight / 100, 0)),
  });
}

type WorkKpiResultPreview = {
  assignmentId: number;
  weight: number;
  actualValue: number;
  calculatedScore: number;
  definitionSnapshot: Record<string, unknown>;
  assignmentSnapshot: Record<string, unknown>;
  scoringRule: WorkKpiScoringRule;
  evidence: Record<string, unknown>;
};

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
