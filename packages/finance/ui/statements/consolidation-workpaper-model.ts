import type {
  ConsolidatedOutputEntityAmount,
  ConsolidatedOutputLine,
  ConsolidatedOutputRateBasis,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
  ConsolidationAdjustmentComparison,
  ConsolidationEntrySnapshot,
  ConsolidationEntitySnapshot,
  StatementReportType,
} from "@workspace/finance/types";

import { ENTRY_TYPE_OPTIONS } from "./consolidation-decision-presenters";

export interface ConsolidationWorkpaperEntryEffect {
  key: string;
  entryNo: string;
  title: string;
  typeLabel: string;
  companies: string;
  amount: number;
  note: string | null;
}

export interface ConsolidationWorkpaperOpenItem {
  key: string;
  categoryLabel: string;
  title: string;
  parties: string;
  bookAmounts: string;
  difference: number;
  currencyCode: string | null;
  statusLabel: string;
  actionLabel: string;
}

export interface ConsolidationWorkpaperAdjustmentAmounts {
  debit: number;
  credit: number;
}

export interface ConsolidationFxTranslationRow {
  key: string;
  lineCode: string;
  lineLabel: string;
  companyLabel: string;
  sourceCurrency: string;
  presentationCurrency: string;
  sourceAmount: number;
  rateBasisLabel: string;
  rateDisplay: string;
  translatedAmount: number;
  isTotal: boolean;
}

const RATE_BASIS_LABELS: Record<ConsolidatedOutputRateBasis, string> = {
  identity: "本位币无需折算",
  closing: "期末汇率",
  historical: "历史汇率",
  monthlyAverage: "月平均汇率",
  monthlyAverageMultiple: "逐月平均汇率",
  cashPoint: "时点汇率",
  rolling: "期初人民币加逐月利润滚算",
  balancing: "折算平衡差额",
  aggregate: "汇总派生",
  priorReference: "上期已折算数",
};

export function consolidationFxTranslationRows(
  statement: ConsolidatedStatementOutput,
): ConsolidationFxTranslationRow[] {
  return statement.lines.flatMap((line) => (line.entityAmounts ?? []).flatMap((entity) => {
    const trace = entity.translationTrace;
    if (!trace || trace.sourceCurrency === trace.presentationCurrency) return [];
    return [{
      key: `${entity.entitySnapshotId}:${line.lineCode}`,
      lineCode: line.lineCode,
      lineLabel: line.label,
      companyLabel: `${entity.companyCode} · ${entity.companyName}`,
      sourceCurrency: trace.sourceCurrency,
      presentationCurrency: trace.presentationCurrency,
      sourceAmount: trace.current.sourceAmount,
      rateBasisLabel: RATE_BASIS_LABELS[trace.current.basis],
      rateDisplay: trace.current.rate === null ? (trace.current.basis === "monthlyAverageMultiple" ? "多期" : "—") : trace.current.rate.toFixed(8),
      translatedAmount: trace.current.translatedAmount,
      isTotal: line.isHeader || line.isTotal || line.isGrandTotal,
    }];
  }));
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
      ...(current.translationTrace && entity.translationTrace ? {
        translationTrace: {
          ...current.translationTrace,
          current: {
            sourceAmount: money(current.translationTrace.current.sourceAmount + entity.translationTrace.current.sourceAmount),
            translatedAmount: money(current.translationTrace.current.translatedAmount + entity.translationTrace.current.translatedAmount),
            basis: "aggregate" as const,
            rate: null,
          },
          comparative: {
            sourceAmount: money(current.translationTrace.comparative.sourceAmount + entity.translationTrace.comparative.sourceAmount),
            translatedAmount: money(current.translationTrace.comparative.translatedAmount + entity.translationTrace.comparative.translatedAmount),
            basis: "aggregate" as const,
            rate: null,
          },
        },
      } : {}),
    } : { ...entity });
  }
  return [...byEntity.values()];
}

