import type {
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
  StatementReportType,
} from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { recomputeConsolidatedIncome } from "./consolidation-nci-allocation";
import { applyConsolidationTaxAdjustments } from "./consolidation-tax-adjustments";
import { ensureLiabilityGrandTotal, recomputeBalance } from "./consolidated-output-balance-lines";
import { translateSourceLines } from "./consolidated-output-translation";
import type { ConsolidationReplayPackage } from "./consolidation-replay";
import {
  applyCurrentMonthAdjustment,
  consolidatedMoney as money,
  mergeCurrentMonthAmounts,
  setDerivedLineAmounts,
  sumLineAmounts,
} from "./consolidated-line-amounts";

const REPORT_LABELS: Record<StatementReportType, string> = {
  balanceSheet: "合并资产负债表",
  incomeStatement: "合并利润表",
  cashFlow: "合并现金流量表",
};

const CNY_CODES = new Set(["CNY", "RMB", "人民币"]);

export function consolidationEntryAffectsCurrentMonth(entryType: string, postingDate: string, year: number, month: number) {
  return entryType !== "cashFlow" || postingDate.startsWith(`${year}-${String(month).padStart(2, "0")}`);
}

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

function sameLineDefinition(left: ConsolidatedOutputLine, right: ConsolidatedOutputLine) {
  return left.label === right.label
    && left.section === right.section
    && left.side === right.side
    && left.direction === right.direction
    && left.subtract === right.subtract
    && left.isHeader === right.isHeader
    && left.isTotal === right.isTotal
    && left.isGrandTotal === right.isGrandTotal;
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
  const parentEntity = replay.entities.find((entity) => entity.role === "parent");
  if (!parentEntity) return failCommand("合并范围缺少母公司", 409, "parentCompanyId");
  const presentationCurrency = functionalCurrencyByEntitySnapshotId.get(parentEntity.id)?.trim().toUpperCase();
  if (!presentationCurrency) return failCommand("合并母公司缺少本位币", 409, "functionalCurrency");
  if (!CNY_CODES.has(presentationCurrency)) {
    return failCommand(`当前合并折算仅支持以 CNY 为集团列报币种，母公司本位币为 ${presentationCurrency}`, 409, "presentationCurrency");
  }
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
      const translated = translateSourceLines(replay, source.entitySnapshotId, currency, reportType, source.reportPayload, rows, replay.priorReferences);
      if (!translated.ok) return translated;
      for (const translatedLine of translated.data) {
        const { translationTrace, ...outputLine } = translatedLine;
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
          functionalCurrency: currency.trim().toUpperCase(),
          ...(translationTrace ? { translationTrace } : {}),
        };
        const existing = outputByCode.get(translatedLine.lineCode);
        if (!existing) {
          orderedCodes.push(translatedLine.lineCode);
          outputByCode.set(translatedLine.lineCode, { ...outputLine, entityAmounts: [entityAmount] });
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
          if (reportType !== "balanceSheet" && consolidationEntryAffectsCurrentMonth(
            entry.entryType, entry.postingDate, replay.batch.year, replay.batch.month,
          )) {
            applyCurrentMonthAdjustment(line, delta);
          }
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
    } else if (reportType === "incomeStatement") {
      const recomputed = recomputeConsolidatedIncome(lines);
      if (!recomputed.ok) return recomputed;
    }
    else recomputeCashFlow(lines);
    if (reportType === "balanceSheet") {
      const balanced = validateBalanceEquation(lines);
      if (!balanced.ok) return balanced;
    }
    statements.push({ reportType, label: REPORT_LABELS[reportType], lines, totals: outputTotals(reportType, lines) });
  }
  return okCommand({
    batch: { ...replay.batch, presentationCurrency },
    statements,
    sourceCount: replay.sources.length,
    approvedEntryCount: replay.approvedEntries.length,
    generatedAt: generatedAt.toISOString(),
  });
}
