import {
  isStatementPeriodEnd,
  statementPeriodStartMonth,
  type StatementPeriodKind,
} from "@workspace/finance/types/statement-period";
import type { FinanceVoucherPeriodScope } from "@workspace/finance/types";

export interface VoucherPeriodFilter {
  year?: number;
  month?: number | { gte: number; lte: number };
}

export interface VoucherBatchPeriodFilter {
  year?: number | { lt: number };
  month?: number | { gte?: number; lte?: number };
  OR?: VoucherBatchPeriodFilter[];
}

export interface VoucherPeriodValidationIssue {
  error: string;
  field: "month" | "periodKind" | "voucherPeriodScope";
}

export function voucherPeriodValidationIssue(input: {
  year?: number;
  month?: number;
  periodKind?: StatementPeriodKind;
  voucherKind?: "standard" | "group";
  voucherPeriodScope?: FinanceVoucherPeriodScope;
}): VoucherPeriodValidationIssue | null {
  const periodKind = input.periodKind ?? "month";
  if (periodKind !== "month" && (input.year === undefined || input.month === undefined)) {
    return { error: "年度或季度筛选必须选择完整会计期间", field: "periodKind" };
  }
  if (input.voucherPeriodScope === "history" && input.voucherKind !== "group") {
    return { error: "历史汇总仅适用于合并明细", field: "voucherPeriodScope" };
  }
  if (input.voucherPeriodScope === "history"
    && (input.year === undefined || input.month === undefined)) {
    return { error: "历史汇总必须选择截止会计期间", field: "voucherPeriodScope" };
  }
  if (input.year !== undefined && input.month !== undefined
    && !isStatementPeriodEnd({ year: input.year, month: input.month }, periodKind)) {
    return {
      error: periodKind === "year" ? "年度必须选择12月作为期末" : "季度必须选择季度末月份",
      field: "month",
    };
  }
  return null;
}

export function voucherPeriodFilter(input: {
  year?: number;
  month?: number;
  periodKind?: StatementPeriodKind;
}): VoucherPeriodFilter {
  const filter: VoucherPeriodFilter = {};
  if (input.year !== undefined) filter.year = input.year;
  if (input.month === undefined) return filter;

  const startMonth = statementPeriodStartMonth(input.month, input.periodKind ?? "month");
  filter.month = startMonth === input.month
    ? input.month
    : { gte: startMonth, lte: input.month };
  return filter;
}

export function voucherBatchPeriodFilter(input: {
  year?: number;
  month?: number;
  periodKind?: StatementPeriodKind;
  voucherPeriodScope?: FinanceVoucherPeriodScope;
}): VoucherBatchPeriodFilter {
  if (input.voucherPeriodScope !== "history"
    || input.year === undefined || input.month === undefined) {
    return voucherPeriodFilter(input);
  }
  return {
    OR: [
      { year: { lt: input.year } },
      { year: input.year, month: { lte: input.month } },
    ],
  };
}
