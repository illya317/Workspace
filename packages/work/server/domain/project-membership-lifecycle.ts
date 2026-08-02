import {
  businessDateWindowsOverlap,
  classifyInclusiveBusinessPeriod,
  inclusiveBusinessPeriodToWindow,
  parseBusinessDate,
  shiftBusinessDate,
  type BusinessDate,
  type BusinessTemporalPosition,
} from "@workspace/platform/contracts/business-temporal";

export const PROJECT_MEMBERSHIP_RECORD_STATES = [
  "confirmed",
  "cancelled",
  "superseded",
  "voided",
] as const;

export type ProjectMembershipRecordState = typeof PROJECT_MEMBERSHIP_RECORD_STATES[number];

export interface ProjectMembershipVersionSnapshot {
  id: number;
  membershipUid: string;
  sequence: number;
  employeeId: number;
  projectId: number;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  recordState: string;
  changeKind?: string;
  supersedesId?: number | null;
  createdByChangeId?: number | null;
  terminalChangeId?: number | null;
  reason?: string | null;
  editedBy?: number | null;
  editedAt?: Date | string | null;
  version: number;
}

export interface ProjectMembershipVersionCreate {
  membershipUid: string;
  sequence: number;
  employeeId: number;
  projectId: number;
  role: string;
  startDate: string | null;
  endDate: string | null;
  recordState: "confirmed";
  changeKind: "initial" | "scheduled" | "role_change" | "correction" | "rejoin";
  supersedesId?: number;
  reason?: string | null;
}

export interface ProjectMembershipVersionUpdate {
  id: number;
  expectedVersion: number;
  data: {
    endDate?: string | null;
    recordState?: "cancelled" | "superseded" | "voided";
    reason?: string | null;
  };
}

export interface ProjectMembershipMutationPlan {
  commandKind: "schedule" | "change-role" | "correct" | "end-date" | "cancel-future";
  membershipUid: string;
  employeeId: number;
  projectId: number;
  effectiveOn: BusinessDate | null;
  sourceBefore?: ProjectMembershipVersionSnapshot;
  sourceUpdate?: ProjectMembershipVersionUpdate;
  create?: ProjectMembershipVersionCreate;
}

export class ProjectMembershipLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectMembershipLifecycleError";
  }
}

export function projectMembershipTemporalState(
  row: Pick<ProjectMembershipVersionSnapshot, "startDate" | "endDate" | "recordState">,
  asOf: string,
): BusinessTemporalPosition {
  if (row.recordState !== "confirmed") return parseBusinessDate(asOf) ? "past" : "invalid";
  return classifyInclusiveBusinessPeriod({ validFrom: row.startDate, validThrough: row.endDate }, asOf);
}

export function buildProjectMembershipSchedulePlan(input: {
  membershipUid: string;
  employeeId: number;
  projectId: number;
  role: string;
  startDate: string | null;
  endDate: string | null;
  reason?: string | null;
}, existing: readonly ProjectMembershipVersionSnapshot[]): ProjectMembershipMutationPlan {
  const window = requirePeriod(input.startDate, input.endDate);
  assertNoConfirmedOverlap(existing, input.employeeId, input.projectId, window);
  const prior = existing
    .filter((row) => row.employeeId === input.employeeId && row.projectId === input.projectId)
    .sort((left, right) => right.sequence - left.sequence)[0];
  return {
    commandKind: "schedule",
    membershipUid: input.membershipUid,
    employeeId: input.employeeId,
    projectId: input.projectId,
    effectiveOn: input.startDate ? requireDate(input.startDate, "开始日期") : null,
    create: {
      membershipUid: input.membershipUid,
      sequence: 1,
      employeeId: input.employeeId,
      projectId: input.projectId,
      role: input.role,
      startDate: input.startDate,
      endDate: input.endDate,
      recordState: "confirmed",
      changeKind: prior ? "rejoin" : input.startDate ? "scheduled" : "initial",
      reason: input.reason,
    },
  };
}

export function buildProjectMembershipRoleChangePlan(input: {
  source: ProjectMembershipVersionSnapshot;
  rowsInSeries: readonly ProjectMembershipVersionSnapshot[];
  nextRole: string;
  effectiveOn: string;
  reason?: string | null;
}): ProjectMembershipMutationPlan {
  assertConfirmed(input.source);
  const effectiveOn = requireDate(input.effectiveOn, "角色生效日");
  assertEffectiveDateTouchesSource(input.source, effectiveOn);
  if ((input.source.role || "") === input.nextRole) {
    throw new ProjectMembershipLifecycleError("项目角色没有变化");
  }
  const sequence = Math.max(...input.rowsInSeries.map((row) => row.sequence), input.source.sequence) + 1;
  const sameDaySupersession = input.source.startDate === effectiveOn;
  return {
    commandKind: "change-role",
    membershipUid: input.source.membershipUid,
    employeeId: input.source.employeeId,
    projectId: input.source.projectId,
    effectiveOn,
    sourceBefore: input.source,
    sourceUpdate: {
      id: input.source.id,
      expectedVersion: input.source.version,
      data: sameDaySupersession
        ? { recordState: "superseded", reason: input.reason }
        : { endDate: shiftBusinessDate(effectiveOn, -1), reason: input.reason },
    },
    create: {
      membershipUid: input.source.membershipUid,
      sequence,
      employeeId: input.source.employeeId,
      projectId: input.source.projectId,
      role: input.nextRole,
      startDate: effectiveOn,
      endDate: input.source.endDate,
      recordState: "confirmed",
      changeKind: "role_change",
      supersedesId: input.source.id,
      reason: input.reason,
    },
  };
}

