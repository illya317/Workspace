import type { ConsolidatedOutputLine } from "@workspace/finance/types";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { consolidatedMoney as money } from "./consolidated-line-amounts";

export interface CashFlowMonthlySource {
  periodEnd: string;
  lines: Array<{ lineCode: string; amount: number }>;
}

const SOURCE_DERIVATIONS: Record<string, { add: string[]; subtract?: string[] }> = {
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

function validateMonthlySource(
  flows: readonly CashFlowMonthlySource[],
  entityLabel: string,
  periodBasis: "current" | "comparative",
): DomainValidationResult<true> {
  for (const month of flows) {
    const byCode = new Map(month.lines.map((line) => [line.lineCode, line.amount]));
    for (const [lineCode, derivation] of Object.entries(SOURCE_DERIVATIONS)) {
      const dependencyCodes = [...derivation.add, ...(derivation.subtract ?? [])];
      if (!byCode.has(lineCode) || dependencyCodes.some((code) => !byCode.has(code))) continue;
      const expected = money(
        derivation.add.reduce((sum, code) => sum + byCode.get(code)!, 0)
          - (derivation.subtract ?? []).reduce((sum, code) => sum + byCode.get(code)!, 0),
      );
      const actual = money(byCode.get(lineCode)!);
      if (actual === expected) continue;
      const difference = money(actual - expected);
      return failCommand(
        `${entityLabel} ${month.periodEnd.slice(0, 7)} ${periodBasis === "current" ? "本期" : "比较期"}现金流来源行 ${lineCode} 与明细相差 ${difference.toFixed(2)}，不是外币折算舍入差额`,
        409,
        "cashFlowSourceReconciliation",
      );
    }
  }
  return okCommand(true);
}

function linePeriodAmount(line: ConsolidatedOutputLine, period: "current" | "comparative" | "currentMonth") {
  if (period === "current") return line.amount;
  if (period === "comparative") return line.previousAmount;
  return line.currentMonthAmount;
}

function derivedPeriodAmount(
  byCode: ReadonlyMap<string, ConsolidatedOutputLine>,
  derivation: { add: string[]; subtract?: string[] },
  period: "current" | "comparative" | "currentMonth",
) {
  const dependencyCodes = [...derivation.add, ...(derivation.subtract ?? [])];
  if (dependencyCodes.some((code) => !byCode.has(code))) return undefined;
  const values = dependencyCodes.map((code) => linePeriodAmount(byCode.get(code)!, period));
  if (values.some((value) => value === undefined)) return undefined;
  return money(
    derivation.add.reduce((sum, code) => sum + linePeriodAmount(byCode.get(code)!, period)!, 0)
      - (derivation.subtract ?? []).reduce((sum, code) => sum + linePeriodAmount(byCode.get(code)!, period)!, 0),
  );
}

function setTranslatedSourceAmounts(
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

function recomputeTranslatedLines(entityLabel: string, lines: ConsolidatedOutputLine[]) {
  const byCode = new Map(lines.map((line) => [line.lineCode, line]));
  for (const [lineCode, derivation] of Object.entries(SOURCE_DERIVATIONS)) {
    if (["netIncrease", "endingCash"].includes(lineCode)) continue;
    const line = byCode.get(lineCode);
    if (!line) continue;
    const current = derivedPeriodAmount(byCode, derivation, "current");
    const comparative = derivedPeriodAmount(byCode, derivation, "comparative");
    if (current === undefined || comparative === undefined) continue;
    setTranslatedSourceAmounts(line, current, comparative, derivedPeriodAmount(byCode, derivation, "currentMonth"));
  }
  const opening = byCode.get("openingCash");
  const ending = byCode.get("endingCash");
  const fx = byCode.get("fxEffect");
  const operating = byCode.get("operatingNet");
  const investing = byCode.get("investingNet");
  const financing = byCode.get("financingNet");
  const netIncrease = byCode.get("netIncrease");
  if (!opening || !ending || !fx || !operating || !investing || !financing || !netIncrease) {
    return failCommand(`${entityLabel} 缺少现金流量表汇率变动影响勾稽行`, 409, "cashFlowTranslation");
  }
  const currentFx = money(ending.amount - opening.amount - operating.amount - investing.amount - financing.amount);
  const comparativeFx = money(
    ending.previousAmount - opening.previousAmount
      - operating.previousAmount - investing.previousAmount - financing.previousAmount,
  );
  const currentMonthFx = ending.currentMonthAmount === undefined || opening.currentMonthAmount === undefined
    ? undefined
    : money(
      ending.currentMonthAmount - opening.currentMonthAmount
        - (operating.currentMonthAmount ?? 0) - (investing.currentMonthAmount ?? 0) - (financing.currentMonthAmount ?? 0),
    );
  setTranslatedSourceAmounts(fx, currentFx, comparativeFx, currentMonthFx);
  const netDerivation = SOURCE_DERIVATIONS.netIncrease!;
  setTranslatedSourceAmounts(
    netIncrease,
    derivedPeriodAmount(byCode, netDerivation, "current")!,
    derivedPeriodAmount(byCode, netDerivation, "comparative")!,
    derivedPeriodAmount(byCode, netDerivation, "currentMonth"),
  );
  const currentDifference = money(ending.amount - opening.amount - netIncrease.amount);
  const comparativeDifference = money(ending.previousAmount - opening.previousAmount - netIncrease.previousAmount);
  if (currentDifference !== 0 || comparativeDifference !== 0) {
    return failCommand(
      `${entityLabel} 折算后现金期末勾稽失败：本期 ${currentDifference.toFixed(2)}，比较期 ${comparativeDifference.toFixed(2)}`,
      409,
      "cashFlowTranslation",
    );
  }
  return okCommand(lines);
}

export function monthlyTranslatedAmount(
  flows: CashFlowMonthlySource[],
  rates: ReadonlyMap<string, number>,
  lineCode: string,
): DomainValidationResult<{ sourceAmount: number; translatedAmount: number; currentMonthSourceAmount: number; currentMonthAmount: number }> {
  if (flows.length === 0) return failCommand("CAD 期间发生额缺少逐月来源快照", 409, "monthlyFlows");
  let sourceAmount = 0;
  let translatedAmount = 0;
  for (const month of flows) {
    const rate = rates.get(month.periodEnd);
    if (!rate) return failCommand(`CAD 期间发生额缺少 ${month.periodEnd.slice(0, 7)} 月平均汇率`, 409, "rateApplications");
    const amount = month.lines.find((line) => line.lineCode === lineCode)?.amount;
    if (amount === undefined) return failCommand(`CAD 月度来源缺少报表行 ${lineCode}`, 409, "monthlyFlows");
    sourceAmount += amount;
    translatedAmount += money(amount * rate);
  }
  const currentMonth = flows.at(-1)!;
  const currentMonthSourceAmount = currentMonth.lines.find((line) => line.lineCode === lineCode)?.amount;
  if (currentMonthSourceAmount === undefined) return failCommand(`CAD 当月来源缺少报表行 ${lineCode}`, 409, "monthlyFlows");
  return okCommand({
    sourceAmount: money(sourceAmount),
    translatedAmount: money(translatedAmount),
    currentMonthSourceAmount: money(currentMonthSourceAmount),
    currentMonthAmount: money(currentMonthSourceAmount * rates.get(currentMonth.periodEnd)!),
  });
}

export function reconcileCadCashFlowTranslation(input: {
  entityLabel: string;
  currentFlows: readonly CashFlowMonthlySource[];
  comparativeFlows: readonly CashFlowMonthlySource[];
  translatedLines: ConsolidatedOutputLine[];
}) {
  const currentCheck = validateMonthlySource(input.currentFlows, input.entityLabel, "current");
  if (!currentCheck.ok) return currentCheck;
  const comparativeCheck = validateMonthlySource(input.comparativeFlows, input.entityLabel, "comparative");
  if (!comparativeCheck.ok) return comparativeCheck;
  return recomputeTranslatedLines(input.entityLabel, input.translatedLines);
}
