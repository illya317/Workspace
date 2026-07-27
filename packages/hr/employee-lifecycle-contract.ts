import { inclusiveBusinessPeriodContains } from "@workspace/platform/contracts/business-temporal";

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
