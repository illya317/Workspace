import { Prisma } from "@workspace/platform/server/prisma";

export const workKpiDefinitionInclude = {
  ownerDepartment: { select: { id: true, code: true, name: true } },
} satisfies Prisma.WorkKpiDefinitionInclude;

export const workKpiAssignmentInclude = {
  definition: { include: workKpiDefinitionInclude },
  workItem: {
    select: {
      id: true,
      content: true,
      parentWorkItemId: true,
      status: true,
      owner: { select: { id: true, employeeId: true, name: true } },
      krEvidenceTasks: {
        orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
        select: {
          note: true,
          taskWorkItem: { select: { id: true, content: true, status: true, completedAt: true, updatedAt: true } },
        },
      },
    },
  },
  sourceAssignment: {
    select: {
      id: true,
      workPlanId: true,
      definitionId: true,
      workItem: { select: { content: true } },
      workPlan: { select: { title: true, targetType: true, targetId: true } },
    },
  },
  resultSnapshots: {
    orderBy: { version: "desc" as const },
    take: 1,
    select: {
      id: true,
      version: true,
      actualValue: true,
      scoreBeforeAdjustment: true,
      confirmedScore: true,
      adjustmentReason: true,
      approvedAt: true,
    },
  },
} satisfies Prisma.WorkKpiAssignmentInclude;

export type WorkKpiDefinitionRow = Prisma.WorkKpiDefinitionGetPayload<{ include: typeof workKpiDefinitionInclude }>;
export type WorkKpiAssignmentRow = Prisma.WorkKpiAssignmentGetPayload<{ include: typeof workKpiAssignmentInclude }>;

export function toWorkKpiDefinitionDto(row: WorkKpiDefinitionRow) {
  return {
    id: row.id,
    code: row.code,
    version: row.version,
    status: row.status,
    name: row.name,
    description: row.description,
    valueType: row.valueType,
    displayType: row.displayType,
    unit: row.unit,
    direction: row.direction,
    scoringRule: parseJsonObject(row.defaultScoringRuleJson),
    measurementMode: row.measurementMode,
    ownerDepartmentId: row.ownerDepartmentId,
    ownerDepartmentCode: row.ownerDepartment.code,
    ownerDepartmentName: row.ownerDepartment.name,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWorkKpiAssignmentDto(row: WorkKpiAssignmentRow) {
  const latestResult = row.resultSnapshots[0] ?? null;
  return {
    id: row.id,
    version: row.version,
    workPlanId: row.workPlanId,
    definitionId: row.definitionId,
    definition: toWorkKpiDefinitionDto(row.definition),
    workItemId: row.workItemId,
    workItemContent: row.workItem.content,
    objectiveWorkItemId: row.workItem.parentWorkItemId,
    workItemStatus: row.workItem.status,
    ownerEmployeeId: row.ownerEmployeeId,
    ownerEmployeeNumber: row.workItem.owner?.employeeId ?? null,
    ownerEmployeeName: row.workItem.owner?.name ?? null,
    sourceAssignmentId: row.sourceAssignmentId,
    sourceAssignment: row.sourceAssignment ? {
      id: row.sourceAssignment.id,
      workPlanId: row.sourceAssignment.workPlanId,
      definitionId: row.sourceAssignment.definitionId,
      title: row.sourceAssignment.workItem.content,
      planTitle: row.sourceAssignment.workPlan.title,
      targetType: row.sourceAssignment.workPlan.targetType,
      targetId: row.sourceAssignment.workPlan.targetId,
    } : null,
    relationKind: row.relationKind,
    weight: decimalNumber(row.weight),
    baselineValue: decimalNumber(row.baselineValue),
    targetValue: decimalNumber(row.targetValue),
    targetLowerBound: decimalNumber(row.targetLowerBound),
    targetUpperBound: decimalNumber(row.targetUpperBound),
    currentValue: decimalNumber(row.currentValue),
    definitionSnapshot: parseJsonObject(row.definitionSnapshotJson),
    scoringRule: parseJsonObject(row.scoringRuleSnapshotJson),
    evidence: row.workItem.krEvidenceTasks.map((evidence) => ({
      taskId: evidence.taskWorkItem.id,
      content: evidence.taskWorkItem.content,
      status: evidence.taskWorkItem.status,
      completedAt: evidence.taskWorkItem.completedAt?.toISOString() ?? null,
      updatedAt: evidence.taskWorkItem.updatedAt.toISOString(),
      note: evidence.note,
    })),
    latestResult: latestResult ? {
      id: latestResult.id,
      version: latestResult.version,
      actualValue: decimalNumber(latestResult.actualValue),
      scoreBeforeAdjustment: decimalNumber(latestResult.scoreBeforeAdjustment),
      confirmedScore: decimalNumber(latestResult.confirmedScore),
      adjustmentReason: latestResult.adjustmentReason,
      approvedAt: latestResult.approvedAt.toISOString(),
    } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function decimalNumber(value: Prisma.Decimal | null | undefined) {
  return value == null ? null : Number(value.toString());
}

export function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
