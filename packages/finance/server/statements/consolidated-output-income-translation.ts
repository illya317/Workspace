import type { ConsolidatedOutputLine } from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { CashFlowMonthlySource } from "./consolidated-output-cash-flow";
import { consolidatedMoney as money } from "./consolidated-line-amounts";

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
