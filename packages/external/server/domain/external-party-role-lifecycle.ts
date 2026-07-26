import {
  businessDateWindowsOverlap,
  classifyInclusiveBusinessPeriod,
  inclusiveBusinessPeriodToWindow,
  parseBusinessDate,
  shiftBusinessDate,
  type BusinessDate,
  type BusinessTemporalPosition,
} from "@workspace/platform/contracts/business-temporal";

export type ExternalPartyRolePeriodRecordState = "confirmed" | "cancelled" | "unknown";
export type ExternalPartyRolePeriodCommandKind =
  | "baseline"
  | "establish"
  | "schedule"
  | "end-date"
  | "cancel-future"
  | "correct";

export interface ExternalPartyRolePeriodSnapshot {
  id: number;
  roleId: number;
  sequence: number;
  validFrom: string | null;
  validThrough: string | null;
  recordState: string;
  commandKind: string;
  supersedesId: number | null;
  reason: string | null;
  recordedAt?: string;
}

export interface ExternalPartyRolePeriodCreate {
  roleId: number;
  sequence: number;
  validFrom: string | null;
  validThrough: string | null;
  recordState: ExternalPartyRolePeriodRecordState;
  commandKind: ExternalPartyRolePeriodCommandKind;
  supersedesId: number | null;
  reason: string | null;
}

export interface ExternalPartyRolePeriodTimelineItem extends ExternalPartyRolePeriodSnapshot {
  temporalState: BusinessTemporalPosition;
  displayRecordState: ExternalPartyRolePeriodRecordState | "superseded";
  authoritative: boolean;
}

export type ExternalPartyRoleAvailabilityCommand =
  | { kind: "schedule"; validFrom: string | null; validThrough: string | null; reason?: string | null }
  | { kind: "end-date"; effectiveOn: string; reason: string }
  | { kind: "cancel-future"; periodId: number; reason: string }
  | { kind: "correct"; periodId: number; validFrom: string | null; validThrough: string | null; reason: string };

export class ExternalPartyRoleLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalPartyRoleLifecycleError";
  }
}

export function activeExternalPartyRolePeriods(rows: readonly ExternalPartyRolePeriodSnapshot[]) {
  const supersededIds = new Set(rows.map((row) => row.supersedesId).filter((id): id is number => id !== null));
  return rows.filter((row) => row.recordState === "confirmed" && !supersededIds.has(row.id));
}

export function resolveExternalPartyRoleAvailability(
  rows: readonly ExternalPartyRolePeriodSnapshot[],
  asOfDate: string,
) {
  requireDate(asOfDate, "基准日");
  const current = activeExternalPartyRolePeriods(rows).filter((row) => (
    classifyInclusiveBusinessPeriod({ validFrom: row.validFrom, validThrough: row.validThrough }, asOfDate) === "current"
  ));
  if (current.length > 1) throw new ExternalPartyRoleLifecycleError("角色可用期间存在重叠");
  return current[0] ?? null;
}

export function buildExternalPartyRoleAvailabilityTimeline(
  rows: readonly ExternalPartyRolePeriodSnapshot[],
  asOfDate: string,
): ExternalPartyRolePeriodTimelineItem[] {
  requireDate(asOfDate, "基准日");
  const supersededIds = new Set(rows.map((row) => row.supersedesId).filter((id): id is number => id !== null));
  return [...rows]
    .sort((left, right) => right.sequence - left.sequence || right.id - left.id)
    .map((row) => {
      const superseded = supersededIds.has(row.id);
      return {
        ...row,
        temporalState: classifyInclusiveBusinessPeriod(
          { validFrom: row.validFrom, validThrough: row.validThrough },
          asOfDate,
        ),
        displayRecordState: superseded ? "superseded" : normalizeRecordState(row.recordState),
        authoritative: row.recordState === "confirmed" && !superseded,
      };
    });
}

