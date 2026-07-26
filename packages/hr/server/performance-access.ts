import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import type { HrPerformanceContributionTarget } from "./performance-audience";

const HR_PERFORMANCE_RESOURCE_KEY = "hr.performance";

export async function canReadHrPerformanceSummary(userId: number) {
  const [hasExactRead, canApprove, canReject] = await Promise.all([
    evaluatePermissionAction(userId, HR_PERFORMANCE_RESOURCE_KEY, "read", {
      grantMatch: { action: "exact", resource: "exact" },
    }),
    evaluatePermissionAction(userId, HR_PERFORMANCE_RESOURCE_KEY, "approve"),
    evaluatePermissionAction(userId, HR_PERFORMANCE_RESOURCE_KEY, "reject"),
  ]);
  return hasExactRead || canApprove || canReject;
}

export async function canReadHrPerformanceEmployee(userId: number, employeeUserId: number | null) {
  return employeeUserId === userId || canReadHrPerformanceSummary(userId);
}

export async function canReadHrPerformanceContributionTarget(
  userId: number,
  target: HrPerformanceContributionTarget,
) {
  if (target.audienceType === "personal" && target.targetId === userId) return true;
  return canReadHrPerformanceSummary(userId);
}

export function hrPerformanceSubmissionSubmitterScope(
  view: "self" | "summary",
  userId: number,
) {
  return view === "self" ? userId : undefined;
}
