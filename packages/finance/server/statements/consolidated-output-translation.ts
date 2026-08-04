import type {
  ConsolidatedOutputLine,
  ConsolidationPriorReferences,
  StatementReportType,
} from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { recomputeBalance } from "./consolidated-output-balance-lines";
import {
  monthlyTranslatedAmount,
  reconcileCadCashFlowTranslation,
  type CashFlowMonthlySource,
} from "./consolidated-output-cash-flow";
import {
  consolidatedMoney as money,
  sumLineAmounts,
  translatedCurrentMonthAmounts,
} from "./consolidated-line-amounts";
import { cnyPerForeignUnit, historicalEquityRate } from "./consolidation-frozen-rates";
import type { ConsolidationReplayPackage } from "./consolidation-replay";
import {
  recomputeTranslatedIncome,
  translatedEntityNetProfit,
} from "./consolidated-output-income-translation";
import {
  attachTranslationTraces,
  type TranslationTracePolicy,
} from "./consolidated-output-translation-traces";
import {
  buildPriorReferenceContext,
  resolvePriorLineReference,
  translateCashPointLine,
  type FrozenReportLine,
} from "./consolidated-output-translation-prior";

export { monthlyTranslatedAmount } from "./consolidated-output-cash-flow";
export type { FrozenReportLine } from "./consolidated-output-translation-prior";

const REPORT_LABELS: Record<StatementReportType, string> = {
  balanceSheet: "合并资产负债表",
  incomeStatement: "合并利润表",
  cashFlow: "合并现金流量表",
};

const CNY_CODES = new Set(["CNY", "RMB", "人民币"]);
type HistoricalCapitalApplicationLineCode = "paidInCapital" | "capitalReserve";
type HistoricalEquityLineCode = HistoricalCapitalApplicationLineCode | "otherEquityInstruments" | "treasuryStock";

const HISTORICAL_CAPITAL_LINE_CODES = new Set<HistoricalEquityLineCode>([
  "paidInCapital",
  "otherEquityInstruments",
  "capitalReserve",
  "treasuryStock",
]);
const TRANSLATION_DIFFERENCE_LINE_CODE = "otherComprehensiveIncome";

type EntityTranslationPolicy = TranslationTracePolicy;

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

function payloadMonthlyFlows(reportPayload: unknown, periodBasis: "current" | "comparative"): CashFlowMonthlySource[] | null {
  const envelope = record(reportPayload);
  const facts = record(envelope?.translationFacts);
  const monthlyFlows = record(facts?.monthlyFlows);
  const rows = monthlyFlows?.[periodBasis];
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((value) => {
    const row = record(value);
    if (typeof row?.periodEnd !== "string" || !Array.isArray(row.lines)) return [];
    const lines = row.lines.flatMap((item) => {
      const line = record(item);
      const amount = finiteNumber(line?.amount);
      return typeof line?.lineCode === "string" && amount !== null
        ? [{ lineCode: line.lineCode, amount }]
        : [];
    });
    return [{ periodEnd: row.periodEnd, lines }];
  });
}

