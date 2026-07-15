import type {
  ConsolidatedOutputLine,
  ConsolidationEntrySnapshot,
  StatementReportType,
} from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function applyDebitCredit(
  byCode: ReadonlyMap<string, ConsolidatedOutputLine>,
  lineCode: string,
  debit: number,
  credit: number,
  effectKey: string,
  periodBasis: "current" | "comparative",
): DomainValidationResult<true> {
  const line = byCode.get(lineCode);
  if (!line || line.isHeader || line.isTotal || line.isGrandTotal || line.direction === "net") {
    return failCommand(`税务影响 ${effectKey} 引用了不存在或不可直接调整的报表行 ${lineCode}`, 409, "taxEffects");
  }
  const delta = line.side === "debit" ? debit - credit : credit - debit;
  if (periodBasis === "comparative") {
    line.previousAmount = money(line.previousAmount + delta);
    line.previousAdjustmentAmount = money((line.previousAdjustmentAmount ?? 0) + delta);
  } else {
    line.amount = money(line.amount + delta);
    line.adjustmentAmount = money(line.adjustmentAmount + delta);
  }
  return okCommand(true);
}

export function applyConsolidationTaxAdjustments(input: {
  reportType: StatementReportType;
  lines: ConsolidatedOutputLine[];
  entries: readonly ConsolidationEntrySnapshot[];
  entitySnapshotIds: ReadonlySet<number>;
}): DomainValidationResult<true> {
  const byCode = new Map(input.lines.map((line) => [line.lineCode, line]));
  for (const entry of input.entries) {
    for (const tax of entry.taxEffects) {
      if (!tax.entitySnapshotId || !input.entitySnapshotIds.has(tax.entitySnapshotId)) {
        return failCommand(`税务影响 ${tax.effectKey} 缺少批次内纳税主体`, 409, "taxEffects");
      }
      if (!tax.jurisdiction?.trim()) {
        return failCommand(`税务影响 ${tax.effectKey} 缺少税辖区`, 409, "taxEffects");
      }
      if (tax.recognition === "unrecognized") continue;
      if (!tax.recognitionLocation || !tax.balanceSheetLineCode || !tax.counterpartLineCode) {
        return failCommand(`税务影响 ${tax.effectKey} 缺少入表位置`, 409, "taxEffects");
      }
      const amount = money(Math.abs(tax.differenceAmount * tax.taxRate));
      if (!Number.isFinite(amount) || amount <= 0) {
        return failCommand(`税务影响 ${tax.effectKey} 派生税额无效`, 409, "taxEffects");
      }
      const asset = tax.recognition === "asset";
      if (input.reportType === "balanceSheet") {
        const balance = applyDebitCredit(
          byCode,
          tax.balanceSheetLineCode,
          asset ? amount : 0,
          asset ? 0 : amount,
          tax.effectKey,
          tax.periodBasis ?? "current",
        );
        if (!balance.ok) return balance;
        const equityLineCode = tax.recognitionLocation === "profitOrLoss"
          ? "undistributedProfit"
          : tax.counterpartLineCode;
        const equity = applyDebitCredit(
          byCode,
          equityLineCode,
          asset ? 0 : amount,
          asset ? amount : 0,
          tax.effectKey,
          tax.periodBasis ?? "current",
        );
        if (!equity.ok) return equity;
      } else if (input.reportType === "incomeStatement" && tax.recognitionLocation === "profitOrLoss") {
        const profitOrLoss = applyDebitCredit(
          byCode,
          tax.counterpartLineCode,
          asset ? 0 : amount,
          asset ? amount : 0,
          tax.effectKey,
          tax.periodBasis ?? "current",
        );
        if (!profitOrLoss.ok) return profitOrLoss;
      }
    }
  }
  return okCommand(true);
}
