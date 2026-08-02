import { shiftBusinessDate } from "@workspace/platform/contracts/business-temporal";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { checkHRUpdate } from "@workspace/platform/server/auth";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { businessTemporalRequestFingerprint } from "@workspace/platform/server/business-temporal-idempotency";
import { mapValidationToServiceResult, type DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma } from "@workspace/platform/server/prisma";
import {
  runSerializableTransaction,
  SerializableTransactionConflictError,
} from "@workspace/platform/server/serializable-transaction";
import {
  buildEmployeeLifecycleCommand,
  validateAssignmentTimeline,
  type EmployeeLifecycleCommand,
  type EmployeeLifecycleInput,
  type LifecycleAssignmentPeriod,
} from "./domain/employee-lifecycle-validation";
import {
  offboardPeriodDisposition,
  projectEmployeeAssignmentLifecycle,
} from "./domain/employee-lifecycle-projection";
import { queueHrDataQualityEvaluation } from "./data-quality-trigger";

type LifecycleResult = {
  success: true;
  eventId: number;
  eventType: string;
  effectiveDate: string;
};

type AssignmentChangeResult = {
  createdIds: number[];
  cancelledIds: number[];
  cancelledProjectMembershipIds: number[];
};

class LifecycleConcurrentUpdateError extends Error {}
class LifecycleInvariantError extends Error {}

function employmentOverlapsFrom(
  employment: { isActive: boolean; joinDate: string | null; leaveDate: string | null },
  startDate: string,
) {
  if (!employment.joinDate && !employment.leaveDate && !employment.isActive) return false;
  return !employment.leaveDate || employment.leaveDate >= startDate;
}

function assignmentData(row: LifecycleAssignmentPeriod, userId: number): Prisma.EDPUncheckedCreateInput {
  return {
    employeeId: row.employeeId,
    reportingCompanyId: row.reportingCompanyId,
    departmentId: row.departmentId,
    positionId: row.positionId,
    positionReportOverrideId: row.positionReportOverrideId,
    isPrimary: row.isPrimary,
    startDate: row.startDate,
    endDate: row.endDate,
    reportTo: row.reportTo,
    reportToPositionId: row.reportToPositionId,
    allocationWeight: row.allocationWeight,
    editedBy: userId,
  };
}

async function assertDirectLifecycleExecution(command: EmployeeLifecycleCommand) {
  return assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employeeProfile.lifecycle.record",
    actorUserId: command.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "人员生命周期变更已配置为必须走流程，请从统一流程入口提交",
  });
}

