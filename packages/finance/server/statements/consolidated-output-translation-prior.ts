import type {
  ConsolidatedOutputLine,
  ConsolidationPriorLineReference,
  ConsolidationPriorReference,
  ConsolidationPriorReferences,
  StatementReportType,
} from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { consolidatedMoney as money } from "./consolidated-line-amounts";
import type { TranslationTracePolicy } from "./consolidated-output-translation-traces";
import type { ConsolidationReplayPackage } from "./consolidation-replay";

export type FrozenReportLine = Omit<ConsolidatedOutputLine, "sourceAmount" | "adjustmentAmount">;

export type PriorReferencedPeriod = "current" | "currentMonth" | "comparative";

export interface PriorReferenceContext {
  /** 本报表比较期列的引用行:资产负债表取上年年末批次,利润表/现金流量表取上年同月批次。 */
  comparativeLines: readonly ConsolidationPriorLineReference[] | undefined;
  yearOpeningCashFlow: readonly ConsolidationPriorLineReference[] | undefined;
  monthOpeningCashFlow: readonly ConsolidationPriorLineReference[] | undefined;
  referencedPeriods: Map<string, Set<PriorReferencedPeriod>>;
  mark(lineCode: string, period: PriorReferencedPeriod): void;
}

export function buildPriorReferenceContext(input: {
  replay: ConsolidationReplayPackage;
  entitySnapshotId: number;
  reportType: StatementReportType;
  priorReferences?: ConsolidationPriorReferences;
}): PriorReferenceContext {
  const companyId = input.replay.entities.find((entity) => entity.id === input.entitySnapshotId)?.companyId;
  const company = (reference: ConsolidationPriorReference | null | undefined) =>
    companyId === undefined ? undefined : reference?.companies[companyId];
  const yearOpening = company(input.priorReferences?.yearOpening);
  const comparativePeriod = company(input.priorReferences?.comparativePeriod);
  const monthOpening = company(input.priorReferences?.monthOpening);
  const referencedPeriods = new Map<string, Set<PriorReferencedPeriod>>();
  return {
    comparativeLines: input.reportType === "balanceSheet"
      ? yearOpening?.balanceSheet
      : comparativePeriod?.[input.reportType],
    yearOpeningCashFlow: yearOpening?.cashFlow,
    monthOpeningCashFlow: monthOpening?.cashFlow,
    referencedPeriods,
    mark(lineCode, period) {
      const periods = referencedPeriods.get(lineCode) ?? new Set<PriorReferencedPeriod>();
      periods.add(period);
      referencedPeriods.set(lineCode, periods);
    },
  };
}

/**
 * 解析上期批次输出引用:返回 null 表示该实体未被此引用覆盖(回退汇率路径);
 * 覆盖但缺行时原币非零 failCommand、为零按零处理;命中且原币勾稽不一致 failCommand。
 */
export function resolvePriorLineReference(
  priorLines: readonly ConsolidationPriorLineReference[] | null | undefined,
  lookupLineCode: string,
  label: string,
  originalAmount: number,
  entityLabel: string,
  periodLabel: string,
): DomainValidationResult<{ cnyAmount: number; referenced: boolean }> | null {
  if (!priorLines) return null;
  const reference = priorLines.find((line) => line.lineCode === lookupLineCode);
  if (!reference) {
    if (money(originalAmount) !== 0) {
      return failCommand(
        `${entityLabel} 的${label}在上期批次输出中缺少对应行，无法引用${periodLabel}已折算数`,
        409,
        "priorReference",
      );
    }
    return okCommand({ cnyAmount: 0, referenced: false });
  }
  if (reference.sourceAmount !== undefined
    && Math.abs(money(originalAmount - reference.sourceAmount)) >= 0.005) {
    return failCommand(
      `${entityLabel} 的${label}${periodLabel}原币 ${money(originalAmount).toFixed(2)} 与上期批次输出原币 ${money(reference.sourceAmount).toFixed(2)} 不一致，不能引用上期已折算数`,
      409,
      "priorReference",
    );
  }
  return okCommand({ cnyAmount: money(reference.cnyAmount), referenced: true });
}