export function consolidationWorkpaperLines(statement: ConsolidatedStatementOutput): ConsolidatedOutputLine[] {
  if (statement.reportType === "incomeStatement") {
    const netProfit = statement.lines.find((line) => line.lineCode === "netProfit");
    const parent = statement.lines.find((line) => line.lineCode === "netProfitAttributableToParent");
    const nci = statement.lines.find((line) => line.lineCode === "netProfitAttributableToNci");
    if (netProfit?.entityAmounts && parent && nci) {
      return statement.lines.map((line) => {
        if (line === parent) return { ...line, entityAmounts: netProfit.entityAmounts?.map((entity) => ({ ...entity })) };
        if (line === nci) return {
          ...line,
          entityAmounts: netProfit.entityAmounts?.map((entity) => ({
            ...entity,
            amount: 0,
            previousAmount: 0,
            ...(entity.currentMonthAmount === undefined ? {} : { currentMonthAmount: 0 }),
          })),
        };
        return line;
      });
    }
    return statement.lines;
  }
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
  scopeEntities: readonly ConsolidationEntitySnapshot[] = [],
): ConsolidatedOutputEntityAmount[] {
  const byEntity = new Map<number, ConsolidatedOutputEntityAmount>();
  for (const statement of report?.statements ?? []) {
    for (const line of statement.lines) {
      for (const entity of line.entityAmounts ?? []) {
        if (!byEntity.has(entity.entitySnapshotId)) byEntity.set(entity.entitySnapshotId, entity);
      }
    }
  }
  for (const entity of scopeEntities.filter((item) => item.isConsolidated)) {
    if (byEntity.has(entity.id)) continue;
    byEntity.set(entity.id, {
      entitySnapshotId: entity.id,
      companyCode: entity.companyCode,
      companyName: entity.companyName,
      role: entity.role,
      amount: 0,
      previousAmount: 0,
    });
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
    if (entry.status !== "approved" && entry.status !== "draft") return [];
    const typeLabel = ENTRY_TYPE_OPTIONS.find((option) => option.value === entry.entryType)?.label ?? entry.entryType;
    const lines = entry.lines.filter((entryLine) => (
      entryLine.statementType === reportType
      && entryLine.lineCode === line.lineCode
      && (entryLine.periodBasis ?? "current") === "current"
    ));
    if (lines.length === 0) return [];
    const notes = [...new Set(lines.map((entryLine) => entryLine.note).filter((note): note is string => Boolean(note)))];
    return [{
      key: `${entry.id}-${line.lineCode}`,
      entryNo: entry.entryNo,
      title: entry.title,
      typeLabel,
      companies: [...new Set(lines.map((entryLine) => entryLine.companyCode))].join(" ↔ "),
      amount: money(lines.reduce((sum, entryLine) => sum + (line.side === "debit"
        ? entryLine.debit - entryLine.credit
        : entryLine.credit - entryLine.debit), 0)),
      note: notes.join("；") || entry.description,
    }];
  });
}

export function consolidationWorkpaperOpenItems(
  comparisons: readonly ConsolidationAdjustmentComparison[],
  entries: readonly ConsolidationEntrySnapshot[],
): ConsolidationWorkpaperOpenItem[] {
  const activeEntryIds = new Set(entries
    .filter((entry) => entry.status === "draft" || entry.status === "approved")
    .map((entry) => entry.id));
  return comparisons.flatMap((comparison) => {
    const alreadyIncluded = comparison.reviewStatus === "approved"
      || comparison.reviewStatus === "calculated"
      || comparison.entryId !== null && activeEntryIds.has(comparison.entryId);
    if (alreadyIncluded) return [];
    const leftCurrency = comparison.leftCurrencyCode ? ` ${comparison.leftCurrencyCode}` : "";
    const rightCurrency = comparison.rightCurrencyCode ? ` ${comparison.rightCurrencyCode}` : "";
    return [{
      key: comparison.key,
      categoryLabel: comparisonCategoryLabel(comparison.category),
      title: comparison.title,
      parties: `${comparison.leftCompany} ↔ ${comparison.rightCompany}`,
      bookAmounts: `${comparison.leftDirection} ${comparison.leftAmount.toFixed(2)}${leftCurrency} / ${comparison.rightDirection} ${comparison.rightAmount.toFixed(2)}${rightCurrency}`,
      difference: comparison.difference,
      currencyCode: comparison.differenceCurrencyCode,
      statusLabel: comparisonStatusLabel(comparison),
      actionLabel: comparison.treatmentLabel,
    }];
  });
}

export function consolidationWorkpaperEvidenceItems(
  comparisons: readonly ConsolidationAdjustmentComparison[],
  entries: readonly ConsolidationEntrySnapshot[],
): ConsolidationWorkpaperOpenItem[] {
  const activeEntryIds = new Set(entries
    .filter((entry) => entry.status === "draft" || entry.status === "approved")
    .map((entry) => entry.id));
  return comparisons.flatMap((comparison) => {
    if (comparison.treatmentKind !== "confirmOpeningEquitySource"
      || comparison.entryId === null
      || !activeEntryIds.has(comparison.entryId)) return [];
    const [item] = consolidationWorkpaperOpenItems([{ ...comparison, entryId: null }], []);
    return item ? [{
      ...item,
      statusLabel: "金额已处理",
      actionLabel: "补充原始出资证明",
    }] : [];
  });
}

function comparisonCategoryLabel(category: ConsolidationAdjustmentComparison["category"]) {
  return {
    investment: "投资与权益",
    intercompany: "内部往来",
    reclassification: "重分类",
    translation: "外币折算",
  }[category];
}

function comparisonStatusLabel(comparison: ConsolidationAdjustmentComparison) {
  if (comparison.reviewStatus === "returned") return "已退回";
  if (comparison.status === "difference") return "存在差额";
  if (comparison.status === "missingCounterpart") return "缺少对方";
  if (comparison.status === "unresolved") return "尚未解析";
  if (comparison.status === "pendingCalculation") return "待计算";
  return "待生成抵销";
}