async function updateSourceAssignment(
  tx: Prisma.TransactionClient,
  source: LifecycleAssignmentPeriod,
  effectiveDate: string,
  userId: number,
) {
  if (!source.id) throw new LifecycleConcurrentUpdateError();
  await ensureEditHistoryBaseline("EDP", source.id, userId, tx);
  const updated = await tx.eDP.updateMany({
    where: { id: source.id, employeeId: source.employeeId, version: source.version },
    data: {
      endDate: shiftBusinessDate(effectiveDate, -1),
      editedBy: userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw new LifecycleConcurrentUpdateError();
  await snapshotHistory("EDP", source.id, userId, tx);
}

async function createAssignment(
  tx: Prisma.TransactionClient,
  row: LifecycleAssignmentPeriod,
  userId: number,
) {
  const created = await tx.eDP.create({ data: assignmentData(row, userId), select: { id: true } });
  await snapshotHistory("EDP", created.id, userId, tx);
  return created.id;
}

async function applyAssignmentChange(
  tx: Prisma.TransactionClient,
  command: EmployeeLifecycleCommand,
): Promise<AssignmentChangeResult> {
  const source = command.sourceAssignment;
  const target = command.targetAssignment;
  if (command.eventType === "onboard") {
    return target
      ? { createdIds: [await createAssignment(tx, target, command.userId)], cancelledIds: [], cancelledProjectMembershipIds: [] }
      : { createdIds: [], cancelledIds: [], cancelledProjectMembershipIds: [] };
  }
  if (command.eventType === "offboard") {
    const covering = await tx.eDP.findMany({
      where: { employeeId: command.employeeId },
      select: { id: true, version: true, startDate: true, endDate: true },
    });
    const cancelledIds = covering
      .filter((row) => offboardPeriodDisposition(row, command.effectiveDate) === "cancel")
      .map((row) => row.id);
    const closing = covering.filter((row) => (
      offboardPeriodDisposition(row, command.effectiveDate) === "close"
    ));
    for (const row of [...closing, ...covering.filter((item) => cancelledIds.includes(item.id))]) {
      await ensureEditHistoryBaseline("EDP", row.id, command.userId, tx);
    }
    for (const row of closing) {
      const updated = await tx.eDP.updateMany({
        where: { id: row.id, version: row.version },
        data: {
          endDate: shiftBusinessDate(command.effectiveDate, -1),
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new LifecycleConcurrentUpdateError();
      await snapshotHistory("EDP", row.id, command.userId, tx);
    }
    if (cancelledIds.length > 0) {
      for (const row of covering.filter((item) => cancelledIds.includes(item.id))) {
        await snapshotHistory("EDP", row.id, command.userId, tx);
        const deleted = await tx.eDP.deleteMany({ where: { id: row.id, version: row.version } });
        if (deleted.count !== 1) throw new LifecycleConcurrentUpdateError();
      }
    }
    const projectMemberships = await tx.employeeProject.findMany({
      where: {
        employeeId: command.employeeId,
        recordState: "confirmed",
        OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: command.effectiveDate } }],
      },
      select: {
        id: true,
        version: true,
        membershipUid: true,
        employeeId: true,
        projectId: true,
        startDate: true,
        endDate: true,
        sequence: true,
        role: true,
        recordState: true,
        changeKind: true,
        supersedesId: true,
        createdByChangeId: true,
        terminalChangeId: true,
        reason: true,
        editedBy: true,
        editedAt: true,
      },
    });
    const futureMemberships = projectMemberships.filter((row) => (
      offboardPeriodDisposition(row, command.effectiveDate) === "cancel"
    ));
    const currentMemberships = projectMemberships.filter((row) => (
      offboardPeriodDisposition(row, command.effectiveDate) === "close"
    ));
    for (const membership of [...currentMemberships, ...futureMemberships]) {
      const cancelFuture = futureMemberships.some((candidate) => candidate.id === membership.id);
      const commandKind = cancelFuture ? "cancel-future" : "end-date";
      const requestFingerprint = businessTemporalRequestFingerprint({
        aggregate: "ProjectMembership",
        commandKind,
        request: {
          recordId: membership.id,
          effectiveOn: command.effectiveDate,
          reason: "员工离职联动结束项目成员资格",
          source: "hr.employee.offboard",
        },
      });
      const change = await tx.projectMembershipChange.create({
        data: {
          idempotencyKey: `hr-offboard:${command.employeeId}:${command.effectiveDate}:project-membership:${membership.id}`,
          membershipUid: membership.membershipUid,
          employeeId: membership.employeeId,
          projectId: membership.projectId,
          requestFingerprint,
          commandKind,
          effectiveOn: command.effectiveDate,
          reason: "员工离职联动结束项目成员资格",
          effectsJson: JSON.stringify({
            updatedVersionId: membership.id,
            recordState: cancelFuture ? "cancelled" : "confirmed",
            endDate: cancelFuture ? membership.endDate : shiftBusinessDate(command.effectiveDate, -1),
            source: "hr.employee.offboard",
            sourceBefore: membership,
          }),
          recordedBy: command.userId,
        },
        select: { id: true },
      });
      const updated = await tx.employeeProject.updateMany({
        where: { id: membership.id, version: membership.version, recordState: "confirmed" },
        data: cancelFuture ? {
          recordState: "cancelled",
          reason: "员工离职联动取消未来项目成员资格",
          terminalChangeId: change.id,
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        } : {
          endDate: shiftBusinessDate(command.effectiveDate, -1),
          reason: "员工离职联动结束项目成员资格",
          terminalChangeId: change.id,
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new LifecycleConcurrentUpdateError();
    }
    return {
      createdIds: [],
      cancelledIds,
      cancelledProjectMembershipIds: futureMemberships.map((membership) => membership.id),
    };
  }
  if (command.eventType === "concurrent_assignment") {
    if (!target) throw new LifecycleConcurrentUpdateError();
    return { createdIds: [await createAssignment(tx, target, command.userId)], cancelledIds: [], cancelledProjectMembershipIds: [] };
  }
  if (!source || !target) throw new LifecycleConcurrentUpdateError();
  await updateSourceAssignment(tx, source, command.effectiveDate, command.userId);
  if (command.eventType === "primary_change") {
    const previousPrimary = command.previousPrimaryAssignment;
    const previousPrimaryTarget = command.previousPrimaryTarget;
    if (!previousPrimary || !previousPrimaryTarget) throw new LifecycleConcurrentUpdateError();
    await updateSourceAssignment(tx, previousPrimary, command.effectiveDate, command.userId);
    const createdIds = [
      await createAssignment(tx, previousPrimaryTarget, command.userId),
      await createAssignment(tx, target, command.userId),
    ];
    if (command.restoredPrimaryAssignment) {
      createdIds.push(await createAssignment(tx, command.restoredPrimaryAssignment, command.userId));
    }
    return { createdIds, cancelledIds: [], cancelledProjectMembershipIds: [] };
  }
  return { createdIds: [await createAssignment(tx, target, command.userId)], cancelledIds: [], cancelledProjectMembershipIds: [] };
}

async function applyEmploymentChange(tx: Prisma.TransactionClient, command: EmployeeLifecycleCommand) {
  if (command.eventType === "onboard") {
    const today = workspaceBusinessDate(new Date());
    if (command.employment) {
      await ensureEditHistoryBaseline("Employment", command.employment.id, command.userId, tx);
      const updated = await tx.employment.updateMany({
        where: {
          id: command.employment.id,
          employeeId: command.employeeId,
          version: command.employment.version,
          isActive: true,
          joinDate: null,
          leaveDate: null,
        },
        data: {
          isActive: command.effectiveDate <= today,
          joinDate: command.effectiveDate,
          ...(command.employmentFields.officeLocation === null ? {} : { officeLocation: command.employmentFields.officeLocation }),
          ...(command.employmentFields.personnelType === null ? {} : { personnelType: command.employmentFields.personnelType }),
          ...(command.employmentFields.rank === null ? {} : { rank: command.employmentFields.rank }),
          ...(command.employmentFields.title === null ? {} : { title: command.employmentFields.title }),
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new LifecycleConcurrentUpdateError();
      await snapshotHistory("Employment", command.employment.id, command.userId, tx);
      return command.employment.id;
    }
    const existing = await tx.employment.findMany({
      where: { employeeId: command.employeeId },
      select: { isActive: true, joinDate: true, leaveDate: true },
    });
    if (existing.some((employment) => employmentOverlapsFrom(employment, command.effectiveDate))) {
      throw new LifecycleConcurrentUpdateError();
    }
    const created = await tx.employment.create({
      data: {
        employeeId: command.employeeId,
        isActive: command.effectiveDate <= today,
        joinDate: command.effectiveDate,
        officeLocation: command.employmentFields.officeLocation,
        personnelType: command.employmentFields.personnelType,
        rank: command.employmentFields.rank,
        title: command.employmentFields.title,
        editedBy: command.userId,
      },
      select: { id: true },
    });
    await snapshotHistory("Employment", created.id, command.userId, tx);
    return created.id;
  }
  if (command.eventType !== "offboard" || !command.employment) return command.employment?.id ?? null;
  await ensureEditHistoryBaseline("Employment", command.employment.id, command.userId, tx);
  const updated = await tx.employment.updateMany({
    where: { id: command.employment.id, employeeId: command.employeeId, version: command.employment.version },
    data: {
      isActive: command.effectiveDate > workspaceBusinessDate(new Date()),
      leaveDate: shiftBusinessDate(command.effectiveDate, -1),
      leaveReason: command.employmentFields.leaveReason,
      leaveNote: command.employmentFields.leaveNote,
      editedBy: command.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw new LifecycleConcurrentUpdateError();
  await snapshotHistory("Employment", command.employment.id, command.userId, tx);
  return command.employment.id;
}

async function assertAssignmentProjection(
  tx: Prisma.TransactionClient,
  command: EmployeeLifecycleCommand,
) {
  const existingRows = await tx.eDP.findMany({
    where: { employeeId: command.employeeId },
    select: {
      id: true,
      version: true,
      employeeId: true,
      reportingCompanyId: true,
      departmentId: true,
      positionId: true,
      positionReportOverrideId: true,
      isPrimary: true,
      startDate: true,
      endDate: true,
      reportTo: true,
      reportToPositionId: true,
      allocationWeight: true,
    },
  });
  const projectedRows = projectEmployeeAssignmentLifecycle(command, existingRows);
  const relevantRows = projectedRows.filter((row) => !row.endDate || row.endDate >= command.effectiveDate);
  if (relevantRows.some((row) => !row.positionId || !row.allocationWeight)) {
    throw new LifecycleInvariantError("生效日之后存在岗位、投入权重不完整的任职记录，请先修正资料");
  }
  const periods = relevantRows as Array<typeof relevantRows[number] & { positionId: number; allocationWeight: string }>;
  const timelineError = validateAssignmentTimeline(periods, command.effectiveDate, {
    requireAssignmentAtFromDate: command.eventType !== "offboard" && command.targetAssignment !== null,
  });
  if (timelineError) throw new LifecycleInvariantError(timelineError);
}

export async function recordEmployeeLifecycleEvent(
  employeeId: number,
  input: EmployeeLifecycleInput,
  userId: number,
): Promise<DomainServiceResult<LifecycleResult>> {
  const validated = mapValidationToServiceResult(await buildEmployeeLifecycleCommand(employeeId, input, userId));
  if (!validated.ok) return validated;
  if (!(await checkHRUpdate(userId, "hr.roster"))) return serviceError("无权限", 403);
  const direct = await assertDirectLifecycleExecution(validated.data);
  if (!direct.ok) return direct;

  try {
    const persisted = await runSerializableTransaction(async (tx) => {
      await assertAssignmentProjection(tx, validated.data);
      const employmentId = await applyEmploymentChange(tx, validated.data);
      const assignmentResult = await applyAssignmentChange(tx, validated.data);
      const event = await tx.employeeLifecycleEvent.create({
        data: {
          employeeId,
          eventType: validated.data.eventType,
          effectiveDate: validated.data.effectiveDate,
          reason: validated.data.reason,
          detailsJson: JSON.stringify({
            sourceAssignmentId: validated.data.sourceAssignment?.id ?? null,
            previousPrimaryAssignmentId: validated.data.previousPrimaryAssignment?.id ?? null,
            createdAssignmentIds: assignmentResult.createdIds,
            cancelledAssignmentIds: assignmentResult.cancelledIds,
            cancelledProjectMembershipIds: assignmentResult.cancelledProjectMembershipIds,
            employmentId,
            assignmentEndDate: validated.data.assignmentEndDate,
            targetAssignment: validated.data.targetAssignment,
            employmentFields: validated.data.employmentFields,
          }),
          recordedByUserId: userId,
        },
        select: { id: true },
      });
      return serviceOk({
        success: true as const,
        eventId: event.id,
        eventType: validated.data.eventType,
        effectiveDate: validated.data.effectiveDate,
      });
    });
    await queueHrDataQualityEvaluation("Employee", [employeeId]);
    return persisted;
  } catch (error) {
    if (error instanceof LifecycleInvariantError) return serviceError(error.message, 409);
    if (error instanceof LifecycleConcurrentUpdateError || error instanceof SerializableTransactionConflictError) {
      return serviceError("人员任职已发生变化，请刷新后重试", 409);
    }
    throw error;
  }
}
