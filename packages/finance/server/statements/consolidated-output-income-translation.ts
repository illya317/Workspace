import type { ConsolidatedOutputLine } from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { CashFlowMonthlySource } from "./consolidated-output-cash-flow";
import { consolidatedMoney as money } from "./consolidated-line-amounts";
import type { FrozenReportLine } from "./consolidated-output-translation-prior";
import type { TranslationTracePolicy } from "./consolidated-output-translation-traces";
import type { ConsolidationReplayPackage } from "./consolidation-replay";

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

function payloadMonthlyFlows(reportPayload: unknown): CashFlowMonthlySource[] | null {
  const envelope = record(reportPayload);
  const facts = record(envelope?.translationFacts);
  const monthlyFlows = record(facts?.monthlyFlows);
  const rows = monthlyFlows?.current;
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

function payloadFlowLines(reportPayload: unknown) {
  const envelope = record(reportPayload);
  const payload = record(envelope?.payload) ?? envelope;
  return Array.isArray(payload?.lines) ? payload.lines : null;
}

function parseFrozenLine(value: unknown): FrozenReportLine | null {
  const row = record(value);
  if (!row) return null;
  const amount = finiteNumber(row.amount);
  const previousAmount = finiteNumber(row.previousAmount);
  const lineCode = typeof row.lineCode === "string" ? row.lineCode.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const section = typeof row.section === "string" ? row.section.trim() : "";
  const side = row.side === "debit" || row.side === "credit" ? row.side : null;
  if (!lineCode || !label || !section || !side || amount === null || previousAmount === null) return null;
  return {
    lineCode,
    label,
    code: typeof row.code === "string" && row.code.trim() ? row.code : null,
    amount,
    previousAmount,
    section,
    side,
    direction: row.direction === "in" || row.direction === "out" || row.direction === "net" ? row.direction : null,
    subtract: row.subtract === true,
    isHeader: row.isHeader === true,
    isTotal: row.isTotal === true,
    isGrandTotal: row.isGrandTotal === true,
  };
}

/** 未分配利润滚算所需的逐月折算净利润(本期)。 */
export function translatedEntityNetProfit(
  sources: ConsolidationReplayPackage["sources"],
  policy: Extract<TranslationTracePolicy, { currency: "CAD" }>,
) {
  const source = sources.find((item) => item.entitySnapshotId === policy.entitySnapshotId && item.reportType === "incomeStatement");
  const flows = source ? payloadMonthlyFlows(source.reportPayload) : null;
  if (!flows) return failCommand(`${policy.entityLabel} 缺少未分配利润滚算所需的逐月利润表`, 409, "monthlyFlows");
  const sourceRows = payloadFlowLines(source?.reportPayload);
  if (!sourceRows) return failCommand(`${policy.entityLabel} 的利润表来源快照不可重放`, 409, "reportPayload");
  const definitions = sourceRows.map(parseFrozenLine);
  if (definitions.some((line) => line === null)) {
    return failCommand("CAD 利润表来源缺少规范行标识或借贷方向", 409, "reportPayload");
  }
  return monthlyTranslatedIncomeAmount(flows, policy.flowRates.current, definitions as FrozenReportLine[], "netProfit");
}

export interface IncomeTranslationDefinition {
  lineCode: string;
  subtract: boolean;
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
}

function setDerivedAmounts(
  line: ConsolidatedOutputLine,
  amount: number,
  previousAmount: number,
  currentMonthAmount: number | undefined,
) {
  line.amount = money(amount);
  line.sourceAmount = line.amount;
  line.adjustmentAmount = 0;
  line.previousAmount = money(previousAmount);
  line.previousSourceAmount = line.previousAmount;
  line.previousAdjustmentAmount = 0;
  if (currentMonthAmount === undefined) return;
  line.currentMonthAmount = money(currentMonthAmount);
  line.currentMonthSourceAmount = line.currentMonthAmount;
  line.currentMonthAdjustmentAmount = 0;
}

export function recomputeTranslatedIncome(lines: ConsolidatedOutputLine[]) {
  let amount = 0;
  let previousAmount = 0;
  let currentMonthAmount = 0;
  let hasCurrentMonthAmount = false;
  for (const line of lines) {
    if (["netProfitAttributableToParent", "netProfitAttributableToNci"].includes(line.lineCode)) continue;
    if (line.isTotal || line.isGrandTotal) {
      setDerivedAmounts(line, amount, previousAmount, hasCurrentMonthAmount ? currentMonthAmount : undefined);
      continue;
    }
    if (line.isHeader) continue;
    amount = money(amount + (line.subtract ? -line.amount : line.amount));
    previousAmount = money(previousAmount + (line.subtract ? -line.previousAmount : line.previousAmount));
    if (line.currentMonthAmount !== undefined) {
      hasCurrentMonthAmount = true;
      currentMonthAmount = money(
        currentMonthAmount + (line.subtract ? -line.currentMonthAmount : line.currentMonthAmount),
      );
    }
  }
  return lines;
}

export function monthlyTranslatedIncomeAmount(
  flows: CashFlowMonthlySource[],
  rates: ReadonlyMap<string, number>,
  definitions: IncomeTranslationDefinition[],
  lineCode: string,
): DomainValidationResult<{ sourceAmount: number; translatedAmount: number; currentMonthSourceAmount: number; currentMonthAmount: number }> {
  if (flows.length === 0) return failCommand("CAD 利润表缺少逐月来源快照", 409, "monthlyFlows");
  let sourceAmount = 0;
  let translatedAmount = 0;
  let currentMonthSourceAmount = 0;
  let currentMonthAmount = 0;
  for (const month of flows) {
    const rate = rates.get(month.periodEnd);
    if (!rate) return failCommand(`CAD 期间发生额缺少 ${month.periodEnd.slice(0, 7)} 月平均汇率`, 409, "rateApplications");
    const byCode = new Map(month.lines.map((line) => [line.lineCode, line.amount]));
    let monthSource = 0;
    let monthTranslated = 0;
    let found = false;
    for (const definition of definitions) {
      if (["netProfitAttributableToParent", "netProfitAttributableToNci"].includes(definition.lineCode)) continue;
      if (definition.isTotal || definition.isGrandTotal) {
        if (definition.lineCode === lineCode) {
          found = true;
          break;
        }
        continue;
      }
      if (definition.isHeader) continue;
      const value = byCode.get(definition.lineCode);
      if (value === undefined) return failCommand(`CAD 月度来源缺少报表行 ${definition.lineCode}`, 409, "monthlyFlows");
      monthSource = money(monthSource + (definition.subtract ? -value : value));
      const translated = money(value * rate);
      monthTranslated = money(monthTranslated + (definition.subtract ? -translated : translated));
    }
    if (!found) return failCommand(`CAD 利润表缺少派生行 ${lineCode}`, 409, "reportPayload");
    sourceAmount = money(sourceAmount + monthSource);
    translatedAmount = money(translatedAmount + monthTranslated);
    currentMonthSourceAmount = monthSource;
    currentMonthAmount = monthTranslated;
  }
  return okCommand({ sourceAmount, translatedAmount, currentMonthSourceAmount, currentMonthAmount });
}