export function buildExternalPartyRoleAvailabilityPlan(input: {
  roleId: number;
  asOfDate: string;
  command: ExternalPartyRoleAvailabilityCommand;
  rows: readonly ExternalPartyRolePeriodSnapshot[];
}): ExternalPartyRolePeriodCreate {
  const asOfDate = requireDate(input.asOfDate, "基准日");
  const nextSequence = Math.max(0, ...input.rows.map((row) => row.sequence)) + 1;
  const authoritative = activeExternalPartyRolePeriods(input.rows);

  if (input.command.kind === "schedule") {
    const period = requirePeriod(input.command.validFrom, input.command.validThrough);
    assertNoOverlap(authoritative, period);
    return {
      roleId: input.roleId,
      sequence: nextSequence,
      validFrom: input.command.validFrom,
      validThrough: input.command.validThrough,
      recordState: "confirmed",
      commandKind: input.rows.length ? "schedule" : "establish",
      supersedesId: null,
      reason: normalizedReason(input.command.reason),
    };
  }

  if (input.command.kind === "end-date") {
    const effectiveOn = requireDate(input.command.effectiveOn, "停用生效日");
    const target = availabilityAtOrNext(authoritative, effectiveOn);
    if (!target) throw new ExternalPartyRoleLifecycleError("该角色在生效日没有可结束的期间");
    const otherFuture = authoritative.some((row) => (
      row.id !== target.id && row.validFrom !== null && row.validFrom >= effectiveOn
    ));
    if (otherFuture) {
      throw new ExternalPartyRoleLifecycleError("停用前请先取消其他待生效期间，避免角色在未来重新启用");
    }
    const targetFrom = target.validFrom ? requireDate(target.validFrom, "期间开始日") : null;
    const cancelFuture = Boolean(targetFrom && targetFrom >= effectiveOn);
    return {
      roleId: input.roleId,
      sequence: nextSequence,
      validFrom: target.validFrom,
      validThrough: cancelFuture ? target.validThrough : shiftBusinessDate(effectiveOn, -1),
      recordState: cancelFuture ? "cancelled" : "confirmed",
      commandKind: cancelFuture ? "cancel-future" : "end-date",
      supersedesId: target.id,
      reason: requireReason(input.command.reason),
    };
  }

  const target = input.rows.find((row) => row.id === input.command.periodId);
  if (!target || !authoritative.some((row) => row.id === target.id)) {
    throw new ExternalPartyRoleLifecycleError("目标可用期间不存在或已被替代");
  }
  if (input.command.kind === "cancel-future") {
    if (!target.validFrom || requireDate(target.validFrom, "期间开始日") <= asOfDate) {
      throw new ExternalPartyRoleLifecycleError("只能取消尚未开始的可用期间");
    }
    return {
      roleId: input.roleId,
      sequence: nextSequence,
      validFrom: target.validFrom,
      validThrough: target.validThrough,
      recordState: "cancelled",
      commandKind: "cancel-future",
      supersedesId: target.id,
      reason: requireReason(input.command.reason),
    };
  }

  const period = requirePeriod(input.command.validFrom, input.command.validThrough);
  assertNoOverlap(authoritative.filter((row) => row.id !== target.id), period);
  return {
    roleId: input.roleId,
    sequence: nextSequence,
    validFrom: input.command.validFrom,
    validThrough: input.command.validThrough,
    recordState: "confirmed",
    commandKind: "correct",
    supersedesId: target.id,
    reason: requireReason(input.command.reason),
  };
}

function availabilityAtOrNext(rows: readonly ExternalPartyRolePeriodSnapshot[], effectiveOn: BusinessDate) {
  const current = rows.find((row) => (
    classifyInclusiveBusinessPeriod({ validFrom: row.validFrom, validThrough: row.validThrough }, effectiveOn) === "current"
  ));
  if (current) return current;
  return rows
    .filter((row) => row.validFrom && row.validFrom >= effectiveOn)
    .sort((left, right) => (left.validFrom || "").localeCompare(right.validFrom || ""))[0] ?? null;
}

function requireDate(value: string, label: string) {
  const parsed = parseBusinessDate(value);
  if (!parsed) throw new ExternalPartyRoleLifecycleError(`${label}格式无效`);
  return parsed;
}

function requirePeriod(validFrom: string | null, validThrough: string | null) {
  const window = inclusiveBusinessPeriodToWindow({ validFrom, validThrough });
  if (!window) throw new ExternalPartyRoleLifecycleError("角色可用期间无效");
  return window;
}

function assertNoOverlap(
  rows: readonly ExternalPartyRolePeriodSnapshot[],
  candidate: NonNullable<ReturnType<typeof inclusiveBusinessPeriodToWindow>>,
) {
  const conflict = rows.some((row) => {
    const window = inclusiveBusinessPeriodToWindow({ validFrom: row.validFrom, validThrough: row.validThrough });
    if (!window) throw new ExternalPartyRoleLifecycleError(`角色可用期间 ${row.id} 无效`);
    return businessDateWindowsOverlap(window, candidate);
  });
  if (conflict) throw new ExternalPartyRoleLifecycleError("角色可用期间与已有期间重叠");
}

function requireReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) throw new ExternalPartyRoleLifecycleError("生命周期操作必须填写原因");
  return normalized;
}

function normalizedReason(reason: string | null | undefined) {
  return reason?.trim() || null;
}

function normalizeRecordState(value: string): ExternalPartyRolePeriodRecordState {
  return value === "confirmed" || value === "cancelled" ? value : "unknown";
}
