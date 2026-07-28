import type {
  ConsolidatedOutputLine,
  StatementReportType,
} from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

import { consolidatedMoney as money } from "./consolidated-line-amounts";
import {
  recomputeConsolidatedBalance,
  recomputeConsolidatedCashFlow,
} from "./consolidated-output-derivations";
import { cnyPerForeignUnit, historicalEquityTranslation } from "./consolidation-frozen-rates";
import {
  consolidationMonthEndDate,
  consolidationPreviousMonthEndDate,
} from "./consolidation-period-rates";
import type { ConsolidationReplayPackage } from "./consolidation-replay";

type FrozenReportLine = Omit<ConsolidatedOutputLine, "sourceAmount" | "adjustmentAmount">;

const REPORT_LABELS: Record<StatementReportType, string> = {
  balanceSheet: "合并资产负债表",
  incomeStatement: "合并利润表",
  cashFlow: "合并现金流量表",
};
const CNY_CODES = new Set(["CNY", "RMB", "人民币"]);
const HISTORICAL_EQUITY_LINE_CODES = new Set([
  "paidInCapital",
  "otherEquityInstruments",
  "capitalReserve",
  "treasuryStock",
  "surplusReserve",
  "undistributedProfit",
]);
const TRANSLATION_DIFFERENCE_LINE_CODE = "otherComprehensiveIncome";

