import { prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { validateWorkKpiScorecardCommand, type WorkKpiScorecardEntryCommand } from "./domain/work-kpi-scorecard-validation";
import { validateWorkKpiMeasurementsCommand } from "./domain/work-kpi-result-validation";
import { canUpdateWorkTaskAction, canViewWorkTaskTarget } from "./access";
import { validateWorkOwnerAssignment } from "./work-owner-eligibility";
import { parseWorkKpiScoringRuleJson } from "./work-kpi-scoring";
import type { WorkKpiScoringRule } from "./work-kpi-types";
import { toWorkKpiAssignmentDto, workKpiAssignmentInclude } from "./work-kpi-dto";
import { approveObjectiveReview, recordDirectObjectiveConfirmation } from "./work-okr-stage";
import { getWorkPlanOkrGovernance } from "./work-plan-governance";

type ScorecardDto = Awaited<ReturnType<typeof loadKpiScorecardDto>>;

export async function getKpiScorecard(input: {
  actorUserId: number;
  planId: number;
}): Promise<ServiceResult<ScorecardDto>> {
  const plan = await loadKpiPlan(input.planId);
  if (!plan) return serviceError("OKR 计划不存在", 404);
  if (!(await canViewWorkTaskTarget(input.actorUserId, plan.targetType, plan.targetId))) return serviceError("无权限查看 KPI 计分卡", 403);
  return serviceOk(await loadKpiScorecardDto(plan));
}

export async function validateKpiScorecardFinalization(input: {
  actorUserId: number;
  planId: number;
  expectedPlanGovernanceRevision?: number;
  entries: unknown;
}): Promise<ServiceResult<{
  entries: WorkKpiScorecardEntryCommand[];
  expectedPlanGovernanceRevision?: number;
}>> {
  const command = validateWorkKpiScorecardCommand({ ...input, intent: "finalize" });
  if (!command.ok) return serviceError(command.issue.message, command.issue.status ?? 400, command.issue.field ? { field: command.issue.field } : undefined);
  const plan = await loadKpiPlan(command.data.planId);
  if (!plan) return serviceError("OKR 计划不存在", 404);
  if (plan.kind !== "okr") return serviceError("只有 OKR 周期计划可以维护 KPI 计分卡", 400);
  const governance = await getWorkPlanOkrGovernance({ planId: plan.id, actorUserId: input.actorUserId });
  const targetFacet = governance?.governance.facets.target;
  if (plan.isArchived || !targetFacet?.editable) return serviceError("当前治理状态不能提交 KPI 目标计分卡", targetFacet?.lockReason === "permission_required" ? 403 : 409);
  if (command.data.expectedPlanGovernanceRevision !== undefined && plan.governanceRevision !== command.data.expectedPlanGovernanceRevision) {
    return serviceError("计划治理规则已更新，请刷新后重试", 409);
  }
  const context = await validateScorecardRelations(plan, command.data.entries, input.actorUserId);
  if (!context.ok) return context;
  return serviceOk({
    entries: command.data.entries,
    ...(command.data.expectedPlanGovernanceRevision === undefined
      ? {}
      : { expectedPlanGovernanceRevision: command.data.expectedPlanGovernanceRevision }),
  });
}

export async function saveKpiScorecardDraft(input: {
  actorUserId: number;
  planId: number;
  intent?: "draft" | "finalize";
  expectedPlanGovernanceRevision?: number;
  entries: unknown;
  authorization?: "direct" | "workflow-approved";
  ownerEligibilityUserId?: number;
}): Promise<ServiceResult<ScorecardDto>> {
  const command = validateWorkKpiScorecardCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status ?? 400, command.issue.field ? { field: command.issue.field } : undefined);
  const plan = await loadKpiPlan(command.data.planId);
  if (!plan) return serviceError("OKR 计划不存在", 404);
  if (plan.kind !== "okr") return serviceError("只有 OKR 周期计划可以维护 KPI 计分卡", 400);
  const governance = input.authorization === "workflow-approved"
    ? null
    : await getWorkPlanOkrGovernance({ planId: plan.id, actorUserId: input.actorUserId });
  const targetEditable = input.authorization === "workflow-approved"
    || governance?.governance.facets.target.editable === true;
  if (plan.isArchived || !targetEditable) return serviceError("当前治理状态不能维护 KPI 目标计分卡", governance?.governance.facets.target.lockReason === "permission_required" ? 403 : 409);
  if (command.data.expectedPlanGovernanceRevision !== undefined && plan.governanceRevision !== command.data.expectedPlanGovernanceRevision) {
    return serviceError("计划治理规则已更新，请刷新后重试", 409);
  }
  if (input.authorization !== "workflow-approved" && !(await canUpdateWorkTaskAction(input.actorUserId, plan.targetType, plan.targetId))) return serviceError("无权限维护 KPI 计分卡", 403);
  const context = await validateScorecardRelations(plan, command.data.entries, input.ownerEligibilityUserId ?? input.actorUserId);
  if (!context.ok) return context;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.workKpiAssignment.findMany({
        where: { workPlanId: plan.id },
        select: { id: true, workItemId: true, version: true, _count: { select: { resultSnapshots: true } } },
      });
      const incomingIds = new Set(command.data.entries.flatMap((entry) => entry.id ? [entry.id] : []));
      const removed = existing.filter((entry) => !incomingIds.has(entry.id));
      if (removed.some((entry) => entry._count.resultSnapshots > 0)) throw new KpiConflict("已有结算快照的 KPI 不能删除");
      if (removed.length) {
        await tx.workKpiAssignment.deleteMany({ where: { id: { in: removed.map((entry) => entry.id) }, workPlanId: plan.id } });
        await tx.workItem.deleteMany({ where: { id: { in: removed.map((entry) => entry.workItemId) }, planId: plan.id } });
      }
      for (const [index, entry] of command.data.entries.entries()) {
        const definition = context.data.definitions.get(entry.definitionId)!;
        const scoringRuleJson = JSON.stringify(entry.scoringRule ?? definition.scoringRule);
        const definitionSnapshotJson = JSON.stringify(definition.snapshot);
        if (entry.id) {
          const current = existing.find((row) => row.id === entry.id);
          if (!current || current.version !== entry.version) throw new KpiConflict("KPI 计分卡已被其他人更新，请刷新后重试");
          const updated = await tx.workKpiAssignment.updateMany({
            where: { id: entry.id, workPlanId: plan.id, version: entry.version! },
            data: {
              definitionId: entry.definitionId,
              ownerEmployeeId: entry.ownerEmployeeId,
              sourceAssignmentId: entry.sourceAssignmentId,
              relationKind: entry.relationKind,
              weight: entry.weight,
              baselineValue: entry.baselineValue,
              targetValue: entry.targetValue,
              targetLowerBound: entry.targetLowerBound,
              targetUpperBound: entry.targetUpperBound,
              definitionSnapshotJson,
              scoringRuleSnapshotJson: scoringRuleJson,
              updatedByUserId: input.actorUserId,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) throw new KpiConflict("KPI 计分卡已被其他人更新，请刷新后重试");
          await tx.workItem.update({
            where: { id: current.workItemId },
            data: {
              content: definition.snapshot.name,
              description: definition.snapshot.description,
              ownerEmployeeId: entry.ownerEmployeeId,
              parentWorkItemId: entry.objectiveWorkItemId,
              sortOrder: index,
            },
          });
        } else {
          const workItem = await tx.workItem.create({
            data: {
              planId: plan.id,
              targetType: plan.targetType,
              targetId: plan.targetId,
              category: "non-routine",
              itemType: "key_result",
              content: definition.snapshot.name,
              description: definition.snapshot.description,
              status: "active",
              ownerEmployeeId: entry.ownerEmployeeId,
              parentWorkItemId: entry.objectiveWorkItemId,
              sourceType: "other",
              sortOrder: index,
            },
            select: { id: true },
          });
          await tx.workKpiAssignment.create({
            data: {
              workPlanId: plan.id,
              definitionId: entry.definitionId,
              workItemId: workItem.id,
              ownerEmployeeId: entry.ownerEmployeeId,
              sourceAssignmentId: entry.sourceAssignmentId,
              relationKind: entry.relationKind,
              weight: entry.weight,
              baselineValue: entry.baselineValue,
              targetValue: entry.targetValue,
              targetLowerBound: entry.targetLowerBound,
              targetUpperBound: entry.targetUpperBound,
              definitionSnapshotJson,
              scoringRuleSnapshotJson: scoringRuleJson,
              updatedByUserId: input.actorUserId,
            },
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof KpiConflict) return serviceError(error.message, 409);
    if (isUniqueConstraintError(error)) return serviceError("同一计分卡不能重复关联同一指标或 KR", 409);
    throw error;
  }
  return serviceOk(await loadKpiScorecardDto(plan));
}

export async function finalizeKpiScorecard(input: {
  actorUserId: number;
  planId: number;
  expectedPlanGovernanceRevision?: number;
  entries: unknown;
  authorization: "direct" | "workflow-approved";
  ownerEligibilityUserId?: number;
}): Promise<ServiceResult<ScorecardDto>> {
  let directGovernance: Awaited<ReturnType<typeof getWorkPlanOkrGovernance>> = null;
  const existingPlan = await loadKpiPlan(input.planId);
  if (!existingPlan) return serviceError("OKR 计划不存在", 404);
  const targetWasConfirmed = existingPlan.objectiveApprovedAt !== null;
  if (input.authorization === "direct") {
    directGovernance = await getWorkPlanOkrGovernance({ planId: input.planId, actorUserId: input.actorUserId });
    if (!directGovernance) return serviceError("OKR 计划不存在", 404);
    const actionKind = directGovernance.governance.facets.target.action?.kind;
    const runtime = actionKind === "objective_revise"
      ? directGovernance.actionRuntimes.objectiveRevise
      : directGovernance.actionRuntimes.objectiveSubmit;
    if (runtime.executionMode !== "direct" || !runtime.actions.includes("record.save")) {
      return serviceError("当前 KPI 目标已启用流程，请使用提交按钮", 409);
    }
  }
  const saved = await saveKpiScorecardDraft({
    ...input,
    intent: "finalize",
    authorization: input.authorization,
  });
  if (!saved.ok) return saved;
  if (input.authorization === "direct") {
    const confirmed = await recordDirectObjectiveConfirmation(input.planId, input.actorUserId, {
      schemaVersion: 1,
      actionKind: targetWasConfirmed ? "objective_revise" : "objective_submit",
      kpiScorecard: saved.data,
    });
    if (!confirmed.ok) return serviceError(confirmed.error, confirmed.status ?? 400);
    const finalizedPlan = await loadKpiPlan(input.planId);
    if (!finalizedPlan) return serviceError("OKR 计划不存在", 404);
    return serviceOk(await loadKpiScorecardDto(finalizedPlan));
  }
  const approved = await approveObjectiveReview(input.planId, input.actorUserId, {
    schemaVersion: 1,
    actionKind: targetWasConfirmed ? "objective_revise" : "objective_submit",
    kpiScorecard: saved.data,
  });
  if (!approved.ok) return serviceError(approved.error, approved.status ?? 400);
  const finalizedPlan = await loadKpiPlan(input.planId);
  if (!finalizedPlan) return serviceError("OKR 计划不存在", 404);
  return serviceOk(await loadKpiScorecardDto(finalizedPlan));
}

export async function updateKpiMeasurements(input: {
  actorUserId: number;
  planId: number;
  measurements: unknown;
}): Promise<ServiceResult<ScorecardDto>> {
  const command = validateWorkKpiMeasurementsCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status ?? 400);
  const plan = await loadKpiPlan(command.data.planId);
  if (!plan) return serviceError("OKR 计划不存在", 404);
  const governance = await getWorkPlanOkrGovernance({ planId: plan.id, actorUserId: input.actorUserId });
  const resultFacet = governance?.governance.facets.result;
  if (plan.isArchived || !resultFacet?.editable) return serviceError("当前治理状态不能更新 KPI 实际值", resultFacet?.lockReason === "permission_required" ? 403 : 409);
  if (!(await canUpdateWorkTaskAction(input.actorUserId, plan.targetType, plan.targetId))) return serviceError("无权限更新 KPI 实际值", 403);
  try {
    await prisma.$transaction(async (tx) => {
      for (const measurement of command.data.measurements) {
        const updated = await tx.workKpiAssignment.updateMany({
          where: { id: measurement.assignmentId, workPlanId: plan.id, version: measurement.version },
          data: { currentValue: measurement.currentValue, updatedByUserId: input.actorUserId, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new KpiConflict("KPI 实际值已被其他人更新，请刷新后重试");
      }
    });
  } catch (error) {
    if (error instanceof KpiConflict) return serviceError(error.message, 409);
    throw error;
  }
  return serviceOk(await loadKpiScorecardDto(plan));
}

async function validateScorecardRelations(
  plan: NonNullable<Awaited<ReturnType<typeof loadKpiPlan>>>,
  entries: WorkKpiScorecardEntryCommand[],
  actorUserId: number,
): Promise<ServiceResult<{ definitions: Map<number, DefinitionContext> }>> {
  const definitions = await prisma.workKpiDefinition.findMany({ where: { id: { in: entries.map((entry) => entry.definitionId) } } });
  if (definitions.length !== entries.length) return serviceError("部分 KPI 指标定义不存在", 400);
  const definitionMap = new Map<number, DefinitionContext>();
  for (const definition of definitions) {
    if (definition.status !== "active") return serviceError(`指标「${definition.name}」尚未生效或已退休`, 409);
    const scoringRule = parseWorkKpiScoringRuleJson(definition.defaultScoringRuleJson);
    if (!scoringRule.ok) return serviceError(`指标「${definition.name}」的评分规则无效`, 409);
    definitionMap.set(definition.id, {
      scoringRule: scoringRule.data,
      snapshot: {
        schemaVersion: 1,
        id: definition.id,
        code: definition.code,
        version: definition.version,
        name: definition.name,
        description: definition.description,
        valueType: definition.valueType,
        displayType: definition.displayType,
        unit: definition.unit,
        direction: definition.direction,
        ownerDepartmentId: definition.ownerDepartmentId,
      },
    });
  }
  const objectiveIds = entries.flatMap((entry) => entry.objectiveWorkItemId ? [entry.objectiveWorkItemId] : []);
  if (objectiveIds.length) {
    const objectiveCount = await prisma.workItem.count({ where: { id: { in: objectiveIds }, planId: plan.id, itemType: "objective", isArchived: false } });
    if (objectiveCount !== new Set(objectiveIds).size) return serviceError("KPI 所属目标不在当前计划中", 400);
  }
  const sourceIds = entries.flatMap((entry) => entry.sourceAssignmentId ? [entry.sourceAssignmentId] : []);
  if (sourceIds.length) {
    const sources = await prisma.workKpiAssignment.findMany({ where: { id: { in: sourceIds } }, select: { id: true, definitionId: true, workPlanId: true } });
    if (sources.length !== new Set(sourceIds).size) return serviceError("部分上级 KPI 不存在", 400);
    for (const entry of entries) {
      const source = entry.sourceAssignmentId ? sources.find((row) => row.id === entry.sourceAssignmentId) : null;
      if (source && source.workPlanId === plan.id) return serviceError("上级 KPI 必须来自其他计分卡", 400);
      if (source && source.definitionId !== entry.definitionId) return serviceError("分解 KPI 必须沿用同一指标定义版本", 400);
    }
  }
  for (const entry of entries) {
    const definition = definitions.find((row) => row.id === entry.definitionId)!;
    const targetError = validateTargetValues(definition.direction, entry);
    if (targetError) return serviceError(`${definition.name}：${targetError}`, 400);
    const ownerError = await validateWorkOwnerAssignment({
      actorUserId,
      targetType: plan.targetType,
      targetId: plan.targetId,
      ownerEmployeeId: entry.ownerEmployeeId,
    });
    if (ownerError) return serviceError(ownerError, 400);
  }
  return serviceOk({ definitions: definitionMap });
}

async function loadKpiPlan(planId: number) {
  return prisma.workPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      kind: true,
      title: true,
      status: true,
      isArchived: true,
      okrStage: true,
      objectiveApprovedAt: true,
      okrCycleId: true,
      governanceRevision: true,
    },
  });
}

async function loadKpiScorecardDto(plan: NonNullable<Awaited<ReturnType<typeof loadKpiPlan>>>) {
  const assignments = await prisma.workKpiAssignment.findMany({
    where: { workPlanId: plan.id },
    include: workKpiAssignmentInclude,
    orderBy: [{ workItem: { sortOrder: "asc" } }, { id: "asc" }],
  });
  return {
    plan: {
      id: plan.id,
      title: plan.title,
      targetType: plan.targetType,
      targetId: plan.targetId,
      okrCycleId: plan.okrCycleId,
      okrStage: plan.okrStage,
      status: plan.status,
      governanceRevision: plan.governanceRevision,
    },
    assignments: assignments.map(toWorkKpiAssignmentDto),
    totalWeight: assignments.reduce((sum, assignment) => sum + Number(assignment.weight.toString()), 0),
  };
}

function validateTargetValues(direction: string, entry: WorkKpiScorecardEntryCommand) {
  if (direction === "target_range") {
    if (entry.targetLowerBound === null || entry.targetUpperBound === null) return "目标区间不能为空";
    if (entry.targetUpperBound <= entry.targetLowerBound) return "目标上限必须大于下限";
    return null;
  }
  if (entry.targetValue === null) return "目标值不能为空";
  if (direction === "higher_is_better" && entry.baselineValue !== null && entry.targetValue <= entry.baselineValue) return "目标值必须大于起点值";
  if (direction === "lower_is_better" && entry.baselineValue !== null && entry.targetValue >= entry.baselineValue) return "目标值必须小于起点值";
  return null;
}

type DefinitionContext = {
  scoringRule: WorkKpiScoringRule;
  snapshot: {
    schemaVersion: number;
    id: number;
    code: string;
    version: number;
    name: string;
    description: string;
    valueType: string;
    displayType: string;
    unit: string;
    direction: string;
    ownerDepartmentId: number;
  };
};

class KpiConflict extends Error {}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}
