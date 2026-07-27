import type { ConsolidatedOutputLine } from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  consolidatedMoney as money,
  setDerivedLineAmounts,
} from "./consolidated-line-amounts";

const PROFIT_ATTRIBUTION_LINE_CODES = new Set(["netProfitAttributableToParent", "netProfitAttributableToNci"]);

export function recomputeConsolidatedIncome(lines: ConsolidatedOutputLine[]): DomainValidationResult<true> {
  let amount = 0;
  let currentMonthAmount = 0;
  let hasCurrentMonthAmount = false;
  let previousAmount = 0;
  for (const line of lines) {
    if (PROFIT_ATTRIBUTION_LINE_CODES.has(line.lineCode)) continue;
    if (line.isTotal || line.isGrandTotal) {
      setDerivedLineAmounts(line, amount, previousAmount, hasCurrentMonthAmount ? currentMonthAmount : undefined);
      continue;
    }
    if (line.isHeader) continue;
    amount = money(amount + (line.subtract ? -line.amount : line.amount));
    if (line.currentMonthAmount !== undefined) {
      hasCurrentMonthAmount = true;
      currentMonthAmount = money(
        currentMonthAmount + (line.subtract ? -line.currentMonthAmount : line.currentMonthAmount),
      );
    }
    previousAmount = money(previousAmount + (line.subtract ? -line.previousAmount : line.previousAmount));
  }
  const byCode = new Map(lines.map((line) => [line.lineCode, line]));
  const netProfit = byCode.get("netProfit");
  const parent = byCode.get("netProfitAttributableToParent");
  const nci = byCode.get("netProfitAttributableToNci");
  if ((parent && !nci) || (!parent && nci)) {
    return failCommand("合并利润表少数股东损益归属行不完整", 409, "nonControllingInterest");
  }
  if (parent && nci && netProfit) {
    if (money(parent.adjustmentAmount) !== 0
      && money(parent.adjustmentAmount + nci.adjustmentAmount) !== 0) {
      return failCommand("归母净利润与少数股东损益分配分录不平衡", 409, "nonControllingInterest");
    }
    if (money(parent.previousAdjustmentAmount ?? 0) !== 0
      && money((parent.previousAdjustmentAmount ?? 0) + (nci.previousAdjustmentAmount ?? 0)) !== 0) {
      return failCommand("比较期归母净利润与少数股东损益分配分录不平衡", 409, "nonControllingInterest");
    }
    nci.sourceAmount = 0;
    nci.amount = money(nci.adjustmentAmount);
    if (nci.currentMonthAmount !== undefined) {
      nci.currentMonthSourceAmount = 0;
      nci.currentMonthAmount = money(nci.currentMonthAdjustmentAmount ?? 0);
    }
    nci.previousSourceAmount = 0;
    nci.previousAmount = money(nci.previousAdjustmentAmount ?? 0);
    parent.sourceAmount = netProfit.sourceAmount;
    if (netProfit.currentMonthAmount !== undefined) {
      parent.currentMonthSourceAmount = netProfit.currentMonthSourceAmount ?? netProfit.currentMonthAmount;
    }
    parent.previousSourceAmount = netProfit.previousSourceAmount ?? netProfit.previousAmount;
    setDerivedLineAmounts(
      parent,
      netProfit.amount - nci.amount,
      netProfit.previousAmount - nci.previousAmount,
      netProfit.currentMonthAmount === undefined
        ? undefined
        : netProfit.currentMonthAmount - (nci.currentMonthAmount ?? 0),
    );
  }
  return okCommand(true);
}