type EntityTranslationPolicy = {
  currency: "CNY";
} | {
  currency: "CAD";
  entitySnapshotId: number;
  entityLabel: string;
  closingRate: number;
  comparativeClosingRate: number | null;
  closingRates: Record<"current" | "comparative", ReadonlyMap<string, number>>;
  monthlyAverageRates: Record<"current" | "comparative", ReadonlyMap<string, number>>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function frozenPayloadLines(reportType: StatementReportType, reportPayload: unknown): unknown[] | null {
  const envelope = record(reportPayload);
  if (!envelope) return null;
  const status = finiteNumber(envelope.httpStatus);
  if (status !== null && (status < 200 || status >= 300)) return null;
  const payload = record(envelope.payload) ?? envelope;
  if (reportType === "balanceSheet") {
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    const liabilities = Array.isArray(payload.liabilities) ? payload.liabilities : [];
    const equity = Array.isArray(payload.equity) ? payload.equity : [];
    return [...assets, ...liabilities, ...equity];
  }
  return Array.isArray(payload.lines) ? payload.lines : null;
}

function parseFrozenLine(value: unknown): FrozenReportLine | null {
  const row = record(value);
  if (!row) return null;
  const amount = finiteNumber(row.amount);
  const currentMonthAmount = finiteNumber(row.currentMonthAmount);
  const previousAmount = finiteNumber(row.previousAmount);
  const lineCode = typeof row.lineCode === "string" ? row.lineCode.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const section = typeof row.section === "string" ? row.section.trim() : "";
  const side = row.side === "debit" || row.side === "credit" ? row.side : null;
  const direction = row.direction === "in" || row.direction === "out" || row.direction === "net"
    ? row.direction
    : null;
  if (!lineCode || !label || !section || !side || amount === null || previousAmount === null) return null;
  return {
    lineCode,
    label,
    code: typeof row.code === "string" && row.code.trim() ? row.code : null,
    amount,
    ...(currentMonthAmount === null ? {} : { currentMonthAmount }),
    previousAmount,
    section,
    side,
    direction,
    subtract: row.subtract === true,
    isHeader: row.isHeader === true,
    isTotal: row.isTotal === true,
    isGrandTotal: row.isGrandTotal === true,
  };
}

interface FrozenMonthlyPeriod {
  year: number;
  month: number;
  lines: Map<string, { label: string; amount: number }>;
}

function parseFrozenMonthlyPeriods(
  reportPayload: unknown,
  periodBasis: "current" | "comparative",
  expectedYear: number,
  throughMonth: number,
): DomainValidationResult<FrozenMonthlyPeriod[]> {
  const envelope = record(reportPayload);
  const monthlyPeriods = record(envelope?.monthlyPeriods);
  const rawPeriods = monthlyPeriods?.[periodBasis];
  if (!Array.isArray(rawPeriods) || rawPeriods.length !== throughMonth) {
    return failCommand("CAD 利润表及现金流量表来源必须冻结完整逐月发生额", 409, "reportPayload");
  }
  const periods: FrozenMonthlyPeriod[] = [];
  for (let month = 1; month <= throughMonth; month += 1) {
    const matches = rawPeriods.filter((value) => {
      const row = record(value);
      return Number(row?.year) === expectedYear && Number(row?.month) === month;
    });
    const rawPeriod = record(matches[0]);
    if (matches.length !== 1 || !rawPeriod || !Array.isArray(rawPeriod.lines)) {
      return failCommand(`CAD 来源缺少 ${expectedYear}-${String(month).padStart(2, "0")} 月发生额`, 409, "reportPayload");
    }
    const lines = new Map<string, { label: string; amount: number }>();
    for (const value of rawPeriod.lines) {
      const row = record(value);
      const lineCode = typeof row?.lineCode === "string" ? row.lineCode.trim() : "";
      const label = typeof row?.label === "string" ? row.label.trim() : "";
      const amount = finiteNumber(row?.amount);
      if (!lineCode || !label || amount === null || lines.has(lineCode)) {
        return failCommand(`CAD 来源 ${expectedYear}-${String(month).padStart(2, "0")} 月发生额行无效或重复`, 409, "reportPayload");
      }
      lines.set(lineCode, { label, amount });
    }
    periods.push({ year: expectedYear, month, lines });
  }
  return okCommand(periods);
}

function monthlySourceAmount(period: FrozenMonthlyPeriod, line: FrozenReportLine) {
  const source = period.lines.get(line.lineCode);
  return source && source.label === line.label ? source.amount : null;
}

function translateMonthlyLine(
  policy: Extract<EntityTranslationPolicy, { currency: "CAD" }>,
  periods: FrozenMonthlyPeriod[],
  line: FrozenReportLine,
  periodBasis: "current" | "comparative",
): DomainValidationResult<{ accumulated: number; currentMonth: number }> {
  let accumulated = 0;
  let currentMonth = 0;
  for (const period of periods) {
    const sourceAmount = monthlySourceAmount(period, line);
    const targetDate = consolidationMonthEndDate(period.year, period.month);
    const rate = policy.monthlyAverageRates[periodBasis].get(targetDate);
    if (sourceAmount === null) {
      return failCommand(`${policy.entityLabel} 的 ${targetDate} 来源缺少报表行 ${line.lineCode}`, 409, "reportPayload");
    }
    if (rate === undefined && sourceAmount !== 0) {
      return failCommand(`${policy.entityLabel} 缺少 ${targetDate.slice(0, 7)} 月平均汇率`, 409, "rateApplications");
    }
    currentMonth = money(sourceAmount * (rate ?? 1));
    accumulated = money(accumulated + currentMonth);
  }
  return okCommand({ accumulated, currentMonth });
}

function entityAppliedRates(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  periodBasis: "current" | "comparative",
  applicationType: "closing" | "monthlyAverage" = "closing",
): DomainValidationResult<Map<string, number>> {
  const matches = replay.exchangeRates.flatMap((rate) => rate.applications
    .filter((application) => (
      (applicationType === "closing"
        ? rate.rateKind === "closing" || rate.rateKind === "centralParity"
        : rate.rateKind === "monthlyAverage")
      && application.applicationType === applicationType
      && application.periodBasis === periodBasis
      && application.entitySnapshotId === entitySnapshotId
    ))
    .map((application) => ({ rate, application })));
  const byTargetDate = new Map<string, number>();
  for (const { rate, application } of matches) {
    if (byTargetDate.has(application.targetDate)) {
      return failCommand(
        `CAD 实体 ${entitySnapshotId} 的 ${application.targetDate} 重复绑定${applicationType === "closing" ? "期末" : "月平均"}汇率`,
        409,
        "rateApplications",
      );
    }
    const normalized = cnyPerForeignUnit(rate);
    if (!normalized.ok) return normalized;
    byTargetDate.set(application.targetDate, normalized.data);
  }
  return okCommand(byTargetDate);
}

function buildEntityTranslationPolicy(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  functionalCurrency: string,
): DomainValidationResult<EntityTranslationPolicy> {
  if (CNY_CODES.has(functionalCurrency.toUpperCase())) return okCommand({ currency: "CNY" });
  if (functionalCurrency.toUpperCase() !== "CAD") {
    return failCommand(`暂不支持 ${functionalCurrency} 本位币的合并折算`, 409, "functionalCurrency");
  }
  const closingRates = entityAppliedRates(replay, entitySnapshotId, "current");
  if (!closingRates.ok) return closingRates;
  const comparativeClosingRates = entityAppliedRates(replay, entitySnapshotId, "comparative");
  if (!comparativeClosingRates.ok) return comparativeClosingRates;
  const monthlyAverageRates = entityAppliedRates(replay, entitySnapshotId, "current", "monthlyAverage");
  if (!monthlyAverageRates.ok) return monthlyAverageRates;
  const comparativeMonthlyAverageRates = entityAppliedRates(replay, entitySnapshotId, "comparative", "monthlyAverage");
  if (!comparativeMonthlyAverageRates.ok) return comparativeMonthlyAverageRates;
  const periodEnd = consolidationMonthEndDate(replay.batch.year, replay.batch.month);
  const closing = closingRates.data.get(periodEnd) ?? null;
  if (closing === null) {
    return failCommand(`CAD 实体 ${entitySnapshotId} 缺少本期期末汇率`, 409, "rateApplications");
  }
  const entity = replay.entities.find((candidate) => candidate.id === entitySnapshotId);
  return okCommand({
    currency: "CAD",
    entitySnapshotId,
    entityLabel: entity ? `${entity.companyCode} ${entity.companyName}` : String(entitySnapshotId),
    closingRate: closing,
    comparativeClosingRate: closingRates.data.get(consolidationMonthEndDate(replay.batch.year - 1, 12)) ?? null,
    closingRates: { current: closingRates.data, comparative: comparativeClosingRates.data },
    monthlyAverageRates: {
      current: monthlyAverageRates.data,
      comparative: comparativeMonthlyAverageRates.data,
    },
  });
}

function rateForBalanceLine(
  policy: EntityTranslationPolicy,
  line: FrozenReportLine,
  periodBasis: "current" | "comparative",
): DomainValidationResult<number> {
  if (policy.currency === "CNY") return okCommand(1);
  const sourceAmount = periodBasis === "current" ? line.amount : line.previousAmount;
  if (sourceAmount === 0) return okCommand(1);
  const closingRate = periodBasis === "current" ? policy.closingRate : policy.comparativeClosingRate;
  if (closingRate === null) {
    return failCommand(`${policy.entityLabel} 的合并资产负债表含非零上期数，但批次未冻结比较期期末汇率`, 409, "comparativeExchangeRates");
  }
  if (line.section === "equity" && HISTORICAL_EQUITY_LINE_CODES.has(line.lineCode)) {
    return failCommand("历史权益项目必须按逐笔冻结事实折算", 409, "historicalEquityRates");
  }
  return okCommand(closingRate);
}

function translateCashBalanceLine(input: {
  replay: ConsolidationReplayPackage;
  policy: Extract<EntityTranslationPolicy, { currency: "CAD" }>;
  line: FrozenReportLine;
  currentPeriods: FrozenMonthlyPeriod[];
  comparativePeriods: FrozenMonthlyPeriod[];
}): DomainValidationResult<{ amount: number; currentMonthAmount: number; previousAmount: number }> {
  const { replay, policy, line, currentPeriods, comparativePeriods } = input;
  const currentFirst = currentPeriods[0]!;
  const currentLast = currentPeriods[currentPeriods.length - 1]!;
  const comparativeFirst = comparativePeriods[0]!;
  const comparativeLast = comparativePeriods[comparativePeriods.length - 1]!;
  const convert = (source: number | null, targetDate: string, periodBasis: "current" | "comparative") => {
    if (source === null) return failCommand(`${policy.entityLabel} 的现金流量表来源缺少 ${line.lineCode}`, 409, "reportPayload");
    const rate = policy.closingRates[periodBasis].get(targetDate);
    if (rate === undefined && source !== 0) {
      return failCommand(`${policy.entityLabel} 缺少现金余额 ${targetDate} 期末汇率`, 409, "rateApplications");
    }
    return okCommand(money(source * (rate ?? 1)));
  };
  const isOpening = line.lineCode === "openingCash";
  const amount = convert(
    monthlySourceAmount(isOpening ? currentFirst : currentLast, line),
    isOpening ? consolidationMonthEndDate(replay.batch.year - 1, 12) : consolidationMonthEndDate(replay.batch.year, replay.batch.month),
    "current",
  );
  if (!amount.ok) return amount;
  const currentMonthAmount = convert(
    monthlySourceAmount(currentLast, line),
    isOpening ? consolidationPreviousMonthEndDate(replay.batch.year, replay.batch.month) : consolidationMonthEndDate(replay.batch.year, replay.batch.month),
    "current",
  );
  if (!currentMonthAmount.ok) return currentMonthAmount;
  const previousAmount = convert(
    monthlySourceAmount(isOpening ? comparativeFirst : comparativeLast, line),
    isOpening ? consolidationMonthEndDate(replay.batch.year - 2, 12) : consolidationMonthEndDate(replay.batch.year - 1, replay.batch.month),
    "comparative",
  );
  if (!previousAmount.ok) return previousAmount;
  return okCommand({ amount: amount.data, currentMonthAmount: currentMonthAmount.data, previousAmount: previousAmount.data });
}

function retainedEarningsTranslation(input: {
  replay: ConsolidationReplayPackage;
  policy: Extract<EntityTranslationPolicy, { currency: "CAD" }>;
  reportPayload: unknown;
  periodBasis: "current" | "comparative";
}): DomainValidationResult<{ originalAmount: number; translatedAmount: number }> {
  const { replay, policy, reportPayload, periodBasis } = input;
  const envelope = record(reportPayload);
  const rollforward = record(envelope?.equityRollforward);
  const seed = record(rollforward?.seed);
  const openingDate = typeof seed?.openingDate === "string" ? seed.openingDate : "";
  const openingOriginalAmount = finiteNumber(seed?.originalAmount);
  const openingCnyAmount = finiteNumber(seed?.openingRetainedEarningsCny);
  const evidence = typeof seed?.evidence === "string" ? seed.evidence.trim() : "";
  if (!/^\d{4}-12-31$/.test(openingDate)
    || openingOriginalAmount === null
    || openingCnyAmount === null
    || !evidence
    || !Array.isArray(rollforward?.periods)) {
    return failCommand(`${policy.entityLabel} 缺少经批准的上年末人民币未分配利润事实`, 409, "retainedEarningsBaseline");
  }
  const cutoff = periodBasis === "current"
    ? consolidationMonthEndDate(replay.batch.year, replay.batch.month)
    : consolidationMonthEndDate(replay.batch.year - 1, 12);
  if (cutoff < openingDate) {
    return failCommand(`${policy.entityLabel} 的人民币未分配利润基准晚于报表比较期`, 409, "retainedEarningsBaseline");
  }
  if (cutoff === openingDate) {
    return okCommand({
      originalAmount: money(openingOriginalAmount),
      translatedAmount: money(openingCnyAmount),
    });
  }
  let expectedYear = Number(openingDate.slice(0, 4)) + 1;
  let expectedMonth = 1;
  let originalAmount = money(openingOriginalAmount);
  let translatedAmount = money(openingCnyAmount);
  for (const value of rollforward.periods) {
    const period = record(value);
    const year = Number(period?.year);
    const month = Number(period?.month);
    const targetDate = typeof period?.targetDate === "string" ? period.targetDate : "";
    const closingOriginalAmount = finiteNumber(period?.closingOriginalAmount);
    const netProfit = finiteNumber(period?.netProfitOriginalAmount);
    const otherAdjustment = finiteNumber(period?.otherAdjustmentOriginalAmount);
    if (year !== expectedYear || month !== expectedMonth
      || targetDate !== consolidationMonthEndDate(year, month)
      || closingOriginalAmount === null || netProfit === null || otherAdjustment === null) {
      return failCommand(`${policy.entityLabel} 的未分配利润期初后月份不连续或事实无效`, 409, "retainedEarningsRollforward");
    }
    expectedMonth += 1;
    if (expectedMonth === 13) {
      expectedYear += 1;
      expectedMonth = 1;
    }
    if (targetDate > cutoff) continue;
    const movement = money(netProfit + otherAdjustment);
    originalAmount = money(originalAmount + movement);
    if (originalAmount !== money(closingOriginalAmount)) {
      return failCommand(`${policy.entityLabel} 的 ${targetDate} 未分配利润滚算与原币期末余额不一致`, 409, "retainedEarningsRollforward");
    }
    const rate = policy.monthlyAverageRates[periodBasis].get(targetDate);
    if (rate === undefined && movement !== 0) {
      return failCommand(`${policy.entityLabel} 缺少 ${targetDate.slice(0, 7)} 月未分配利润滚算汇率`, 409, "rateApplications");
    }
    translatedAmount = money(translatedAmount + movement * (rate ?? 1));
  }
  const expectedEnd = consolidationMonthEndDate(replay.batch.year, replay.batch.month);
  const lastPeriod = rollforward.periods.at(-1);
  if (record(lastPeriod)?.targetDate !== expectedEnd) {
    return failCommand(`${policy.entityLabel} 的未分配利润滚算未连续覆盖至 ${expectedEnd}`, 409, "retainedEarningsRollforward");
  }
  return okCommand({ originalAmount, translatedAmount });
}

function applyCadTranslationDifference(
  policy: Extract<EntityTranslationPolicy, { currency: "CAD" }>,
  lines: ConsolidatedOutputLine[],
): DomainValidationResult<ConsolidatedOutputLine[]> {
  recomputeConsolidatedBalance(lines);
  const byCode = new Map(lines.map((line) => [line.lineCode, line]));
  const balanceTotal = (lineCode: string, fallbackSections: string[]) => {
    const line = byCode.get(lineCode);
    if (line) return { amount: line.amount, previousAmount: line.previousAmount };
    const sectionTotals = lines.filter((candidate) => candidate.isTotal && fallbackSections.includes(candidate.section));
    if (sectionTotals.length === 0) return null;
    return {
      amount: money(sectionTotals.reduce((sum, line) => sum + line.amount, 0)),
      previousAmount: money(sectionTotals.reduce((sum, line) => sum + line.previousAmount, 0)),
    };
  };
  const assets = balanceTotal("totalAssets", ["currentAssets", "nonCurrentAssets"]);
  const liabilities = balanceTotal("totalLiabilities", ["currentLiabilities", "nonCurrentLiabilities"]);
  const equity = balanceTotal("totalEquity", ["equity"]);
  if (!assets || !liabilities || !equity) {
    return failCommand(`${policy.entityLabel} 缺少计算外币报表折算差额所需的规范合计行`, 409, "translationDifference");
  }
  const difference = money(assets.amount - liabilities.amount - equity.amount);
  const previousDifference = money(assets.previousAmount - liabilities.previousAmount - equity.previousAmount);
  if (difference !== 0 || previousDifference !== 0) {
    const translationLine = byCode.get(TRANSLATION_DIFFERENCE_LINE_CODE);
    if (!translationLine || translationLine.isHeader || translationLine.isTotal || translationLine.isGrandTotal) {
      return failCommand(`${policy.entityLabel} 缺少规范其他综合收益行，无法单独列示外币报表折算差额`, 409, "translationDifference");
    }
    translationLine.amount = money(translationLine.amount + difference);
    translationLine.previousAmount = money(translationLine.previousAmount + previousDifference);
  }
  recomputeConsolidatedBalance(lines);
  for (const line of lines) {
    line.sourceAmount = line.amount;
    line.adjustmentAmount = 0;
    line.previousSourceAmount = line.previousAmount;
    line.previousAdjustmentAmount = 0;
  }
  return okCommand(lines);
}

export function translateFrozenSourceLines(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  functionalCurrency: string,
  reportType: StatementReportType,
  sourceRows: unknown[],
  reportPayload: unknown,
): DomainValidationResult<ConsolidatedOutputLine[]> {
  const policy = buildEntityTranslationPolicy(replay, entitySnapshotId, functionalCurrency);
  if (!policy.ok) return policy;
  const currentPeriods = policy.data.currency === "CAD" && reportType !== "balanceSheet"
    ? parseFrozenMonthlyPeriods(reportPayload, "current", replay.batch.year, replay.batch.month)
    : null;
  if (currentPeriods && !currentPeriods.ok) return currentPeriods;
  const comparativePeriods = policy.data.currency === "CAD" && reportType !== "balanceSheet"
    ? parseFrozenMonthlyPeriods(reportPayload, "comparative", replay.batch.year - 1, replay.batch.month)
    : null;
  if (comparativePeriods && !comparativePeriods.ok) return comparativePeriods;
  const translated: ConsolidatedOutputLine[] = [];
  for (const rawLine of sourceRows) {
    const parsed = parseFrozenLine(rawLine);
    if (!parsed) return failCommand(`${REPORT_LABELS[reportType]}来源缺少规范行标识或借贷方向`, 409, "reportPayload");
    let amount = parsed.amount;
    let currentMonthAmount = parsed.currentMonthAmount;
    let previousAmount = parsed.previousAmount;
    if (policy.data.currency === "CAD" && reportType === "balanceSheet") {
      if (parsed.section === "equity" && HISTORICAL_EQUITY_LINE_CODES.has(parsed.lineCode)) {
        const current = parsed.lineCode === "undistributedProfit"
          ? retainedEarningsTranslation({ replay, policy: policy.data, reportPayload, periodBasis: "current" })
          : historicalEquityTranslation(replay.exchangeRates, entitySnapshotId, "current", parsed.lineCode);
        if (!current.ok) return current;
        const comparative = parsed.lineCode === "undistributedProfit"
          ? retainedEarningsTranslation({ replay, policy: policy.data, reportPayload, periodBasis: "comparative" })
          : historicalEquityTranslation(replay.exchangeRates, entitySnapshotId, "comparative", parsed.lineCode);
        if (!comparative.ok) return comparative;
        const currentOriginal = money(current.data?.originalAmount ?? 0);
        const comparativeOriginal = money(comparative.data?.originalAmount ?? 0);
        if (currentOriginal !== money(parsed.amount) || comparativeOriginal !== money(parsed.previousAmount)) {
          return failCommand(`${policy.data.entityLabel} 的 ${parsed.label} 历史权益事实与单体报表原币余额不一致`, 409, "historicalEquityRates");
        }
        amount = money(current.data?.translatedAmount ?? 0);
        previousAmount = money(comparative.data?.translatedAmount ?? 0);
      } else {
        const rate = rateForBalanceLine(policy.data, parsed, "current");
        if (!rate.ok) return rate;
        const comparativeRate = rateForBalanceLine(policy.data, parsed, "comparative");
        if (!comparativeRate.ok) return comparativeRate;
        amount = money(parsed.amount * rate.data);
        previousAmount = money(parsed.previousAmount * comparativeRate.data);
      }
    } else if (policy.data.currency === "CAD" && currentPeriods?.ok && comparativePeriods?.ok) {
      if (reportType === "cashFlow" && (parsed.lineCode === "openingCash" || parsed.lineCode === "endingCash")) {
        const balances = translateCashBalanceLine({
          replay,
          policy: policy.data,
          line: parsed,
          currentPeriods: currentPeriods.data,
          comparativePeriods: comparativePeriods.data,
        });
        if (!balances.ok) return balances;
        amount = balances.data.amount;
        currentMonthAmount = balances.data.currentMonthAmount;
        previousAmount = balances.data.previousAmount;
      } else {
        const current = translateMonthlyLine(policy.data, currentPeriods.data, parsed, "current");
        if (!current.ok) return current;
        const comparative = translateMonthlyLine(policy.data, comparativePeriods.data, parsed, "comparative");
        if (!comparative.ok) return comparative;
        amount = current.data.accumulated;
        currentMonthAmount = current.data.currentMonth;
        previousAmount = comparative.data.accumulated;
      }
    }
    translated.push({
      ...parsed,
      amount,
      ...(currentMonthAmount === undefined ? {} : { currentMonthAmount: money(currentMonthAmount) }),
      previousAmount,
      sourceAmount: amount,
      adjustmentAmount: 0,
      ...(currentMonthAmount === undefined ? {} : { currentMonthSourceAmount: money(currentMonthAmount), currentMonthAdjustmentAmount: 0 }),
      previousSourceAmount: previousAmount,
      previousAdjustmentAmount: 0,
    });
  }
  if (reportType === "balanceSheet" && policy.data.currency === "CAD") {
    return applyCadTranslationDifference(policy.data, translated);
  }
  if (reportType === "cashFlow" && policy.data.currency === "CAD") {
    recomputeConsolidatedCashFlow(translated);
    for (const line of translated) {
      line.sourceAmount = line.amount;
      line.adjustmentAmount = 0;
      if (line.currentMonthAmount !== undefined) {
        line.currentMonthSourceAmount = line.currentMonthAmount;
        line.currentMonthAdjustmentAmount = 0;
      }
      line.previousSourceAmount = line.previousAmount;
      line.previousAdjustmentAmount = 0;
    }
  }
  return okCommand(translated);
}
