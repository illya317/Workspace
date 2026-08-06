import { checkHRUpdate } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import {
  runSerializableTransaction,
  SerializableTransactionConflictError,
} from "@workspace/platform/server/serializable-transaction";
import { queueHrDataQualityEvaluation } from "./data-quality-trigger";
import {
  buildEmployeeAssignmentCreateCommand,
  buildEmploymentPeriodCreateCommand,
  validateEmployeeAssignmentCreateState,
  validateEmploymentPeriodCreateState,
  type EmployeeAssignmentCreateInput,
  type EmploymentPeriodCreateInput,
} from "./domain/employee-period-create-validation";
import { normalizeTargetAssignment } from "./domain/employee-lifecycle-validation";

type CreateResult = { success: true; id: number; version: number; changed: boolean };

export async function createEmploymentPeriod(
  input: EmploymentPeriodCreateInput & { employeeId?: unknown; userId?: unknown },
): Promise<DomainServiceResult<CreateResult>> {
  const command = mapValidationToServiceResult(buildEmploymentPeriodCreateCommand(input));
  if (!command.ok) return command;
  const access = await allowDirectWrite("hr.roster.employment.create", command.data.userId, "雇佣期间");
  if (!access.ok) return access;
  try {
    const persisted = await runSerializableTransaction(async (tx) => {
      const state = mapValidationToServiceResult(await validateEmploymentPeriodCreateState(tx, command.data));
      if (!state.ok) return state;
      if (state.data.replayId !== null) return serviceOk({ success: true as const, id: state.data.replayId, version: state.data.replayVersion, changed: false });
      const now = new Date();
      const created = await tx.employment.create({
        data: {
          employeeId: command.data.employeeId,
          isActive: isCurrentPeriod(command.data.joinDate, command.data.leaveDate),
          joinDate: command.data.joinDate,
          leaveDate: command.data.leaveDate,
          leaveReason: command.data.leaveReason,
          leaveNote: command.data.leaveNote,
          officeLocation: command.data.officeLocation,
          personnelType: command.data.personnelType,
          rank: command.data.rank,
          title: command.data.title,
          editedBy: command.data.userId,
          editedAt: now,
        },
        select: { id: true, version: true },
      });
      await snapshotHistory("Employment", created.id, command.data.userId, tx);
      return serviceOk({ success: true as const, id: created.id, version: created.version, changed: true });
    });
    if (persisted.ok && persisted.data.changed) await queueHrDataQualityEvaluation("Employee", [command.data.employeeId]);
    return persisted;
  } catch (error) {
    return mapCreateConflict(error, "雇佣期间");
  }
}

export async function createEmployeeAssignment(
  employeeId: number,
  input: EmployeeAssignmentCreateInput,
  userId: number,
): Promise<DomainServiceResult<CreateResult>> {
  const parsed = mapValidationToServiceResult(buildEmployeeAssignmentCreateCommand(employeeId, input, userId));
  if (!parsed.ok) return parsed;
  const access = await allowDirectWrite("hr.roster.employeeAssignment.create", parsed.data.userId, "任职记录");
  if (!access.ok) return access;
  if (!parsed.data.startDate) return serviceError("任职开始日期必填", 400);
  const placement = mapValidationToServiceResult(await normalizeTargetAssignment(
    parsed.data.employeeId,
    parsed.data,
    parsed.data.startDate,
  ));
  if (!placement.ok) return placement;
  const command = {
    ...parsed.data,
    reportingCompanyId: placement.data.reportingCompanyId,
    departmentId: placement.data.departmentId,
    positionId: placement.data.positionId,
    positionReportOverrideId: placement.data.positionReportOverrideId,
    reportToPositionId: parsed.data.reportToPositionId ?? placement.data.reportToPositionId,
  };
  try {
    const persisted = await runSerializableTransaction(async (tx) => {
      const state = mapValidationToServiceResult(await validateEmployeeAssignmentCreateState(tx, command));
      if (!state.ok) return state;
      if (state.data.replayId !== null) return serviceOk({ success: true as const, id: state.data.replayId, version: state.data.replayVersion, changed: false });
      const now = new Date();
      const created = await tx.eDP.create({
        data: {
          employeeId: command.employeeId,
          reportingCompanyId: command.reportingCompanyId,
          departmentId: command.departmentId,
          positionId: command.positionId,
          positionReportOverrideId: command.positionReportOverrideId,
          isPrimary: command.isPrimary,
          startDate: command.startDate,
          endDate: command.endDate,
          reportToPositionId: command.reportToPositionId,
          allocationWeight: command.allocationWeight,
          editedBy: userId,
          editedAt: now,
        },
        select: { id: true, version: true },
      });
      await snapshotHistory("EDP", created.id, userId, tx);
      return serviceOk({ success: true as const, id: created.id, version: created.version, changed: true });
    });
    if (persisted.ok && persisted.data.changed) await queueHrDataQualityEvaluation("Employee", [employeeId]);
    return persisted;
  } catch (error) {
    return mapCreateConflict(error, "任职记录");
  }
}

async function allowDirectWrite(actionKey: string, userId: number, label: string) {
  if (!(await checkHRUpdate(userId, "hr.roster"))) return serviceError(`无权限新增${label}`, 403);
  return assertBusinessActionDirectExecutionAllowed({
    businessActionKey: actionKey,
    actorUserId: userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: `${label}新增已配置为必须走流程，请从统一流程入口提交`,
  });
}

function mapCreateConflict(error: unknown, label: string): DomainServiceResult<CreateResult> {
  if (error instanceof SerializableTransactionConflictError) return serviceError(`${label}已发生变化，请刷新后重试`, 409);
  throw error;
}

function isCurrentPeriod(startDate: string, endDate: string | null) {
  const today = workspaceBusinessDate(new Date());
  return startDate <= today && (!endDate || endDate >= today);
}
