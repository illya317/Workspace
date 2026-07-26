import {
  classifyInclusiveBusinessPeriod,
  createBusinessTemporalCatalog,
  inclusiveBusinessPeriodContains,
  type BusinessTemporalPosition,
} from "@workspace/platform/contracts/business-temporal";
import {
  HR_ASSIGNMENT_TEMPORAL,
  HR_EMPLOYMENT_TEMPORAL,
} from "../../business-temporal";
import { orderEmploymentsByPreference } from "@workspace/hr/utils/employment-selection";

export { HR_ASSIGNMENT_TEMPORAL, HR_EMPLOYMENT_TEMPORAL };

type AssignmentPeriod = {
  startDate?: string | null;
  endDate?: string | null;
};

type EmploymentPeriod = {
  isActive: boolean;
  joinDate?: string | null;
  leaveDate?: string | null;
};

/** Local catalog: only HR aggregates that already consume the shared temporal contract are registered. */
export const HR_EMPLOYEE_TEMPORAL_CATALOG = createBusinessTemporalCatalog([
  HR_EMPLOYMENT_TEMPORAL,
  HR_ASSIGNMENT_TEMPORAL,
]);

export function assignmentTemporalPosition(
  assignment: AssignmentPeriod,
  asOf: string,
): BusinessTemporalPosition {
  return classifyInclusiveBusinessPeriod({
    validFrom: assignment.startDate,
    validThrough: assignment.endDate,
  }, asOf);
}

export function assignmentPeriodContainsDate(
  assignment: AssignmentPeriod,
  date: string,
) {
  return inclusiveBusinessPeriodContains({
    validFrom: assignment.startDate,
    validThrough: assignment.endDate,
  }, date);
}

export function employmentTemporalPosition(
  employment: EmploymentPeriod,
  asOf: string,
): BusinessTemporalPosition {
  const joinDate = employment.joinDate?.trim() || null;
  const leaveDate = employment.leaveDate?.trim() || null;
  if (!joinDate && !leaveDate) return employment.isActive ? "current" : "past";
  return classifyInclusiveBusinessPeriod({
    validFrom: joinDate,
    validThrough: leaveDate,
  }, asOf);
}

export function employmentPeriodContainsDate(
  employment: EmploymentPeriod,
  date: string,
) {
  return employmentTemporalPosition(employment, date) === "current";
}

export function classifyEmploymentsByPreference<T extends EmploymentPeriod & { id: number }>(
  employments: readonly T[],
  asOf: string,
) {
  return orderEmploymentsByPreference(employments.map((employment) => ({
    employment,
    id: employment.id,
    joinDate: employment.joinDate,
    leaveDate: employment.leaveDate,
    temporalState: employmentTemporalPosition(employment, asOf),
  })));
}

export function selectPreferredEmployment<T extends EmploymentPeriod & { id: number }>(
  employments: readonly T[],
  asOf: string,
): T | null {
  return classifyEmploymentsByPreference(employments, asOf)[0]?.employment ?? null;
}

export function employmentSummaryState(states: readonly BusinessTemporalPosition[]) {
  if (states.includes("invalid")) return "invalid" as const;
  if (states.includes("current")) return "active" as const;
  if (states.includes("upcoming")) return "upcoming" as const;
  return "inactive" as const;
}
