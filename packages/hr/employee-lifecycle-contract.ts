import { inclusiveBusinessPeriodContains } from "@workspace/platform/contracts/business-temporal";

export const EMPLOYEE_LIFECYCLE_EVENT_TYPES = [
  "onboard",
  "transfer",
  "concurrent_assignment",
  "allocation_change",
  "primary_change",
  "reporting_change",
  "offboard",
] as const;

export type EmployeeLifecycleEventType = typeof EMPLOYEE_LIFECYCLE_EVENT_TYPES[number];

export interface EmployeeLifecycleInput {
  eventType?: unknown;
  effectiveDate?: unknown;
  reason?: unknown;
  sourceAssignmentId?: unknown;
  assignmentEndDate?: unknown;
  reportingCompanyId?: unknown;
  departmentId?: unknown;
  positionId?: unknown;
  positionReportOverrideId?: unknown;
  reportToPositionId?: unknown;
  allocationWeight?: unknown;
  officeLocation?: unknown;
  personnelType?: unknown;
  rank?: unknown;
  title?: unknown;
  leaveReason?: unknown;
  leaveNote?: unknown;
}

export interface LifecycleAssignmentPeriod {
  id: number | null;
  version: number;
  employeeId: number;
  reportingCompanyId: number | null;
  departmentId: number | null;
  positionId: number;
  positionReportOverrideId: number | null;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  reportTo: string | null;
  reportToPositionId: number | null;
  allocationWeight: string;
}

export interface EmployeeLifecycleCommand {
  employeeId: number;
  userId: number;
  eventType: EmployeeLifecycleEventType;
  effectiveDate: string;
  reason: string | null;
  sourceAssignment: LifecycleAssignmentPeriod | null;
  targetAssignment: LifecycleAssignmentPeriod | null;
  previousPrimaryAssignment: LifecycleAssignmentPeriod | null;
  previousPrimaryTarget: LifecycleAssignmentPeriod | null;
  restoredPrimaryAssignment: LifecycleAssignmentPeriod | null;
  assignmentEndDate: string | null;
  employment: {
    id: number;
    version: number;
    joinDate: string | null;
    leaveDate: string | null;
    isActive: boolean;
  } | null;
  employmentFields: {
    officeLocation: string | null;
    personnelType: string | null;
    rank: string | null;
    title: string | null;
    leaveReason: string | null;
    leaveNote: string | null;
  };
}

export interface EmployeeLifecycleEmploymentPeriod {
  isActive: boolean;
  joinDate: string | null;
  leaveDate: string | null;
}

export function employeeEmploymentContainsDate(
  employment: EmployeeLifecycleEmploymentPeriod,
  date: string,
) {
  if (!employment.joinDate && !employment.leaveDate) return employment.isActive;
  return inclusiveBusinessPeriodContains({
    validFrom: employment.joinDate,
    validThrough: employment.leaveDate,
  }, date);
}

export function isHydratableOnboardingPlaceholder(
  employments: readonly EmployeeLifecycleEmploymentPeriod[],
  assignmentCount: number,
  lifecycleEventCount: number,
) {
  if (employments.length !== 1 || assignmentCount !== 0 || lifecycleEventCount !== 0) return false;
  const employment = employments[0]!;
  return employment.isActive
    && !employment.joinDate?.trim()
    && !employment.leaveDate?.trim();
}

/**
 * Onboarding creates a new employment period. It is allowed only when no
 * existing employment reaches or follows the requested start date. The sole
 * exception is the pre-lifecycle empty placeholder, which onboarding hydrates
 * instead of duplicating.
 */
export function employeeCanOnboardAt(input: {
  employments: readonly EmployeeLifecycleEmploymentPeriod[];
  assignmentCount: number;
  lifecycleEventCount: number;
  effectiveDate: string;
}) {
  if (isHydratableOnboardingPlaceholder(
    input.employments,
    input.assignmentCount,
    input.lifecycleEventCount,
  )) return true;
  return !input.employments.some((employment) => {
    if (!employment.joinDate && !employment.leaveDate && !employment.isActive) return false;
    return !employment.leaveDate || employment.leaveDate >= input.effectiveDate;
  });
}
