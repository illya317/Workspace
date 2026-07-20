import { prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { validateWorkKpiDefinitionCommand, type WorkKpiDefinitionCommand, type WorkKpiDefinitionDeleteCommand } from "./domain/work-kpi-definition-validation";
import { canDeleteWorkTaskAction, canUpdateWorkTaskAction, canViewWorkTaskTarget } from "./access";
import { toWorkKpiDefinitionDto, workKpiDefinitionInclude } from "./work-kpi-dto";

export async function listKpiDefinitions(input: {
  actorUserId: number;
  targetType: string;
  targetId: number;
  ownerDepartmentId?: number | null;
  includeRetired?: boolean;
}): Promise<ServiceResult<{ definitions: ReturnType<typeof toWorkKpiDefinitionDto>[] }>> {
  if (!(await canViewWorkTaskTarget(input.actorUserId, input.targetType, input.targetId))) return serviceError("无权限查看 KPI 指标库", 403);
  const rows = await prisma.workKpiDefinition.findMany({
    where: {
      ...(input.ownerDepartmentId ? { ownerDepartmentId: input.ownerDepartmentId } : {}),
      ...(!input.includeRetired ? { status: { not: "retired" } } : {}),
    },
    include: workKpiDefinitionInclude,
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  return serviceOk({ definitions: rows.map(toWorkKpiDefinitionDto) });
}

export async function saveKpiDefinitionRevision(input: {
  actorUserId: number;
  definitionId?: number | null;
  data: Record<string, unknown>;
}): Promise<ServiceResult<{ definition: ReturnType<typeof toWorkKpiDefinitionDto> }>> {
  const existing = input.definitionId
    ? await prisma.workKpiDefinition.findUnique({ where: { id: input.definitionId }, include: workKpiDefinitionInclude })
    : null;
  if (input.definitionId && !existing) return serviceError("KPI 指标定义不存在", 404);
  const candidate = validateWorkKpiDefinitionCommand({
    ...input.data,
    ...(existing ? { code: existing.code, ownerDepartmentId: existing.ownerDepartmentId } : {}),
  });
  if (!candidate.ok) return serviceError(candidate.issue.message, candidate.issue.status ?? 400, candidate.issue.field ? { field: candidate.issue.field } : undefined);
  if (!(await canUpdateWorkTaskAction(input.actorUserId, "department", candidate.data.ownerDepartmentId))) return serviceError("无权限维护该归口部门的 KPI 指标", 403);
  const department = await prisma.department.findUnique({ where: { id: candidate.data.ownerDepartmentId }, select: { id: true, isArchived: true } });
  if (!department || department.isArchived) return serviceError("KPI 指标归口部门不存在或已归档", 400);
  const scoringRuleJson = JSON.stringify(candidate.data.scoringRule);
  try {
    const row = existing?.status === "draft"
      ? await prisma.workKpiDefinition.update({
          where: { id: existing.id },
          data: definitionWriteData(candidate.data, scoringRuleJson),
          include: workKpiDefinitionInclude,
        })
      : await prisma.$transaction(async (tx) => {
          const latest = await tx.workKpiDefinition.aggregate({ where: { code: candidate.data.code }, _max: { version: true } });
          if (!existing && latest._max.version) throw new Error("KPI_CODE_EXISTS");
          return tx.workKpiDefinition.create({
            data: {
              ...definitionWriteData(candidate.data, scoringRuleJson),
              version: (latest._max.version ?? 0) + 1,
              createdByUserId: input.actorUserId,
            },
            include: workKpiDefinitionInclude,
          });
        });
    return serviceOk({ definition: toWorkKpiDefinitionDto(row) });
  } catch (error) {
    if (error instanceof Error && error.message === "KPI_CODE_EXISTS") return serviceError("KPI 指标编码已存在，请修订现有指标", 409);
    if (isUniqueConstraintError(error)) return serviceError("KPI 指标版本已被其他人更新，请刷新后重试", 409);
    throw error;
  }
}

export async function deleteKpiDefinition(command: WorkKpiDefinitionDeleteCommand) {
  const result = await guardedDelete({
    entityType: "WorkKpiDefinition",
    modelKey: "workKpiDefinition",
    id: command.definitionId,
    userId: command.actorUserId,
    expectedVersion: command.expectedVersion,
    actionLabel: "删除 KPI 指标定义",
    deleteMode: "hard",
    references: [{
      label: "周期计分卡",
      count: (tx) => tx.workKpiAssignment.count({ where: { definitionId: command.definitionId } }),
    }],
    referencePolicy: "checked",
    scopeGuard: async ({ record }) => {
      const ownerDepartmentId = Number(record.ownerDepartmentId);
      if (!Number.isInteger(ownerDepartmentId) || ownerDepartmentId <= 0) return { error: "KPI 指标归口部门无效", status: 400 };
      return await canDeleteWorkTaskAction(command.actorUserId, "department", ownerDepartmentId)
        ? { ok: true }
        : { error: "无权限删除该归口部门的 KPI 指标", status: 403 };
    },
  });
  return result.ok ? serviceOk(result.data) : serviceError(result.error, result.status ?? 400);
}

function definitionWriteData(
  data: WorkKpiDefinitionCommand,
  scoringRuleJson: string,
) {
  return {
    code: data.code,
    status: data.status,
    name: data.name,
    description: data.description,
    valueType: data.valueType,
    displayType: data.displayType,
    unit: data.unit,
    direction: data.direction,
    defaultScoringRuleJson: scoringRuleJson,
    measurementMode: data.measurementMode,
    ownerDepartmentId: data.ownerDepartmentId,
  };
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}
