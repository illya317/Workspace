import { prisma } from "@workspace/platform/server/prisma";

import { generateFinanceReport } from "./report-generator";
import { generateDirectStatementReport } from "./reports/direct";
import { consolidationMonthEndDate } from "./consolidation-period-rates";
import { ConsolidationSnapshotError } from "./consolidation-snapshot-error";

export interface RetainedEarningsOpeningPolicy {
  openingDate: string;
  openingRetainedEarningsCny: number;
  evidence: string;
}

function frozenPayloadLine(payload: unknown, section: "equity" | "lines", lineCode: string) {
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  const rows = root && Array.isArray(root[section]) ? root[section] : [];
  const line = rows.find((value) => (
    value && typeof value === "object" && !Array.isArray(value)
    && (value as { lineCode?: unknown }).lineCode === lineCode
  )) as { amount?: unknown } | undefined;
  return line ?? null;
}

export async function generateFrozenEquityRollforward(
  companyCode: string,
  throughYear: number,
  throughMonth: number,
  policy?: RetainedEarningsOpeningPolicy,
) {
  if (!policy || !/^\d{4}-12-31$/.test(policy.openingDate)
    || !Number.isFinite(policy.openingRetainedEarningsCny)
    || !policy.evidence.trim()) {
    throw new ConsolidationSnapshotError("CAD 权益滚算缺少经批准的上年末人民币未分配利润或证据", 409);
  }
  const expectedOpeningDate = consolidationMonthEndDate(throughYear - 1, 12);
  if (policy.openingDate !== expectedOpeningDate) {
    throw new ConsolidationSnapshotError(`CAD 权益滚算人民币期初基准必须为报表上年末 ${expectedOpeningDate}`, 409);
  }
  const openingResponse = await generateFinanceReport({
    companyCode,
    year: throughYear - 1,
    month: 12,
    periodKind: "month",
    reportType: "balance",
  });
  const openingPayload = await openingResponse.json().catch(() => null);
  const openingRetained = frozenPayloadLine(openingPayload, "equity", "undistributedProfit");
  const openingOriginalAmount = Number(openingRetained?.amount);
  if (!openingResponse.ok || !Number.isFinite(openingOriginalAmount)) {
    throw new ConsolidationSnapshotError(`CAD 权益滚算无法从加拿大账取得 ${policy.openingDate} 原币未分配利润`, 409);
  }
  const firstPeriodDate = `${throughYear}-01-01`;
  const throughDate = consolidationMonthEndDate(throughYear, throughMonth);
  const periods = await prisma.financePeriod.findMany({
    where: { companyCode, startDate: { gte: firstPeriodDate, lte: throughDate } },
    select: { year: true, month: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  assertConsecutiveOpeningPeriods(throughYear, throughMonth, periods);
  const rollforward: Array<{
    year: number;
    month: number;
    targetDate: string;
    closingOriginalAmount: number;
    netProfitOriginalAmount: number;
    otherAdjustmentOriginalAmount: number;
  }> = [];
  let previousClosing = money(openingOriginalAmount);
  for (const period of periods) {
    const [balanceResponse, income] = await Promise.all([
      generateFinanceReport({
        companyCode,
        year: period.year,
        month: period.month,
        periodKind: "month",
        reportType: "balance",
      }),
      generateDirectStatementReport(companyCode, period.year, period.month, "incomeStatement"),
    ]);
    const balancePayload = await balanceResponse.json().catch(() => null);
    const retained = frozenPayloadLine(balancePayload, "equity", "undistributedProfit");
    const netProfit = income.lines.find((line) => line.lineCode === "netProfit");
    const closingOriginalAmount = Number(retained?.amount);
    const netProfitOriginalAmount = Number(netProfit?.currentMonthAmount);
    if (!balanceResponse.ok || !Number.isFinite(closingOriginalAmount) || !Number.isFinite(netProfitOriginalAmount)) {
      throw new ConsolidationSnapshotError(`CAD 权益滚算无法生成 ${period.year}-${String(period.month).padStart(2, "0")} 月事实`, 409);
    }
    const change = money(closingOriginalAmount - previousClosing);
    const otherAdjustmentOriginalAmount = money(change - netProfitOriginalAmount);
    rollforward.push({
      year: period.year,
      month: period.month,
      targetDate: consolidationMonthEndDate(period.year, period.month),
      closingOriginalAmount,
      netProfitOriginalAmount,
      otherAdjustmentOriginalAmount,
    });
    previousClosing = closingOriginalAmount;
  }
  return {
    seed: {
      openingDate: policy.openingDate,
      originalAmount: money(openingOriginalAmount),
      openingRetainedEarningsCny: money(policy.openingRetainedEarningsCny),
      evidence: policy.evidence.trim(),
    },
    periods: rollforward,
  };
}

export function assertConsecutiveOpeningPeriods(
  year: number,
  throughMonth: number,
  periods: ReadonlyArray<{ year: number; month: number }>,
) {
  const expected = Array.from({ length: throughMonth }, (_, index) => ({ year, month: index + 1 }));
  const missing = expected.find((item, index) => (
    periods[index]?.year !== item.year || periods[index]?.month !== item.month
  ));
  if (missing || periods.length !== expected.length) {
    const item = missing ?? expected[expected.length - 1]!;
    throw new ConsolidationSnapshotError(
      `CAD 权益滚算在人民币期初后缺少 ${item.year}-${String(item.month).padStart(2, "0")} 月会计期间，不能推测其他调整`,
      409,
    );
  }
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