function retainedEarningsOpening(reportPayload: unknown) {
  const envelope = record(reportPayload);
  const facts = record(envelope?.translationFacts);
  const opening = record(facts?.retainedEarningsOpening);
  const amount = finiteNumber(opening?.openingAmount);
  return typeof opening?.openingDate === "string"
    && typeof opening?.presentationCurrencyCode === "string"
    && typeof opening?.evidence === "string"
    && amount !== null
    ? { openingDate: opening.openingDate, currencyCode: opening.presentationCurrencyCode, amount, evidence: opening.evidence }
    : null;
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

function entityAppliedRate(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  periodBasis: "current" | "comparative",
): DomainValidationResult<number | null> {
  const matches = replay.exchangeRates.flatMap((rate) => rate.applications
    .filter((application) => (
      (rate.rateKind === "closing" || rate.rateKind === "centralParity")
      && application.applicationType === "closing"
      && application.periodBasis === periodBasis
      && application.entitySnapshotId === entitySnapshotId
    ))
    .map(() => rate));
  if (matches.length === 0) return okCommand(null);
  if (matches.length !== 1) return failCommand(`CAD 实体 ${entitySnapshotId} 在同一期间必须且只能绑定一条期末汇率`, 409, "rateApplications");
  return cnyPerForeignUnit(matches[0]!);
}

function entityAppliedRates(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  applicationType: "flowAverage" | "cashPoint",
  periodBasis: "current" | "comparative",
) {
  const result = new Map<string, number>();
  for (const rate of replay.exchangeRates) {
    for (const application of rate.applications) {
      if (application.applicationType !== applicationType
        || application.periodBasis !== periodBasis
        || application.entitySnapshotId !== entitySnapshotId) continue;
      const normalized = cnyPerForeignUnit(rate);
      if (!normalized.ok) return normalized;
      if (result.has(application.targetDate)) {
        return failCommand(`CAD 实体 ${entitySnapshotId} 的 ${application.targetDate} 汇率重复绑定`, 409, "rateApplications");
      }
      result.set(application.targetDate, normalized.data);
    }
  }
  return okCommand(result);
}

function entityHistoricalCapitalRates(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  periodBasis: "current" | "comparative",
): DomainValidationResult<Record<HistoricalEquityLineCode, number | null>> {
  const paidInCapital = historicalEquityRate(
    replay.exchangeRates,
    entitySnapshotId,
    periodBasis,
    "paidInCapital",
  );
  if (!paidInCapital.ok) return paidInCapital;
  const capitalReserve = historicalEquityRate(
    replay.exchangeRates,
    entitySnapshotId,
    periodBasis,
    "capitalReserve",
  );
  if (!capitalReserve.ok) return capitalReserve;
  return okCommand({
    paidInCapital: paidInCapital.data,
    capitalReserve: capitalReserve.data,
    otherEquityInstruments: null,
    treasuryStock: null,
  });
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
  const closing = entityAppliedRate(replay, entitySnapshotId, "current");
  if (!closing.ok) return closing;
  if (closing.data === null) {
    return failCommand(`CAD 实体 ${entitySnapshotId} 缺少本期期末汇率`, 409, "rateApplications");
  }
  const comparativeClosing = entityAppliedRate(replay, entitySnapshotId, "comparative");
  if (!comparativeClosing.ok) return comparativeClosing;
  const historicalCapital = entityHistoricalCapitalRates(replay, entitySnapshotId, "current");
  if (!historicalCapital.ok) return historicalCapital;
  const comparativeHistoricalCapital = entityHistoricalCapitalRates(replay, entitySnapshotId, "comparative");
  if (!comparativeHistoricalCapital.ok) return comparativeHistoricalCapital;
  const currentFlowRates = entityAppliedRates(replay, entitySnapshotId, "flowAverage", "current");
  if (!currentFlowRates.ok) return currentFlowRates;
  const comparativeFlowRates = entityAppliedRates(replay, entitySnapshotId, "flowAverage", "comparative");
  if (!comparativeFlowRates.ok) return comparativeFlowRates;
  const currentCashPointRates = entityAppliedRates(replay, entitySnapshotId, "cashPoint", "current");
  if (!currentCashPointRates.ok) return currentCashPointRates;
  const comparativeCashPointRates = entityAppliedRates(replay, entitySnapshotId, "cashPoint", "comparative");
  if (!comparativeCashPointRates.ok) return comparativeCashPointRates;
  const entity = replay.entities.find((candidate) => candidate.id === entitySnapshotId);
  return okCommand({
    currency: "CAD",
    entitySnapshotId,
    entityLabel: entity ? `${entity.companyCode} ${entity.companyName}` : String(entitySnapshotId),
    closingRate: closing.data,
    comparativeClosingRate: comparativeClosing.data,
    historicalCapitalRates: {
      current: historicalCapital.data,
      comparative: comparativeHistoricalCapital.data,
    },
    flowRates: { current: currentFlowRates.data, comparative: comparativeFlowRates.data },
    cashPointRates: { current: currentCashPointRates.data, comparative: comparativeCashPointRates.data },
  });
}

function rateForSourceLine(
  policy: EntityTranslationPolicy,
  reportType: StatementReportType,
  line: FrozenReportLine,
  periodBasis: "current" | "comparative",
): DomainValidationResult<number> {
  if (policy.currency === "CNY") return okCommand(1);
  const sourceAmount = periodBasis === "current" ? line.amount : line.previousAmount;
  if (sourceAmount === 0) return okCommand(1);
  const closingRate = periodBasis === "current" ? policy.closingRate : policy.comparativeClosingRate;
  if (closingRate === null) {
    return failCommand(
      `${policy.entityLabel} 的${REPORT_LABELS[reportType]}含非零上期数，但批次未冻结比较期期末汇率`,
      409,
      "comparativeExchangeRates",
    );
  }
  if (reportType !== "balanceSheet") return okCommand(closingRate);
  if (line.isHeader || line.isTotal || line.isGrandTotal || line.section !== "equity") return okCommand(closingRate);
  if (HISTORICAL_CAPITAL_LINE_CODES.has(line.lineCode as HistoricalEquityLineCode)) {
    const historicalRate = policy.historicalCapitalRates[periodBasis][line.lineCode as HistoricalEquityLineCode];
    if (historicalRate === null) {
      return failCommand(
        `${policy.entityLabel} 存在非零${periodBasis === "current" ? "本期" : "比较期"}权益资本，但缺少该期间适用的投资日历史汇率及原币金额`,
        409,
        "historicalEquityRates",
      );
    }
    return okCommand(historicalRate);
  }
  return okCommand(closingRate);
}

function applyCadTranslationDifference(
  policy: Extract<EntityTranslationPolicy, { currency: "CAD" }>,
  lines: ConsolidatedOutputLine[],
): DomainValidationResult<ConsolidatedOutputLine[]> {
  recomputeBalance(lines);
  const byCode = new Map(lines.map((line) => [line.lineCode, line]));
  const balanceTotal = (lineCode: string, fallbackSections: string[]) => {
    const line = byCode.get(lineCode);
    if (line) return { amount: line.amount, previousAmount: line.previousAmount };
    const sectionTotals = lines.filter((candidate) => candidate.isTotal && fallbackSections.includes(candidate.section));
    return sectionTotals.length > 0 ? sumLineAmounts(sectionTotals, () => true) : null;
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
  recomputeBalance(lines);
  for (const line of lines) {
    line.sourceAmount = line.amount;
    line.adjustmentAmount = 0;
    line.previousSourceAmount = line.previousAmount;
    line.previousAdjustmentAmount = 0;
  }
  return okCommand(lines);
}

export function translateSourceLines(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  functionalCurrency: string,
  reportType: StatementReportType,
  reportPayload: unknown,
  sourceRows: unknown[],
  priorReferences?: ConsolidationPriorReferences,
): DomainValidationResult<ConsolidatedOutputLine[]> {
  const policy = buildEntityTranslationPolicy(replay, entitySnapshotId, functionalCurrency);
  if (!policy.ok) return policy;
  const prior = buildPriorReferenceContext({ replay, entitySnapshotId, reportType, priorReferences });
  const translated: ConsolidatedOutputLine[] = [];
  const currentFlows = reportType === "balanceSheet" ? null : payloadMonthlyFlows(reportPayload, "current");
  const comparativeFlows = reportType === "balanceSheet" ? null : payloadMonthlyFlows(reportPayload, "comparative");
  const cadFlowPolicy = policy.data.currency === "CAD" && reportType !== "balanceSheet"
    ? policy.data
    : null;
  const usesCadFlowTranslation = cadFlowPolicy !== null;
  if (cadFlowPolicy && (currentFlows === null || cadFlowPolicy.flowRates.current.size === 0)) {
    return failCommand(
      `${cadFlowPolicy.entityLabel} 的${REPORT_LABELS[reportType]}缺少逐月原币发生额或月平均汇率，禁止退回期末汇率折算`,
      409,
      "monthlyFlows",
    );
  }
  const hasComparativeFlowAmount = cadFlowPolicy !== null && sourceRows.some((rawLine) => {
    const parsed = parseFrozenLine(rawLine);
    return parsed !== null && parsed.previousAmount !== 0;
  });
  if (cadFlowPolicy && hasComparativeFlowAmount && !prior.comparativeLines
    && (comparativeFlows === null || cadFlowPolicy.flowRates.comparative.size === 0)) {
    return failCommand(
      `${cadFlowPolicy.entityLabel} 的${REPORT_LABELS[reportType]}含非零上期数，但缺少比较期逐月原币发生额或月平均汇率`,
      409,
      "monthlyFlows",
    );
  }
  for (const rawLine of sourceRows) {
    const parsed = parseFrozenLine(rawLine);
    if (!parsed) return failCommand(`${REPORT_LABELS[reportType]}来源缺少规范行标识或借贷方向`, 409, "reportPayload");
    const opening = policy.data.currency === "CAD" && reportType === "balanceSheet"
      ? retainedEarningsOpening(reportPayload)
      : null;
    if (policy.data.currency === "CAD" && reportType === "balanceSheet" && parsed.lineCode === "undistributedProfit" && opening) {
      if (opening.currencyCode.toUpperCase() !== "CNY") {
        return failCommand(`${policy.data.entityLabel} 的未分配利润期初基准必须使用人民币`, 409, "retainedEarningsOpening");
      }
      const expectedOpeningDate = `${replay.batch.year - 1}-12-31`;
      if (opening.openingDate !== expectedOpeningDate) {
        return failCommand(`${policy.data.entityLabel} 未分配利润期初基准日期必须为 ${expectedOpeningDate}`, 409, "retainedEarningsOpening");
      }
      const netProfit = translatedEntityNetProfit(replay.sources, policy.data);
      if (!netProfit.ok) return netProfit;
      const unexplainedMovement = money(parsed.amount - parsed.previousAmount - netProfit.data.sourceAmount);
      if (Math.abs(unexplainedMovement) >= 0.01) {
        return failCommand(`${policy.data.entityLabel} 未分配利润存在 ${unexplainedMovement} CAD 的分红或其他变动，但缺少逐笔折算证据`, 409, "retainedEarningsMovements");
      }
      const priorComparative = resolvePriorLineReference(
        prior.comparativeLines,
        parsed.lineCode,
        parsed.label,
        parsed.previousAmount,
        policy.data.entityLabel,
        "比较期",
      );
      if (priorComparative && !priorComparative.ok) return priorComparative;
      const priorComparativeAmount = priorComparative?.ok
        ? priorComparative.data.cnyAmount
        : null;
      if (priorComparative?.ok && priorComparative.data.referenced) {
        prior.mark(parsed.lineCode, "comparative");
      }
      const amount = money(opening.amount + netProfit.data.translatedAmount);
      translated.push({
        ...parsed,
        amount,
        previousAmount: priorComparativeAmount ?? money(opening.amount),
        sourceAmount: amount,
        adjustmentAmount: 0,
        previousSourceAmount: priorComparativeAmount ?? money(opening.amount),
        previousAdjustmentAmount: 0,
      });
      continue;
    }
    if (usesCadFlowTranslation && currentFlows && policy.data.currency === "CAD") {
      if (reportType === "cashFlow" && (parsed.lineCode === "openingCash" || parsed.lineCode === "endingCash")) {
        const cashPointLine = translateCashPointLine({
          parsed,
          policy: policy.data,
          year: replay.batch.year,
          month: replay.batch.month,
          ctx: prior,
        });
        if (!cashPointLine.ok) return cashPointLine;
        translated.push(cashPointLine.data);
        continue;
      }
      const current = monthlyTranslatedAmount(currentFlows, policy.data.flowRates.current, parsed.lineCode);
      if (!current.ok) return current;
      const priorComparative = parsed.lineCode === "fxEffect"
        ? null
        : resolvePriorLineReference(
          prior.comparativeLines,
          parsed.lineCode,
          parsed.label,
          parsed.previousAmount,
          policy.data.entityLabel,
          "比较期",
        );
      if (priorComparative && !priorComparative.ok) return priorComparative;
      const comparative = priorComparative?.ok
        ? okCommand({ sourceAmount: parsed.previousAmount, translatedAmount: priorComparative.data.cnyAmount, currentMonthSourceAmount: 0, currentMonthAmount: 0 })
        : parsed.lineCode === "fxEffect" && prior.comparativeLines
          ? okCommand({ sourceAmount: 0, translatedAmount: 0, currentMonthSourceAmount: 0, currentMonthAmount: 0 })
          : parsed.previousAmount === 0 && !hasComparativeFlowAmount
            ? okCommand({ sourceAmount: 0, translatedAmount: 0, currentMonthSourceAmount: 0, currentMonthAmount: 0 })
            : comparativeFlows
              ? monthlyTranslatedAmount(comparativeFlows, policy.data.flowRates.comparative, parsed.lineCode)
              : failCommand("CAD 比较期发生额缺少逐月来源快照", 409, "monthlyFlows");
      if (!comparative.ok) return comparative;
      if (priorComparative?.ok && priorComparative.data.referenced) {
        prior.mark(parsed.lineCode, "comparative");
      }
      const currentSourceDifference = money(current.data.sourceAmount - parsed.amount);
      const comparativeSourceDifference = priorComparative?.ok || (parsed.lineCode === "fxEffect" && prior.comparativeLines)
        ? 0
        : money(comparative.data.sourceAmount - parsed.previousAmount);
      if (currentSourceDifference !== 0 || comparativeSourceDifference !== 0) {
        return failCommand(
          `${policy.data.entityLabel} 的${parsed.label}原币逐月发生额与累计报表不一致：本期 ${currentSourceDifference.toFixed(2)}，比较期 ${comparativeSourceDifference.toFixed(2)}；原币差异不得作为折算舍入处理`,
          409,
          reportType === "cashFlow" ? "cashFlowSourceReconciliation" : "monthlyFlows",
        );
      }
      translated.push({
        ...parsed,
        amount: parsed.lineCode === "fxEffect" ? 0 : current.data.translatedAmount,
        currentMonthAmount: parsed.lineCode === "fxEffect" ? 0 : current.data.currentMonthAmount,
        currentMonthSourceAmount: parsed.lineCode === "fxEffect" ? 0 : current.data.currentMonthAmount,
        currentMonthAdjustmentAmount: 0,
        previousAmount: parsed.lineCode === "fxEffect" ? 0 : comparative.data.translatedAmount,
        sourceAmount: parsed.lineCode === "fxEffect" ? 0 : current.data.translatedAmount,
        adjustmentAmount: 0,
        previousSourceAmount: parsed.lineCode === "fxEffect" ? 0 : comparative.data.translatedAmount,
        previousAdjustmentAmount: 0,
      });
      continue;
    }
    const rate = rateForSourceLine(policy.data, reportType, parsed, "current");
    if (!rate.ok) return rate;
    const priorComparative = resolvePriorLineReference(
      prior.comparativeLines,
      parsed.lineCode,
      parsed.label,
      parsed.previousAmount,
      policy.data.currency === "CAD" ? policy.data.entityLabel : String(entitySnapshotId),
      "比较期",
    );
    if (priorComparative && !priorComparative.ok) return priorComparative;
    let previousAmount: number;
    if (priorComparative?.ok) {
      previousAmount = priorComparative.data.cnyAmount;
      if (priorComparative.data.referenced) prior.mark(parsed.lineCode, "comparative");
    } else {
      const comparativeRate = rateForSourceLine(policy.data, reportType, parsed, "comparative");
      if (!comparativeRate.ok) return comparativeRate;
      previousAmount = money(parsed.previousAmount * comparativeRate.data);
    }
    const amount = money(parsed.amount * rate.data);
    translated.push({
      ...parsed,
      amount,
      ...translatedCurrentMonthAmounts(parsed.currentMonthAmount, rate.data),
      previousAmount,
      sourceAmount: amount,
      adjustmentAmount: 0,
      previousSourceAmount: previousAmount,
      previousAdjustmentAmount: 0,
    });
  }
  let translatedResult = translated;
  if (reportType === "incomeStatement" && policy.data.currency === "CAD") {
    translatedResult = recomputeTranslatedIncome(translatedResult);
  }
  if (reportType === "balanceSheet" && policy.data.currency === "CAD") {
    const balanced = applyCadTranslationDifference(policy.data, translatedResult);
    if (!balanced.ok) return balanced;
    translatedResult = balanced.data;
  }
  if (reportType === "cashFlow" && policy.data.currency === "CAD" && usesCadFlowTranslation) {
    const reconciled = reconcileCadCashFlowTranslation({
      entityLabel: policy.data.entityLabel,
      currentFlows: currentFlows!,
      comparativeFlows: comparativeFlows ?? [],
      translatedLines: translatedResult,
    });
    if (!reconciled.ok) return reconciled;
    translatedResult = reconciled.data;
  }
  const sourceByCode = new Map(sourceRows.flatMap((row) => {
    const parsed = parseFrozenLine(row);
    return parsed ? [[parsed.lineCode, parsed] as const] : [];
  }));
  return okCommand(attachTranslationTraces({
    year: replay.batch.year,
    month: replay.batch.month,
    policy: policy.data,
    reportType,
    sourceByCode,
    lines: translatedResult,
    hasRetainedEarningsOpening: retainedEarningsOpening(reportPayload) !== null,
    priorReferencedPeriods: prior.referencedPeriods,
  }));
}
