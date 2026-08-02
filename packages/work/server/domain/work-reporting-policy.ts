import {
  evaluateWorkReportingPeriodPolicy,
  type WorkReportingPolicy,
  type WorkReportingSettings,
} from "@workspace/platform/work-reporting-policy";

export type { WorkReportingPolicy } from "@workspace/platform/work-reporting-policy";

export function evaluateWorkReportingPolicy(
  settings: { reporting: WorkReportingSettings },
  period: { type: string; endDate: Date },
  now = new Date(),
): WorkReportingPolicy | null {
  return evaluateWorkReportingPeriodPolicy(settings.reporting, period, now);
}

export function workReportingPolicyError(policy: WorkReportingPolicy) {
  if (!policy.enabled) return policy.periodType === "monthly" ? "月报填报已停用" : "周报填报已停用";
  if (!policy.submissionAllowed) return `本期${policy.periodType === "monthly" ? "月报" : "周报"}已于 ${policy.deadline} 截止`;
  return null;
}
