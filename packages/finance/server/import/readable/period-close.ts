import type { NormalizedPeriodStatus } from "./types";

export const T6_PERIOD_CLOSE_DERIVATION_VERSION = "t6-GL_mend-bflag-v2";

export function resolveSourcePeriodClosed(
  sourceSystem: string,
  status: NormalizedPeriodStatus | undefined,
): boolean | null {
  if (!status) return null;
  return sourceSystem === "T6" ? status.glMonthEnd : status.accountingClosed;
}

export function assertDeclaredT6AccountingClose(input: {
  year: number;
  cutoffDate: string;
  isAccountingClose: boolean;
  periodStatuses: NormalizedPeriodStatus[];
}) {
  if (!input.isAccountingClose) return;
  const matched = input.cutoffDate.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!matched || Number(matched[1]) !== input.year) return;
  const month = Number(matched[2]);
  const sourceStatus = input.periodStatuses.find((item) => item.month === month);
  if (sourceStatus?.glMonthEnd !== true) {
    throw new Error(`来源包声明 ${input.cutoffDate} 已结账，但 T6 GL_mend.bflag 不是 true`);
  }
}
