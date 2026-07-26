import { shiftBusinessDate } from "@workspace/platform/contracts/business-temporal";
import type {
  EmployeeLifecycleEventType,
  LifecycleAssignmentPeriod,
} from "./employee-lifecycle-validation";
import { assignmentTemporalPosition } from "./employee-business-temporal";

export type AssignmentProjectionCommand = {
  eventType: EmployeeLifecycleEventType;
  effectiveDate: string;
  sourceAssignment: LifecycleAssignmentPeriod | null;
  targetAssignment: LifecycleAssignmentPeriod | null;
  sourceRemainingWorkPercent: string | null;
  assignmentEndDate: string | null;
};

export type AssignmentProjectionPeriod = Omit<
  LifecycleAssignmentPeriod,
  "positionId" | "workPercent"
> & {
  positionId: number | null;
  workPercent: string | null;
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
  if (!source || !target) return rows;
  const withoutSource = rows.filter((row) => row.id !== source.id);
  const closed = { ...source, endDate: shiftBusinessDate(command.effectiveDate, -1) };
  if (command.eventType === "transfer" || command.eventType === "reporting_change") {
    return [...withoutSource, closed, target];
  }
  if (!command.sourceRemainingWorkPercent) return rows;
  const continuedSource: LifecycleAssignmentPeriod = {
    ...source,
    id: null,
    version: 0,
    startDate: command.effectiveDate,
    endDate: command.assignmentEndDate ?? source.endDate,
    workPercent: command.sourceRemainingWorkPercent,
  };
  const projected = [...withoutSource, closed, continuedSource, target];
  if (!command.assignmentEndDate) return projected;
  const restoreDate = shiftBusinessDate(command.assignmentEndDate, 1);
  if (source.endDate && restoreDate > source.endDate) return projected;
  return [...projected, {
    ...source,
    id: null,
    version: 0,
    startDate: restoreDate,
  }];
}
