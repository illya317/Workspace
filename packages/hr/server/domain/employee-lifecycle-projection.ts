import { shiftBusinessDate } from "@workspace/platform/contracts/business-temporal";
import type {
  EmployeeLifecycleEventType,
  LifecycleAssignmentPeriod,
} from "@workspace/hr/employee-lifecycle-contract";
import { assignmentTemporalPosition } from "./employee-business-temporal";

export type AssignmentProjectionCommand = {
  eventType: EmployeeLifecycleEventType;
  effectiveDate: string;
  sourceAssignment: LifecycleAssignmentPeriod | null;
  targetAssignment: LifecycleAssignmentPeriod | null;
  previousPrimaryAssignment: LifecycleAssignmentPeriod | null;
  previousPrimaryTarget: LifecycleAssignmentPeriod | null;
  restoredPrimaryAssignment: LifecycleAssignmentPeriod | null;
  assignmentEndDate: string | null;
};

export type AssignmentProjectionPeriod = Omit<
  LifecycleAssignmentPeriod,
  "positionId" | "allocationWeight"
> & {
  positionId: number | null;
  allocationWeight: string | null;
};

export function offboardPeriodDisposition(
  row: { startDate?: string | null; endDate?: string | null },
  effectiveDate: string,
) {
  const temporalState = assignmentTemporalPosition(row, effectiveDate);
  if (temporalState === "upcoming") return "cancel" as const;
  if (temporalState === "current") return "close" as const;
  if (
    temporalState === "invalid"
    && (!row.endDate || row.endDate >= effectiveDate)
  ) {
    return "close" as const;
  }
  return "keep" as const;
}

/** Projects assignment periods without mutating any pre-effective historical row. */
export function projectEmployeeAssignmentLifecycle(
  command: AssignmentProjectionCommand,
  rows: AssignmentProjectionPeriod[],
): AssignmentProjectionPeriod[] {
  const source = command.sourceAssignment;
  const target = command.targetAssignment;
  if (command.eventType === "onboard") return target ? [...rows, target] : rows;
  if (command.eventType === "offboard") {
    const endDate = shiftBusinessDate(command.effectiveDate, -1);
    return rows.flatMap((row) => {
      const disposition = offboardPeriodDisposition(row, command.effectiveDate);
      if (disposition === "cancel") return [];
      if (disposition === "close") return [{ ...row, endDate }];
      return [row];
    });
  }
  if (command.eventType === "concurrent_assignment") return target ? [...rows, target] : rows;
  if (!source || !target) return rows;
  if (command.eventType === "primary_change") {
    const previousPrimary = command.previousPrimaryAssignment;
    const previousPrimaryTarget = command.previousPrimaryTarget;
    if (!previousPrimary?.id || !previousPrimaryTarget) return rows;
    const closedIds = new Set([source.id, previousPrimary.id]);
    return [
      ...rows.filter((row) => !row.id || !closedIds.has(row.id)),
      { ...source, endDate: shiftBusinessDate(command.effectiveDate, -1) },
      { ...previousPrimary, endDate: shiftBusinessDate(command.effectiveDate, -1) },
      previousPrimaryTarget,
      target,
      ...(command.restoredPrimaryAssignment ? [command.restoredPrimaryAssignment] : []),
    ];
  }
  const withoutSource = rows.filter((row) => row.id !== source.id);
  const closed = { ...source, endDate: shiftBusinessDate(command.effectiveDate, -1) };
  return [...withoutSource, closed, target];
}
