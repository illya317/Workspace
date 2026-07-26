import type {
  ConsolidatedOutputEntityAmount,
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
  ConsolidationEntrySnapshot,
  StatementReportType,
} from "@workspace/finance/types";

import { ENTRY_TYPE_OPTIONS } from "./consolidation-decision-presenters";

export interface ConsolidationWorkpaperEntryEffect {
  key: string;
  title: string;
  typeLabel: string;
  companyCode: string;
  debit: number;
  credit: number;
  amount: number;
  note: string | null;
}

export interface ConsolidationWorkpaperAdjustmentAmounts {
  debit: number;
  credit: number;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function combinedEntityAmounts(lines: readonly ConsolidatedOutputLine[]) {
  const byEntity = new Map<number, ConsolidatedOutputEntityAmount>();
  for (const entity of lines.flatMap((line) => line.entityAmounts ?? [])) {
    const current = byEntity.get(entity.entitySnapshotId);
    byEntity.set(entity.entitySnapshotId, current ? {
      ...current,
      amount: money(current.amount + entity.amount),
      previousAmount: money(current.previousAmount + entity.previousAmount),
    } : { ...entity });
  }
  return [...byEntity.values()];
}

export function consolidationWorkpaperLines(statement: ConsolidatedStatementOutput): ConsolidatedOutputLine[] {
  if (statement.reportType !== "balanceSheet" || statement.lines.some((line) => line.lineCode === "totalLiabilitiesAndEquity")) {
    return statement.lines;
  }
  const totalLiabilities = statement.lines.find((line) => line.lineCode === "totalLiabilities");
  const totalEquity = statement.lines.find((line) => line.lineCode === "totalEquity");
  if (!totalLiabilities || !totalEquity) return statement.lines;
  return [...statement.lines, {
    lineCode: "totalLiabilitiesAndEquity",
    label: "负债和所有者权益总计",
    code: null,
    amount: money(totalLiabilities.amount + totalEquity.amount),
    previousAmount: money(totalLiabilities.previousAmount + totalEquity.previousAmount),
    section: "equity",
    side: "credit",
    direction: null,
    subtract: false,
    isHeader: false,
    isTotal: false,
    isGrandTotal: true,
    sourceAmount: money(totalLiabilities.sourceAmount + totalEquity.sourceAmount),
    adjustmentAmount: money(totalLiabilities.adjustmentAmount + totalEquity.adjustmentAmount),
    previousSourceAmount: money(
      (totalLiabilities.previousSourceAmount ?? totalLiabilities.previousAmount)
      + (totalEquity.previousSourceAmount ?? totalEquity.previousAmount),
    ),
    previousAdjustmentAmount: money(
      (totalLiabilities.previousAdjustmentAmount ?? 0) + (totalEquity.previousAdjustmentAmount ?? 0),
    ),
    entityAmounts: combinedEntityAmounts([totalLiabilities, totalEquity]),
  }];
}

export function consolidationWorkpaperEntities(
  report: ConsolidatedReportOutputPackage | null,
): ConsolidatedOutputEntityAmount[] {
  const byEntity = new Map<number, ConsolidatedOutputEntityAmount>();
  for (const statement of report?.statements ?? []) {
    for (const line of statement.lines) {
      for (const entity of line.entityAmounts ?? []) {
        if (!byEntity.has(entity.entitySnapshotId)) byEntity.set(entity.entitySnapshotId, entity);
      }
    }
  }
  return [...byEntity.values()].sort((left, right) => {
    if (left.role !== right.role) return left.role === "parent" ? -1 : 1;
    return left.companyCode.localeCompare(right.companyCode, "zh-CN", { numeric: true });
  });
}

export function consolidationWorkpaperEntityAmount(
  line: ConsolidatedOutputLine,
  entitySnapshotId: number,
) {
  return line.entityAmounts?.find((entity) => entity.entitySnapshotId === entitySnapshotId)?.amount ?? 0;
}

export function consolidationWorkpaperAdjustmentAmounts(
  line: ConsolidatedOutputLine,
): ConsolidationWorkpaperAdjustmentAmounts {
  const adjustment = money(line.adjustmentAmount);
  if (line.side === "credit") {
    return adjustment >= 0
      ? { debit: 0, credit: adjustment }
      : { debit: Math.abs(adjustment), credit: 0 };
  }
  return adjustment >= 0
    ? { debit: adjustment, credit: 0 }
    : { debit: 0, credit: Math.abs(adjustment) };
}

export function consolidationWorkpaperEntryEffects(
  entries: readonly ConsolidationEntrySnapshot[],
  reportType: StatementReportType,
  line: ConsolidatedOutputLine,
): ConsolidationWorkpaperEntryEffect[] {
  return entries.flatMap((entry) => {
    if (entry.status !== "approved") return [];
    const typeLabel = ENTRY_TYPE_OPTIONS.find((option) => option.value === entry.entryType)?.label ?? entry.entryType;
    return entry.lines
      .filter((entryLine) => (
        entryLine.statementType === reportType
        && entryLine.lineCode === line.lineCode
        && (entryLine.periodBasis ?? "current") === "current"
      ))
      .map((entryLine) => ({
        key: `${entry.id}-${entryLine.id}`,
        title: entry.title,
        typeLabel,
        companyCode: entryLine.companyCode,
        debit: entryLine.debit,
        credit: entryLine.credit,
        amount: line.side === "debit"
          ? entryLine.debit - entryLine.credit
          : entryLine.credit - entryLine.debit,
        note: entryLine.note,
      }));
  });
}
