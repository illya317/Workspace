import type { ConsolidatedOutputLine } from "@workspace/finance/types";

export function consolidatedMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function setDerivedLineAmounts(
  line: ConsolidatedOutputLine,
  amount: number,
  previousAmount: number,
  currentMonthAmount = line.currentMonthAmount,
) {
  const previousSourceAmount = line.previousSourceAmount ?? line.previousAmount;
  line.amount = consolidatedMoney(amount);
  line.previousAmount = consolidatedMoney(previousAmount);
  line.adjustmentAmount = consolidatedMoney(line.amount - line.sourceAmount);
  line.previousSourceAmount = previousSourceAmount;
  line.previousAdjustmentAmount = consolidatedMoney(line.previousAmount - previousSourceAmount);
  if (currentMonthAmount === undefined) return;
  const sourceAmount = line.currentMonthSourceAmount ?? line.currentMonthAmount ?? 0;
  line.currentMonthAmount = consolidatedMoney(currentMonthAmount);
  line.currentMonthSourceAmount = sourceAmount;
  line.currentMonthAdjustmentAmount = consolidatedMoney(line.currentMonthAmount - sourceAmount);
}

export function sumLineAmounts(
  lines: ConsolidatedOutputLine[],
  predicate: (line: ConsolidatedOutputLine) => boolean,
) {
  const matches = lines.filter(predicate);
  const hasCurrentMonthAmount = matches.some((line) => line.currentMonthAmount !== undefined);
  return {
    amount: consolidatedMoney(matches.reduce((sum, line) => sum + line.amount, 0)),
    currentMonthAmount: hasCurrentMonthAmount
      ? consolidatedMoney(matches.reduce((sum, line) => sum + (line.currentMonthAmount ?? 0), 0))
      : undefined,
    previousAmount: consolidatedMoney(matches.reduce((sum, line) => sum + line.previousAmount, 0)),
  };
}

export function applyCurrentMonthAdjustment(line: ConsolidatedOutputLine, delta: number) {
  if (line.currentMonthAmount === undefined) return;
  line.currentMonthAmount = consolidatedMoney(line.currentMonthAmount + delta);
  line.currentMonthAdjustmentAmount = consolidatedMoney((line.currentMonthAdjustmentAmount ?? 0) + delta);
}

export function translatedCurrentMonthAmounts(amount: number | undefined, rate: number) {
  if (amount === undefined) return {};
  const translated = consolidatedMoney(amount * rate);
  return {
    currentMonthAmount: translated,
    currentMonthSourceAmount: translated,
    currentMonthAdjustmentAmount: 0,
  };
}

export function mergeCurrentMonthAmounts(
  target: ConsolidatedOutputLine,
  source: ConsolidatedOutputLine,
) {
  if (target.currentMonthAmount === undefined && source.currentMonthAmount === undefined) return;
  target.currentMonthAmount = consolidatedMoney(
    (target.currentMonthAmount ?? 0) + (source.currentMonthAmount ?? 0),
  );
  target.currentMonthSourceAmount = consolidatedMoney(
    (target.currentMonthSourceAmount ?? 0) + (source.currentMonthSourceAmount ?? 0),
  );
  target.currentMonthAdjustmentAmount = 0;
}