export function buildProjectMembershipEndPlan(input: {
  source: ProjectMembershipVersionSnapshot;
  effectiveOn: string;
  reason?: string | null;
}): ProjectMembershipMutationPlan {
  assertConfirmed(input.source);
  const effectiveOn = requireDate(input.effectiveOn, "结束生效日");
  const startDate = input.source.startDate ? requireDate(input.source.startDate, "成员开始日期") : null;
  const endDate = input.source.endDate ? requireDate(input.source.endDate, "成员结束日期") : null;
  if (endDate && endDate < effectiveOn) throw new ProjectMembershipLifecycleError("项目成员在该生效日前已经结束");
  const cancelFuture = Boolean(startDate && startDate >= effectiveOn);
  return {
    commandKind: cancelFuture ? "cancel-future" : "end-date",
    membershipUid: input.source.membershipUid,
    employeeId: input.source.employeeId,
    projectId: input.source.projectId,
    effectiveOn,
    sourceBefore: input.source,
    sourceUpdate: {
      id: input.source.id,
      expectedVersion: input.source.version,
      data: cancelFuture
        ? { recordState: "cancelled", reason: input.reason }
        : { endDate: shiftBusinessDate(effectiveOn, -1), reason: input.reason },
    },
  };
}

export function buildProjectMembershipCorrectionPlan(input: {
  source: ProjectMembershipVersionSnapshot;
  rows: readonly ProjectMembershipVersionSnapshot[];
  role?: string;
  startDate: string | null;
  endDate: string | null;
  reason: string;
}): ProjectMembershipMutationPlan {
  assertConfirmed(input.source);
  const window = requirePeriod(input.startDate, input.endDate);
  assertNoConfirmedOverlap(
    input.rows.filter((row) => row.id !== input.source.id),
    input.source.employeeId,
    input.source.projectId,
    window,
  );
  const sequence = Math.max(...input.rows
    .filter((row) => row.membershipUid === input.source.membershipUid)
    .map((row) => row.sequence), input.source.sequence) + 1;
  return {
    commandKind: "correct",
    membershipUid: input.source.membershipUid,
    employeeId: input.source.employeeId,
    projectId: input.source.projectId,
    effectiveOn: input.startDate ? requireDate(input.startDate, "更正开始日期") : null,
    sourceBefore: input.source,
    sourceUpdate: {
      id: input.source.id,
      expectedVersion: input.source.version,
      data: { recordState: "superseded", reason: input.reason },
    },
    create: {
      membershipUid: input.source.membershipUid,
      sequence,
      employeeId: input.source.employeeId,
      projectId: input.source.projectId,
      role: input.role ?? input.source.role ?? "执行负责",
      startDate: input.startDate,
      endDate: input.endDate,
      recordState: "confirmed",
      changeKind: "correction",
      supersedesId: input.source.id,
      reason: input.reason,
    },
  };
}

function requireDate(value: string, label: string) {
  const parsed = parseBusinessDate(value);
  if (!parsed) throw new ProjectMembershipLifecycleError(`${label}格式无效`);
  return parsed;
}

function requirePeriod(startDate: string | null, endDate: string | null) {
  const window = inclusiveBusinessPeriodToWindow({ validFrom: startDate, validThrough: endDate });
  if (!window) throw new ProjectMembershipLifecycleError("项目成员有效期间无效");
  return window;
}

function assertConfirmed(source: ProjectMembershipVersionSnapshot) {
  if (source.recordState !== "confirmed") throw new ProjectMembershipLifecycleError("该项目成员版本已失效");
}

function assertEffectiveDateTouchesSource(source: ProjectMembershipVersionSnapshot, effectiveOn: BusinessDate) {
  if (projectMembershipTemporalState(source, effectiveOn) !== "current") {
    throw new ProjectMembershipLifecycleError("生效日不在该项目成员版本的有效期间内");
  }
}

function assertNoConfirmedOverlap(
  rows: readonly ProjectMembershipVersionSnapshot[],
  employeeId: number,
  projectId: number,
  candidateWindow: NonNullable<ReturnType<typeof inclusiveBusinessPeriodToWindow>>,
) {
  const conflict = rows.find((row) => {
    if (row.employeeId !== employeeId || row.projectId !== projectId || row.recordState !== "confirmed") return false;
    const rowWindow = inclusiveBusinessPeriodToWindow({ validFrom: row.startDate, validThrough: row.endDate });
    if (!rowWindow) throw new ProjectMembershipLifecycleError(`项目成员版本 ${row.id} 的有效期间无效`);
    return businessDateWindowsOverlap(rowWindow, candidateWindow);
  });
  if (conflict) throw new ProjectMembershipLifecycleError("项目成员有效期间与已有记录重叠");
}
