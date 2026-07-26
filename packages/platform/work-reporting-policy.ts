export const WORK_REPORTING_SETTINGS_CONFIG_KEY = "work.okr.control.settings";
export const WORK_OKR_CONTROL_CAPABILITY_KEY = "work.tasks.cycleFlow";

export type WorkReportingPeriodType = "weekly" | "monthly";
export type WorkReportingPeriodSettings = {
  enabled: boolean;
  submitDeadlineOffsetDays: number;
  allowLateSubmission: boolean;
};
export type WorkReportingSettings = Record<WorkReportingPeriodType, WorkReportingPeriodSettings>;
export type WorkReportingPolicy = {
  periodType: WorkReportingPeriodType;
  enabled: boolean;
  deadline: string;
  isLate: boolean;
  allowLateSubmission: boolean;
  submissionAllowed: boolean;
};
export type WorkReportCollectionStatus =
  | "pending"
  | "submitted_on_time"
  | "submitted_late"
  | "overdue"
  | "closed"
  | "not_enabled"
  | "not_available";

export const DEFAULT_WORK_REPORTING_SETTINGS: WorkReportingSettings = {
  weekly: { enabled: true, submitDeadlineOffsetDays: 1, allowLateSubmission: true },
  monthly: { enabled: true, submitDeadlineOffsetDays: 3, allowLateSubmission: true },
};

export function normalizeWorkReportingSettings(value: unknown): WorkReportingSettings {
  const source = objectValue(value);
  const reporting = objectValue(source.reporting ?? source);
  return {
    weekly: normalizePeriodSettings(reporting.weekly, DEFAULT_WORK_REPORTING_SETTINGS.weekly),
    monthly: normalizePeriodSettings(reporting.monthly, DEFAULT_WORK_REPORTING_SETTINGS.monthly),
  };
}

export function evaluateWorkReportingPeriodPolicy(
  settings: WorkReportingSettings,
  period: { type: string; endDate: Date },
  now = new Date(),
): WorkReportingPolicy | null {
  if (period.type !== "weekly" && period.type !== "monthly") return null;
  const rule = settings[period.type];
  const deadline = reportingDeadline(period.endDate, rule.submitDeadlineOffsetDays);
  const isLate = now.getTime() > deadline.getTime();
  return {
    periodType: period.type,
    enabled: rule.enabled,
    deadline: deadline.toISOString().slice(0, 10),
    isLate,
    allowLateSubmission: rule.allowLateSubmission,
    submissionAllowed: rule.enabled && (!isLate || rule.allowLateSubmission),
  };
}

export function classifyWorkReportCollectionStatus(
  policy: WorkReportingPolicy,
  submittedAt: Date | string | null,
): WorkReportCollectionStatus {
  if (!policy.enabled) return "not_enabled";
  if (submittedAt) {
    const submitted = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
    if (!Number.isNaN(submitted.getTime())) {
      return submitted.getTime() > reportingDeadlineFromDate(policy.deadline).getTime()
        ? "submitted_late"
        : "submitted_on_time";
    }
  }
  if (!policy.isLate) return "pending";
  return policy.allowLateSubmission ? "overdue" : "closed";
}

function normalizePeriodSettings(value: unknown, fallback: WorkReportingPeriodSettings): WorkReportingPeriodSettings {
  const source = objectValue(value);
  const submitDeadlineOffsetDays = Number(source.submitDeadlineOffsetDays);
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    submitDeadlineOffsetDays: Number.isInteger(submitDeadlineOffsetDays)
      && submitDeadlineOffsetDays >= 0
      && submitDeadlineOffsetDays <= 31
      ? submitDeadlineOffsetDays
      : fallback.submitDeadlineOffsetDays,
    allowLateSubmission: typeof source.allowLateSubmission === "boolean"
      ? source.allowLateSubmission
      : fallback.allowLateSubmission,
  };
}

function reportingDeadline(periodEnd: Date, offsetDays: number) {
  const deadline = new Date(periodEnd);
  deadline.setUTCDate(deadline.getUTCDate() + offsetDays);
  deadline.setUTCHours(23, 59, 59, 999);
  return deadline;
}

function reportingDeadlineFromDate(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
