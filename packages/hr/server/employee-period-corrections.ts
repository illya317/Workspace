import { checkHRUpdate } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import {
  runSerializableTransaction,
  SerializableTransactionConflictError,
} from "@workspace/platform/server/serializable-transaction";
import { queueHrDataQualityEvaluation } from "./data-quality-trigger";
import {
  buildEmployeePeriodCorrectionCommand,
  employeePeriodCorrectionHasChanges,
  validateEmployeePeriodCorrectionState,
  type EmployeePeriodCorrectionInput,
} from "./domain/employee-period-correction-validation";

type CorrectionResult = {
  success: true;
  entityType: "Employment" | "EDP";
  periodId: number;
  version: number;
  changed: boolean;
};

export async function correctEmployeePeriod(
  employeeId: number,
  periodId: number,
  input: EmployeePeriodCorrectionInput,
  userId: number,
): Promise<DomainServiceResult<CorrectionResult>> {
  const normalized = mapValidationToServiceResult(buildEmployeePeriodCorrectionCommand(employeeId, periodId, input, userId));
  if (!normalized.ok) return normalized;
  if (!(await checkHRUpdate(userId, "hr.roster"))) return serviceError("无权限修改人员任职资料", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employeePeriod.correct",
    actorUserId: userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "人员任职资料修改已配置为必须走流程，请从统一流程入口提交",
  });
  if (!direct.ok) return direct;

  try {
    const persisted = await runSerializableTransaction(async (tx) => {
      const state = mapValidationToServiceResult(await validateEmployeePeriodCorrectionState(tx, normalized.data));
      if (!state.ok) return state;
      const changed = employeePeriodCorrectionHasChanges(
        state.data.current as unknown as Record<string, unknown>,
        normalized.data.patch as Record<string, unknown>,
      );
      if (!changed) {
        return serviceOk({
          success: true as const,
          entityType: state.data.entityType,
          periodId,
          version: state.data.current.version,
          changed: false,
        });
      }

      const now = new Date();
      await ensureEditHistoryBaseline(state.data.entityType, periodId, userId, tx);
      const updated = state.data.entityType === "Employment" && normalized.data.entityType === "Employment"
        ? await tx.employment.updateMany({
            where: { id: periodId, employeeId, version: normalized.data.expectedVersion },
            data: {
              ...normalized.data.patch,
              isActive: isCurrentPeriod(state.data.next.joinDate, state.data.next.leaveDate),
              editedBy: userId,
              editedAt: now,
              version: { increment: 1 },
            },
          })
        : state.data.entityType === "EDP" && normalized.data.entityType === "EDP"
          ? await tx.eDP.updateMany({
            where: { id: periodId, employeeId, version: normalized.data.expectedVersion },
            data: {
              ...normalized.data.patch,
              editedBy: userId,
              editedAt: now,
              version: { increment: 1 },
            },
            })
          : null;
      if (!updated) return serviceError("人员任职记录类型不一致，请刷新后重试", 409);
      if (updated.count !== 1) return serviceError("人员任职资料已被修改，请刷新后重试", 409);

      await tx.employeePeriodRevision.create({
        data: {
          employeeId,
          entityType: state.data.entityType,
          periodId,
          expectedVersion: normalized.data.expectedVersion,
          beforeJson: JSON.stringify(state.data.current),
          afterJson: JSON.stringify(state.data.next),
          reason: normalized.data.reason ?? automaticReason(state.data.entityType),
          recordedByUserId: userId,
          recordedAt: now,
        },
      });
      await snapshotHistory(state.data.entityType, periodId, userId, tx);
      return serviceOk({
        success: true as const,
        entityType: state.data.entityType,
        periodId,
        version: normalized.data.expectedVersion + 1,
        changed: true,
      });
    });
    if (persisted.ok && persisted.data.changed) await queueHrDataQualityEvaluation("Employee", [employeeId]);
    return persisted;
  } catch (error) {
    if (error instanceof SerializableTransactionConflictError) {
      return serviceError("人员任职资料已发生变化，请刷新后重试", 409);
    }
    throw error;
  }
}

function automaticReason(entityType: "Employment" | "EDP") {
  return entityType === "Employment" ? "直接修正雇佣期间" : "直接修正任职资料";
}

function isCurrentPeriod(startDate: string | null, endDate: string | null) {
  if (!startDate) return false;
  const today = workspaceBusinessDate(new Date());
  return startDate <= today && (!endDate || endDate >= today);
}
