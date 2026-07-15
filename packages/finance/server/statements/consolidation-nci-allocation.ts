import type { ConsolidatedOutputLine } from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

const PROFIT_ATTRIBUTION_LINE_CODES = new Set(["netProfitAttributableToParent", "netProfitAttributableToNci"]);

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function setDerivedAmount(line: ConsolidatedOutputLine, amount: number, previousAmount: number) {
  const previousSourceAmount = line.previousSourceAmount ?? line.previousAmount;
  line.amount = money(amount);
  line.previousAmount = money(previousAmount);
  line.adjustmentAmount = money(line.amount - line.sourceAmount);
  line.previousSourceAmount = previousSourceAmount;
  line.previousAdjustmentAmount = money(line.previousAmount - previousSourceAmount);
}

export function recomputeConsolidatedIncome(lines: ConsolidatedOutputLine[]): DomainValidationResult<true> {
  let amount = 0;
  let previousAmount = 0;
  for (const line of lines) {
    if (PROFIT_ATTRIBUTION_LINE_CODES.has(line.lineCode)) continue;
    if (line.isTotal || line.isGrandTotal) {
      setDerivedAmount(line, amount, previousAmount);
      continue;
    }
    if (line.isHeader) continue;
    amount = money(amount + (line.subtract ? -line.amount : line.amount));
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
    if (money(parent.adjustmentAmount + nci.adjustmentAmount) !== 0) {
      return failCommand("归母净利润与少数股东损益分配分录不平衡", 409, "nonControllingInterest");
    }
    if (money((parent.previousAdjustmentAmount ?? 0) + (nci.previousAdjustmentAmount ?? 0)) !== 0) {
      return failCommand("比较期归母净利润与少数股东损益分配分录不平衡", 409, "nonControllingInterest");
    }
    nci.sourceAmount = 0;
    nci.amount = money(nci.adjustmentAmount);
    nci.previousSourceAmount = 0;
    nci.previousAmount = money(nci.previousAdjustmentAmount ?? 0);
    parent.sourceAmount = netProfit.sourceAmount;
    parent.previousSourceAmount = netProfit.previousSourceAmount ?? netProfit.previousAmount;
    setDerivedAmount(parent, netProfit.amount - nci.amount, netProfit.previousAmount - nci.previousAmount);
  }
  return okCommand(true);
}
