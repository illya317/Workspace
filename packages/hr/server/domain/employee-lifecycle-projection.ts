import type {
  EmployeeLifecycleEventType,
  LifecycleAssignmentPeriod,
} from "./employee-lifecycle-validation";
import { periodContainsDate, shiftIsoDate } from "./employee-lifecycle-validation";

export type AssignmentProjectionCommand = {
  eventType: EmployeeLifecycleEventType;
  effectiveDate: string;
  sourceAssignment: LifecycleAssignmentPeriod | null;
  targetAssignment: LifecycleAssignmentPeriod | null;
  sourceRemainingWorkPercent: string | null;
  assignmentEndDate: string | null;
};

/** Projects assignment periods without mutating any pre-effective historical row. */
export function projectEmployeeAssignmentLifecycle(
  command: AssignmentProjectionCommand,
  rows: LifecycleAssignmentPeriod[],
) {
  const source = command.sourceAssignment;
  const target = command.targetAssignment;
  if (command.eventType === "onboard") return target ? [...rows, target] : rows;
  if (command.eventType === "offboard") {
    const endDate = shiftIsoDate(command.effectiveDate, -1);
    return rows.flatMap((row) => {
      if (row.startDate && row.startDate >= command.effectiveDate) return [];
      if (!periodContainsDate(row, command.effectiveDate)) return [row];
      return [{ ...row, endDate }];
    });
  }
  if (!source || !target) return rows;
  const withoutSource = rows.filter((row) => row.id !== source.id);
  const closed = { ...source, endDate: shiftIsoDate(command.effectiveDate, -1) };
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
  const restoreDate = shiftIsoDate(command.assignmentEndDate, 1);
  if (source.endDate && restoreDate > source.endDate) return projected;
  return [...projected, {
    ...source,
    id: null,
    version: 0,
    startDate: restoreDate,
  }];
}
