import type {
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
  StatementReportType,
} from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { recomputeConsolidatedIncome } from "./consolidation-nci-allocation";
import { applyConsolidationTaxAdjustments } from "./consolidation-tax-adjustments";
import { ensureLiabilityGrandTotal } from "./consolidated-output-balance-lines";
import type { ConsolidationReplayPackage } from "./consolidation-replay";
import {
  applyCurrentMonthAdjustment,
  consolidatedMoney as money,
  mergeCurrentMonthAmounts,
  setDerivedLineAmounts,
  sumLineAmounts,
  translatedCurrentMonthAmounts,
} from "./consolidated-line-amounts";

type FrozenReportLine = Omit<ConsolidatedOutputLine, "sourceAmount" | "adjustmentAmount">;

const REPORT_LABELS: Record<StatementReportType, string> = {
  balanceSheet: "合并资产负债表",
  incomeStatement: "合并利润表",
  cashFlow: "合并现金流量表",
};

const CNY_CODES = new Set(["CNY", "RMB", "人民币"]);
const HISTORICAL_CAPITAL_LINE_CODES = new Set([
  "paidInCapital",
  "otherEquityInstruments",
  "capitalReserve",
  "treasuryStock",
]);
const TRANSLATION_DIFFERENCE_LINE_CODE = "otherComprehensiveIncome";

