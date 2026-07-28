import type {
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
  StatementReportType,
} from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

import {
  applyCurrentMonthAdjustment,
  consolidatedMoney as money,
  mergeCurrentMonthAmounts,
} from "./consolidated-line-amounts";
import { ensureLiabilityGrandTotal } from "./consolidated-output-balance-lines";
import {
  recomputeConsolidatedBalance,
  recomputeConsolidatedCashFlow,
} from "./consolidated-output-derivations";
import {
  frozenPayloadLines,
  translateFrozenSourceLines,
} from "./consolidated-output-translation";
import { recomputeConsolidatedIncome } from "./consolidation-nci-allocation";
import type { ConsolidationReplayPackage } from "./consolidation-replay";
import { applyConsolidationTaxAdjustments } from "./consolidation-tax-adjustments";

const REPORT_LABELS: Record<StatementReportType, string> = {
  balanceSheet: "合并资产负债表",
  incomeStatement: "合并利润表",
  cashFlow: "合并现金流量表",
};
const CNY_CODES = new Set(["CNY", "RMB", "人民币"]);

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
      const rows = frozenPayloadLines(reportType, source.reportPayload);
      if (!rows) return failCommand(`${REPORT_LABELS[reportType]}来源快照不可重放`, 409, "reportPayload");
      const translated = translateFrozenSourceLines(
        replay,
        source.entitySnapshotId,
        currency,
        reportType,
        rows,
        source.reportPayload,
      );
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
      recomputeConsolidatedBalance(lines);
    } else if (reportType === "incomeStatement") {
      const recomputed = recomputeConsolidatedIncome(lines);
      if (!recomputed.ok) return recomputed;
    } else {
      recomputeConsolidatedCashFlow(lines);
    }
    if (reportType === "balanceSheet") {
      const balanced = validateBalanceEquation(lines);
      if (!balanced.ok) return balanced;
    }
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
