export type WorkPerformanceSubmissionPeriodIssue = {
  message: string;
  status: 400 | 409;
};

export function workPerformanceSubmissionPeriodIssue(input: {
  reportStage: string | null | undefined;
  periodStart: Date | string | null | undefined;
  businessDate: string;
}): WorkPerformanceSubmissionPeriodIssue | null {
  if (input.reportStage !== "final") return null;
  const periodStart = dateKey(input.periodStart);
  if (!periodStart) return { message: "考核周期开始日期无效", status: 400 };
  if (periodStart > input.businessDate) {
    return { message: "未来周期仅可保存计划，暂不能提交绩效", status: 409 };
  }
  return null;
}

function dateKey(value: Date | string | null | undefined) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