type FrozenRate = ConsolidationReplayPackage["exchangeRates"][number];
type EntityTranslationPolicy = {
  currency: "CNY";
} | {
  currency: "CAD";
  entitySnapshotId: number;
  entityLabel: string;
  closingRate: number;
  comparativeClosingRate: number | null;
  historicalCapitalRate: number | null;
  comparativeHistoricalCapitalRate: number | null;
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

function payloadLines(reportType: StatementReportType, reportPayload: unknown): unknown[] | null {
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

function cnyPerForeignUnit(rate: FrozenRate): DomainValidationResult<number> {
  if (rate.baseCurrency.toUpperCase() !== "CAD" || rate.quoteCurrency.toUpperCase() !== "CNY") {
    return failCommand("当前合并输出仅支持 CAD/CNY 冻结汇率", 409, "exchangeRates");
  }
  const normalized = Number(rate.rate);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return failCommand("批次冻结汇率不是有效正数", 409, "exchangeRates");
  }
  return okCommand(normalized);
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

function entityHistoricalCapitalRate(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  periodBasis: "current" | "comparative",
): DomainValidationResult<number | null> {
  const bindings = replay.exchangeRates.flatMap((rate) => rate.applications
    .filter((application) => (
      (application.applicationType === "historicalInvestment" || application.applicationType === "historicalCapital")
      && application.periodBasis === periodBasis
      && application.entitySnapshotId === entitySnapshotId
    ))
    .map((application) => ({ rate, application })));
  if (bindings.length === 0) return okCommand(null);
  let originalAmountTotal = 0;
  let translatedAmountTotal = 0;
  for (const binding of bindings) {
    if (binding.rate.rateKind !== "historicalInvestment" && binding.rate.rateKind !== "centralParity") {
      return failCommand(`CAD 实体 ${entitySnapshotId} 的投资日应用引用了非历史汇率`, 409, "rateApplications");
    }
    const originalAmount = binding.application.voucher?.originalAmount ?? binding.application.capitalOriginalAmount;
    if (originalAmount === null || originalAmount === undefined || !Number.isFinite(originalAmount) || originalAmount <= 0) {
      return failCommand(`CAD 实体 ${entitySnapshotId} 的权益资本历史汇率缺少有效原币金额`, 409, "rateApplications");
    }
    const normalizedRate = cnyPerForeignUnit(binding.rate);
    if (!normalizedRate.ok) return normalizedRate;
    originalAmountTotal += originalAmount;
    translatedAmountTotal += originalAmount * normalizedRate.data;
  }
  return okCommand(translatedAmountTotal / originalAmountTotal);
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
  const historicalCapital = entityHistoricalCapitalRate(replay, entitySnapshotId, "current");
  if (!historicalCapital.ok) return historicalCapital;
  const comparativeHistoricalCapital = entityHistoricalCapitalRate(replay, entitySnapshotId, "comparative");
  if (!comparativeHistoricalCapital.ok) return comparativeHistoricalCapital;
  const entity = replay.entities.find((candidate) => candidate.id === entitySnapshotId);
  return okCommand({
    currency: "CAD",
    entitySnapshotId,
    entityLabel: entity ? `${entity.companyCode} ${entity.companyName}` : String(entitySnapshotId),
    closingRate: closing.data,
    comparativeClosingRate: comparativeClosing.data,
    historicalCapitalRate: historicalCapital.data,
    comparativeHistoricalCapitalRate: comparativeHistoricalCapital.data,
  });
}

function sameLineDefinition(left: ConsolidatedOutputLine, right: FrozenReportLine) {
  return left.label === right.label
    && left.section === right.section
    && left.side === right.side
    && left.direction === right.direction
    && left.subtract === right.subtract
    && left.isHeader === right.isHeader
    && left.isTotal === right.isTotal
    && left.isGrandTotal === right.isGrandTotal;
}

function recomputeBalance(lines: ConsolidatedOutputLine[]) {
  for (const line of lines.filter((candidate) => candidate.isTotal)) {
    const total = sumLineAmounts(lines, (candidate) => (
      candidate.section === line.section
      && !candidate.isHeader
      && !candidate.isTotal
      && !candidate.isGrandTotal
    ));
    setDerivedLineAmounts(line, total.amount, total.previousAmount, total.currentMonthAmount);
  }
  const grandSections: Record<string, string[]> = {
    totalAssets: ["currentAssets", "nonCurrentAssets"],
    totalLiabilities: ["currentLiabilities", "nonCurrentLiabilities"],
  };
  for (const line of lines.filter((candidate) => candidate.isGrandTotal)) {
    const sections = grandSections[line.lineCode];
    if (!sections) continue;
    const total = sumLineAmounts(lines, (candidate) => candidate.isTotal && sections.includes(candidate.section));
    setDerivedLineAmounts(line, total.amount, total.previousAmount, total.currentMonthAmount);
  }
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
  if (line.isHeader || line.isTotal || line.isGrandTotal || line.section !== "equity") {
    return okCommand(closingRate);
  }
  if (HISTORICAL_CAPITAL_LINE_CODES.has(line.lineCode)) {
    const historicalRate = periodBasis === "current"
      ? policy.historicalCapitalRate
      : policy.comparativeHistoricalCapitalRate;
    if (historicalRate === null) {
      return failCommand(
        `${policy.entityLabel} 存在非零${periodBasis === "current" ? "本期" : "比较期"}权益资本，但缺少该期间适用的投资日历史汇率及原币金额`,
        409,
        "historicalEquityRates",
      );
    }
    return okCommand(historicalRate);
  }
  if (line.lineCode === TRANSLATION_DIFFERENCE_LINE_CODE) return okCommand(closingRate);
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
    return sectionTotals.length > 0
      ? sumLineAmounts(sectionTotals, () => true)
      : null;
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
      return failCommand(
        `${policy.entityLabel} 缺少规范其他综合收益行，无法单独列示外币报表折算差额`,
        409,
        "translationDifference",
      );
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

function translateSourceLines(
  replay: ConsolidationReplayPackage,
  entitySnapshotId: number,
  functionalCurrency: string,
  reportType: StatementReportType,
  sourceRows: unknown[],
): DomainValidationResult<ConsolidatedOutputLine[]> {
  const policy = buildEntityTranslationPolicy(replay, entitySnapshotId, functionalCurrency);
  if (!policy.ok) return policy;
  const translated: ConsolidatedOutputLine[] = [];
  for (const rawLine of sourceRows) {
    const parsed = parseFrozenLine(rawLine);
    if (!parsed) return failCommand(`${REPORT_LABELS[reportType]}来源缺少规范行标识或借贷方向`, 409, "reportPayload");
    const rate = rateForSourceLine(policy.data, reportType, parsed, "current");
    if (!rate.ok) return rate;
    const comparativeRate = rateForSourceLine(policy.data, reportType, parsed, "comparative");
    if (!comparativeRate.ok) return comparativeRate;
    const amount = money(parsed.amount * rate.data);
    const previousAmount = money(parsed.previousAmount * comparativeRate.data);
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
  if (reportType === "balanceSheet" && policy.data.currency === "CAD") {
    return applyCadTranslationDifference(policy.data, translated);
  }
  return okCommand(translated);
}

const CASH_FLOW_DERIVATIONS: Record<string, { add: string[]; subtract?: string[] }> = {
  operatingInSubtotal: { add: ["salesReceipt", "taxRefund", "otherOpIn"] },
  operatingOutSubtotal: { add: ["purchasePayment", "staffPayment", "taxPayment", "otherOpOut"] },
  operatingNet: { add: ["operatingInSubtotal"], subtract: ["operatingOutSubtotal"] },
  investingInSubtotal: { add: ["investRecovery", "investIncome", "fixedAssetDisposal", "subsidiaryDisposal", "otherInvIn"] },
  investingOutSubtotal: { add: ["fixedAssetPurchase", "investPayment", "subsidiaryAcquisition", "otherInvOut"] },
  investingNet: { add: ["investingInSubtotal"], subtract: ["investingOutSubtotal"] },
  financingInSubtotal: { add: ["capitalInjection", "loanReceipt", "otherFinIn"] },
  financingOutSubtotal: { add: ["loanRepayment", "dividendPayment", "otherFinOut"] },
  financingNet: { add: ["financingInSubtotal"], subtract: ["financingOutSubtotal"] },
  netIncrease: { add: ["operatingNet", "investingNet", "financingNet", "fxEffect"] },
  endingCash: { add: ["openingCash", "netIncrease"] },
};

function recomputeCashFlow(lines: ConsolidatedOutputLine[]) {
  const byCode = new Map(lines.map((line) => [line.lineCode, line]));
  for (const [lineCode, derivation] of Object.entries(CASH_FLOW_DERIVATIONS)) {
    const line = byCode.get(lineCode);
    if (!line) continue;
    const add = sumLineAmounts(lines, (candidate) => derivation.add.includes(candidate.lineCode));
    const subtract = sumLineAmounts(lines, (candidate) => derivation.subtract?.includes(candidate.lineCode) ?? false);
    const currentMonthAmount = add.currentMonthAmount === undefined && subtract.currentMonthAmount === undefined
      ? undefined
      : (add.currentMonthAmount ?? 0) - (subtract.currentMonthAmount ?? 0);
    setDerivedLineAmounts(
      line,
      add.amount - subtract.amount,
      add.previousAmount - subtract.previousAmount,
      currentMonthAmount,
    );
  }
}

function outputTotals(
  reportType: StatementReportType,
  lines: ConsolidatedOutputLine[],
): Record<string, number> {
  const byCode = new Map(lines.map((line) => [line.lineCode, line.amount]));
  if (reportType === "balanceSheet") {
    return {
      totalAssets: byCode.get("totalAssets") ?? 0,
      totalLiabilities: byCode.get("totalLiabilities") ?? 0,
      totalEquity: byCode.get("totalEquity") ?? 0,
      totalLiabilitiesAndEquity: money((byCode.get("totalLiabilities") ?? 0) + (byCode.get("totalEquity") ?? 0)),
    };
  }
  if (reportType === "incomeStatement") return {
    netProfit: byCode.get("netProfit") ?? 0,
    netProfitAttributableToParent: byCode.get("netProfitAttributableToParent") ?? byCode.get("netProfit") ?? 0,
    netProfitAttributableToNci: byCode.get("netProfitAttributableToNci") ?? 0,
  };
  return { netIncrease: byCode.get("netIncrease") ?? 0, endingCash: byCode.get("endingCash") ?? 0 };
}

function validateBalanceEquation(lines: ConsolidatedOutputLine[]): DomainValidationResult<true> {
  const byCode = new Map(lines.map((line) => [line.lineCode, line]));
  const assets = byCode.get("totalAssets");
  const liabilities = byCode.get("totalLiabilities");
  const equity = byCode.get("totalEquity");
  const missing = [
    !assets ? "资产总计" : null,
    !liabilities ? "负债合计" : null,
    !equity ? "所有者权益合计" : null,
  ].filter((label): label is string => label !== null);
  if (!assets || !liabilities || !equity) {
    return failCommand(`合并资产负债表缺少${missing.join("、")}规范行，无法校验平衡关系`, 409, "balanceEquation");
  }
  const currentRight = money(liabilities.amount + equity.amount);
  const currentDifference = money(assets.amount - currentRight);
  if (currentDifference !== 0) {
    return failCommand(
      `合并资产负债表不平：资产 ${assets.amount.toFixed(2)}，负债及权益 ${currentRight.toFixed(2)}，差额 ${currentDifference.toFixed(2)}`,
      409,
      "balanceEquation",
    );
  }
  const previousRight = money(liabilities.previousAmount + equity.previousAmount);
  const previousDifference = money(assets.previousAmount - previousRight);
  if (previousDifference !== 0) {
    return failCommand(
      `合并资产负债表上期数不平：资产 ${assets.previousAmount.toFixed(2)}，负债及权益 ${previousRight.toFixed(2)}，差额 ${previousDifference.toFixed(2)}`,
      409,
      "balanceEquation",
    );
  }
  return okCommand(true);
}

export function buildConsolidatedReportOutput(
  replay: ConsolidationReplayPackage,
  functionalCurrencyByEntitySnapshotId: ReadonlyMap<number, string>,
  generatedAt = new Date(),
): DomainValidationResult<ConsolidatedReportOutputPackage> {
  const statements: ConsolidatedStatementOutput[] = [];
  const entityBySnapshotId = new Map(replay.entities.map((entity) => [entity.id, entity]));
  for (const reportType of ["balanceSheet", "incomeStatement", "cashFlow"] as const) {
    const sourceRows = replay.sources.filter((source) => source.reportType === reportType);
    if (sourceRows.length === 0) return failCommand(`${REPORT_LABELS[reportType]}没有冻结来源`, 409, "sources");
    const orderedCodes: string[] = [];
    const outputByCode = new Map<string, ConsolidatedOutputLine>();
    for (const source of sourceRows) {
      const currency = functionalCurrencyByEntitySnapshotId.get(source.entitySnapshotId);
      if (!currency) return failCommand("合并范围快照缺少本位币", 409, "functionalCurrency");
      const entity = entityBySnapshotId.get(source.entitySnapshotId);
      if (!entity) return failCommand("个别报表来源引用了范围外主体", 409, "sources");
      const rows = payloadLines(reportType, source.reportPayload);
      if (!rows) return failCommand(`${REPORT_LABELS[reportType]}来源快照不可重放`, 409, "reportPayload");
      const translated = translateSourceLines(replay, source.entitySnapshotId, currency, reportType, rows);
      if (!translated.ok) return translated;
      for (const translatedLine of translated.data) {
        const entityAmount = {
          entitySnapshotId: entity.id,
          companyCode: entity.companyCode,
          companyName: entity.companyName,
          role: entity.role,
          amount: translatedLine.sourceAmount,
          ...(translatedLine.currentMonthSourceAmount === undefined ? {} : {
            currentMonthAmount: translatedLine.currentMonthSourceAmount,
          }),
          previousAmount: translatedLine.previousSourceAmount ?? translatedLine.previousAmount,
        };
        const existing = outputByCode.get(translatedLine.lineCode);
        if (!existing) {
          orderedCodes.push(translatedLine.lineCode);
          outputByCode.set(translatedLine.lineCode, { ...translatedLine, entityAmounts: [entityAmount] });
        } else {
          if (!sameLineDefinition(existing, translatedLine)) {
            return failCommand(`${REPORT_LABELS[reportType]}行 ${translatedLine.lineCode} 在不同实体间定义不一致`, 409, "reportPayload");
          }
          existing.amount = money(existing.amount + translatedLine.amount);
          mergeCurrentMonthAmounts(existing, translatedLine);
          existing.previousAmount = money(existing.previousAmount + translatedLine.previousAmount);
          existing.sourceAmount = money(existing.sourceAmount + translatedLine.sourceAmount);
          existing.previousSourceAmount = money(
            (existing.previousSourceAmount ?? 0) + (translatedLine.previousSourceAmount ?? translatedLine.previousAmount),
          );
          existing.entityAmounts = [...(existing.entityAmounts ?? []), entityAmount];
        }
      }
    }
    if (reportType === "balanceSheet") ensureLiabilityGrandTotal(orderedCodes, outputByCode);
    const lines = orderedCodes.map((lineCode) => outputByCode.get(lineCode)!);
    for (const entry of replay.approvedEntries) {
      for (const entryLine of entry.lines.filter((line) => line.statementType === reportType)) {
        if (!CNY_CODES.has(entryLine.currencyCode.toUpperCase())) {
          return failCommand(`抵销分录 ${entry.entryNo} 必须先折算为人民币再计入合并报表`, 409, "currencyCode");
        }
        const line = outputByCode.get(entryLine.lineCode);
        if (!line) return failCommand(`抵销分录 ${entry.entryNo} 引用了不存在的报表行 ${entryLine.lineCode}`, 409, "lineCode");
        if (line.isHeader || line.isTotal || line.isGrandTotal || line.direction === "net") {
          return failCommand(`抵销分录 ${entry.entryNo} 不能直接写入派生报表行 ${entryLine.lineCode}`, 409, "lineCode");
        }
        const delta = line.side === "debit"
          ? entryLine.debit - entryLine.credit
          : entryLine.credit - entryLine.debit;
        if (entryLine.periodBasis === "comparative") {
          line.previousAmount = money(line.previousAmount + delta);
          line.previousAdjustmentAmount = money((line.previousAdjustmentAmount ?? 0) + delta);
        } else {
          line.amount = money(line.amount + delta);
          line.adjustmentAmount = money(line.adjustmentAmount + delta);
          if (reportType !== "balanceSheet") applyCurrentMonthAdjustment(line, delta);
        }
      }
    }
    const tax = applyConsolidationTaxAdjustments({
      reportType,
      lines,
      entries: replay.approvedEntries,
      entitySnapshotIds: new Set(replay.entities.map((entity) => entity.id)),
    });
    if (!tax.ok) return tax;
    if (reportType === "balanceSheet") {
      recomputeBalance(lines);
      const balanced = validateBalanceEquation(lines);
      if (!balanced.ok) return balanced;
    } else if (reportType === "incomeStatement") {
      const recomputed = recomputeConsolidatedIncome(lines);
      if (!recomputed.ok) return recomputed;
    }
    else recomputeCashFlow(lines);
    statements.push({ reportType, label: REPORT_LABELS[reportType], lines, totals: outputTotals(reportType, lines) });
  }
  return okCommand({
    batch: replay.batch,
    statements,
    sourceCount: replay.sources.length,
    approvedEntryCount: replay.approvedEntries.length,
    generatedAt: generatedAt.toISOString(),
  });
}