function cashPointDate(year: number, month: number, kind: "yearOpening" | "monthOpening") {
  if (kind === "yearOpening") return `${year - 1}-12-31`;
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

function monthEndDate(year: number, month: number) {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 折算现金流量表 openingCash/endingCash 行:
 * 比较期列统一引用上年同月批次本期列;期初现金本期/本月列引用上年年末/上月批次的 endingCash;
 * 无引用覆盖时回退期末汇率与时点汇率(原行为)。
 */
export function translateCashPointLine(input: {
  parsed: FrozenReportLine;
  policy: Extract<TranslationTracePolicy, { currency: "CAD" }>;
  year: number;
  month: number;
  ctx: PriorReferenceContext;
}): DomainValidationResult<ConsolidatedOutputLine> {
  const { parsed, policy, ctx } = input;
  const currentDate = parsed.lineCode === "openingCash"
    ? cashPointDate(input.year, input.month, "yearOpening")
    : monthEndDate(input.year, input.month);
  const comparativeDate = parsed.lineCode === "openingCash"
    ? cashPointDate(input.year - 1, input.month, "yearOpening")
    : monthEndDate(input.year - 1, input.month);
  const currentMonthDate = cashPointDate(input.year, input.month, "monthOpening");
  // 比较期列(含 openingCash/endingCash)统一引用上年同月批次本期列。
  const priorComparative = resolvePriorLineReference(
    ctx.comparativeLines,
    parsed.lineCode,
    parsed.label,
    parsed.previousAmount,
    policy.entityLabel,
    "比较期",
  );
  if (priorComparative && !priorComparative.ok) return priorComparative;
  // 本期期初现金引用上年年末批次的 endingCash 本期列。
  const priorCurrent = parsed.lineCode === "openingCash"
    ? resolvePriorLineReference(
      ctx.yearOpeningCashFlow,
      "endingCash",
      parsed.label,
      parsed.amount,
      policy.entityLabel,
      "本期期初",
    )
    : null;
  if (priorCurrent && !priorCurrent.ok) return priorCurrent;
  // 本月初现金引用上月批次的 endingCash 本期列;无引用回退时点汇率。
  const priorCurrentMonth = parsed.lineCode === "openingCash" && parsed.currentMonthAmount !== undefined
    ? resolvePriorLineReference(
      ctx.monthOpeningCashFlow,
      "endingCash",
      parsed.label,
      parsed.currentMonthAmount,
      policy.entityLabel,
      "本月初",
    )
    : null;
  if (priorCurrentMonth && !priorCurrentMonth.ok) return priorCurrentMonth;
  const usePriorCurrent = priorCurrent?.ok === true;
  const usePriorComparative = priorComparative?.ok === true;
  const usePriorCurrentMonth = priorCurrentMonth?.ok === true;
  const currentRate = usePriorCurrent || parsed.amount === 0 ? 1
    : parsed.lineCode === "endingCash" ? policy.closingRate : policy.cashPointRates.current.get(currentDate);
  const comparativeRate = usePriorComparative || parsed.previousAmount === 0 ? 1
    : parsed.lineCode === "endingCash" ? policy.comparativeClosingRate : policy.cashPointRates.comparative.get(comparativeDate);
  const currentMonthRate = usePriorCurrentMonth || (parsed.currentMonthAmount ?? 0) === 0 ? 1
    : parsed.lineCode === "endingCash" ? policy.closingRate : policy.cashPointRates.current.get(currentMonthDate);
  if (!currentRate || !comparativeRate || !currentMonthRate) {
    return failCommand(`${policy.entityLabel} 现金余额缺少对应时点汇率`, 409, "rateApplications");
  }
  const currentCny = priorCurrent && priorCurrent.ok
    ? priorCurrent.data.cnyAmount
    : money(parsed.amount * currentRate);
  const comparativeCny = priorComparative && priorComparative.ok
    ? priorComparative.data.cnyAmount
    : money(parsed.previousAmount * comparativeRate);
  const currentMonthCny = parsed.currentMonthAmount === undefined
    ? undefined
    : priorCurrentMonth && priorCurrentMonth.ok
      ? priorCurrentMonth.data.cnyAmount
      : money(parsed.currentMonthAmount * currentMonthRate);
  if (priorCurrent?.ok && priorCurrent.data.referenced) ctx.mark(parsed.lineCode, "current");
  if (priorComparative?.ok && priorComparative.data.referenced) ctx.mark(parsed.lineCode, "comparative");
  if (priorCurrentMonth?.ok && priorCurrentMonth.data.referenced) ctx.mark(parsed.lineCode, "currentMonth");
  return okCommand({
    ...parsed,
    amount: currentCny,
    ...(currentMonthCny === undefined ? {} : {
      currentMonthAmount: currentMonthCny,
      currentMonthSourceAmount: currentMonthCny,
      currentMonthAdjustmentAmount: 0,
    }),
    previousAmount: comparativeCny,
    sourceAmount: currentCny,
    adjustmentAmount: 0,
    previousSourceAmount: comparativeCny,
    previousAdjustmentAmount: 0,
  });
}
