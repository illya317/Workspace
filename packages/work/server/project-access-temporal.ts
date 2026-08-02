import {
  inclusiveBusinessPeriodContains,
} from "@workspace/platform/contracts/business-temporal";
import { WORK_PROJECT_MEMBERSHIP_TEMPORAL } from "../business-temporal";
import { employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";

export { WORK_PROJECT_MEMBERSHIP_TEMPORAL };

export type ProjectMembershipPeriod = {
  employeeId: number;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type EmploymentActivationPeriod = {
  isActive: boolean;
  joinDate: string | null;
  leaveDate: string | null;
};

export type AssignmentScopePeriod = {
  positionId: number | null;
  departmentId: number | null;
  startDate: string | null;
  endDate: string | null;
};

export function dateEnabledPeriodIsActiveOnDate(
  period: { startDate: string | null; endDate: string | null },
  asOfDate: string,
) {
  return inclusiveBusinessPeriodContains({
    validFrom: period.startDate,
    validThrough: period.endDate,
  }, asOfDate);
}

export function projectMembershipIsActiveOnDate(
  membership: Pick<ProjectMembershipPeriod, "startDate" | "endDate">,
  asOfDate: string,
) {
  return dateEnabledPeriodIsActiveOnDate(membership, asOfDate);
}

export function activeProjectMemberRoles(
  memberships: readonly ProjectMembershipPeriod[],
  employeeIds: ReadonlySet<number>,
  asOfDate: string,
) {
  return memberships
    .filter((membership) => (
      employeeIds.has(membership.employeeId)
      && projectMembershipIsActiveOnDate(membership, asOfDate)
    ))
    .map((membership) => membership.role || "");
}

export function employeeHasActiveEmploymentOnDate(
  employments: readonly EmploymentActivationPeriod[],
  asOfDate: string,
) {
  return employments.some((employment) => employmentIsActiveOnDate(employment, asOfDate));
}

export function projectMemberHasActiveEmploymentOnDate(
  membership: Pick<ProjectMembershipPeriod, "startDate" | "endDate">,
  employments: readonly EmploymentActivationPeriod[],
  asOfDate: string,
) {
  return projectMembershipIsActiveOnDate(membership, asOfDate)
    && employeeHasActiveEmploymentOnDate(employments, asOfDate);
}

export function activeEmployeeCreatedProject(
  projectCreatedBy: number | null,
  userId: number,
  activeEmployeeIds: ReadonlySet<number>,
) {
  return activeEmployeeIds.size > 0 && projectCreatedBy === userId;
}

export function activeEmployeeAssignmentScopeIds(
  employees: readonly {
    employments: readonly EmploymentActivationPeriod[];
    positions: readonly AssignmentScopePeriod[];
  }[],
  asOfDate: string,
) {
  const assignments = employees.flatMap((employee) => (
    employeeHasActiveEmploymentOnDate(employee.employments, asOfDate)
      ? employee.positions.filter((position) => dateEnabledPeriodIsActiveOnDate(position, asOfDate))
      : []
  ));
  return {
    positionIds: [...new Set(assignments.flatMap((assignment) => (
      assignment.positionId === null ? [] : [assignment.positionId]
    )))],
    departmentIds: [...new Set(assignments.flatMap((assignment) => (
      assignment.departmentId === null ? [] : [assignment.departmentId]
    )))],
  };
}
