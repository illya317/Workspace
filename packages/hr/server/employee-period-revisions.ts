import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { queueHrDataQualityEvaluation } from "./data-quality-trigger";
import {
  buildEmployeePeriodRevisionCommand,
  type EmployeePeriodRevisionInput,
} from "./domain/employee-period-revision-validation";

export async function reviseEmployeePeriod(
  employeeId: number,
  input: EmployeePeriodRevisionInput,
  userId: number,
): Promise<DomainServiceResult<{ success: true; entityType: "Employment" | "EDP"; periodId: number }>> {
  if (!(await evaluatePermissionAction(userId, "hr.roster", "revise"))) return serviceError("无权限修订人员周期", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employeePeriod.revise",
    actorUserId: userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "人员周期修订已配置为必须走流程，请从统一流程入口提交",
  });
  if (!direct.ok) return direct;
  const validated = mapValidationToServiceResult(await buildEmployeePeriodRevisionCommand(employeeId, input, userId));
  if (!validated.ok) return validated;

  const entityType = validated.data.entityType;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = entityType === "Employment"
        ? await tx.employment.findUnique({ where: { id: validated.data.periodId }, select: { joinDate: true, leaveDate: true, version: true } })
        : await tx.eDP.findUnique({ where: { id: validated.data.periodId }, select: { startDate: true, endDate: true, version: true } });
      if (!before) throw new EmployeePeriodRevisionError("周期记录不存在", 404);
      if (before.version !== validated.data.expectedVersion) {
        throw new EmployeePeriodRevisionError("周期已被其他人修改，请刷新后重试", 409);
      }
      await ensureEditHistoryBaseline(entityType, validated.data.periodId, userId, tx);
      const updated = entityType === "Employment"
        ? await tx.employment.updateMany({
            where: { id: validated.data.periodId, employeeId, version: validated.data.expectedVersion },
            data: {
              joinDate: validated.data.startDate,
              leaveDate: validated.data.endDate,
              isActive: isCurrentPeriod(validated.data.startDate, validated.data.endDate),
              editedBy: userId,
              editedAt: new Date(),
              version: { increment: 1 },
            },
          })
        : await tx.eDP.updateMany({
            where: { id: validated.data.periodId, employeeId, version: validated.data.expectedVersion },
            data: {
              startDate: validated.data.startDate,
              endDate: validated.data.endDate,
              editedBy: userId,
              editedAt: new Date(),
              version: { increment: 1 },
            },
          });
      if (updated.count !== 1) throw new EmployeePeriodRevisionError("周期已被其他人修改，请刷新后重试", 409);
      await tx.employeePeriodRevision.create({
        data: {
          employeeId,
          entityType,
          periodId: validated.data.periodId,
          expectedVersion: validated.data.expectedVersion,
          beforeJson: JSON.stringify(before),
          afterJson: JSON.stringify({ startDate: validated.data.startDate, endDate: validated.data.endDate }),
          reason: validated.data.reason,
          recordedByUserId: userId,
        },
      });
      await snapshotHistory(entityType, validated.data.periodId, userId, tx);
      return serviceOk({ success: true as const, entityType, periodId: validated.data.periodId });
    });
    if (result.ok) await queueHrDataQualityEvaluation("Employee", [employeeId]);
    return result;
  } catch (error) {
    if (error instanceof EmployeePeriodRevisionError) return serviceError(error.message, error.status);
    throw error;
  }
}

function isCurrentPeriod(startDate: string, endDate: string | null) {
  const today = workspaceBusinessDate(new Date());
  return startDate <= today && (!endDate || endDate >= today);
}

class EmployeePeriodRevisionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "EmployeePeriodRevisionError";
  }
}
