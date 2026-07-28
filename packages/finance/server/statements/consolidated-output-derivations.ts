import type { ConsolidatedOutputLine } from "@workspace/finance/types";

import {
  consolidatedMoney as money,
  setDerivedLineAmounts,
  sumLineAmounts,
} from "./consolidated-line-amounts";

export function recomputeConsolidatedBalance(lines: ConsolidatedOutputLine[]) {
  for (const line of lines.filter((candidate) => candidate.isTotal)) {
    const total = sumLineAmounts(lines, (candidate) => (
      candidate.section === line.section
      && !candidate.isHeader
      && !candidate.isTotal
      && !candidate.isGrandTotal
    ));
    setDerivedLineAmounts(line, total.amount, total.previousAmount, total.currentMonthAmount);
  }
  const grandSections: Record<string, string[]> = {
    totalAssets: ["currentAssets", "nonCurrentAssets"],
    totalLiabilities: ["currentLiabilities", "nonCurrentLiabilities"],
  };
  for (const line of lines.filter((candidate) => candidate.isGrandTotal)) {
    const sections = grandSections[line.lineCode];
    if (!sections) continue;
    const total = sumLineAmounts(lines, (candidate) => candidate.isTotal && sections.includes(candidate.section));
    setDerivedLineAmounts(line, total.amount, total.previousAmount, total.currentMonthAmount);
  }
}

const CASH_FLOW_DERIVATIONS: Record<string, { add: string[]; subtract?: string[] }> = {
  operatingInSubtotal: { add: ["salesReceipt", "taxRefund", "otherOpIn"] },
  operatingOutSubtotal: { add: ["purchasePayment", "staffPayment", "taxPayment", "otherOpOut"] },
  operatingNet: { add: ["operatingInSubtotal"], subtract: ["operatingOutSubtotal"] },
  investingInSubtotal: { add: ["investRecovery", "investIncome", "fixedAssetDisposal", "subsidiaryDisposal", "otherInvIn"] },
  investingOutSubtotal: { add: ["fixedAssetPurchase", "investPayment", "subsidiaryAcquisition", "otherInvOut"] },
  investingNet: { add: ["investingInSubtotal"], subtract: ["investingOutSubtotal"] },
  financingInSubtotal: { add: ["capitalInjection", "loanReceipt", "otherFinIn"] },
  financingOutSubtotal: { add: ["loanRepayment", "dividendPayment", "otherFinOut"] },
  financingNet: { add: ["financingInSubtotal"], subtract: ["financingOutSubtotal"] },
};

export function recomputeConsolidatedCashFlow(lines: ConsolidatedOutputLine[]) {
  const byCode = new Map(lines.map((line) => [line.lineCode, line]));
  for (const [lineCode, derivation] of Object.entries(CASH_FLOW_DERIVATIONS)) {
    const line = byCode.get(lineCode);
    if (!line) continue;
    const add = sumLineAmounts(lines, (candidate) => derivation.add.includes(candidate.lineCode));
    const subtract = sumLineAmounts(lines, (candidate) => derivation.subtract?.includes(candidate.lineCode) ?? false);
    const currentMonthAmount = add.currentMonthAmount === undefined && subtract.currentMonthAmount === undefined
      ? undefined
      : (add.currentMonthAmount ?? 0) - (subtract.currentMonthAmount ?? 0);
    setDerivedLineAmounts(
      line,
      add.amount - subtract.amount,
      add.previousAmount - subtract.previousAmount,
      currentMonthAmount,
    );
  }
  const openingCash = byCode.get("openingCash");
  const endingCash = byCode.get("endingCash");
  const operatingNet = byCode.get("operatingNet");
  const investingNet = byCode.get("investingNet");
  const financingNet = byCode.get("financingNet");
  const fxEffect = byCode.get("fxEffect");
  const netIncrease = byCode.get("netIncrease");
  if (!openingCash || !endingCash || !operatingNet || !investingNet || !financingNet || !fxEffect || !netIncrease) return;
  const flowNet = (key: "amount" | "previousAmount" | "currentMonthAmount") => (
    (operatingNet[key] ?? 0) + (investingNet[key] ?? 0) + (financingNet[key] ?? 0)
  );
  const currentMonthFx = endingCash.currentMonthAmount === undefined && openingCash.currentMonthAmount === undefined
    ? undefined
    : money((endingCash.currentMonthAmount ?? 0) - (openingCash.currentMonthAmount ?? 0) - flowNet("currentMonthAmount"));
  setDerivedLineAmounts(
    fxEffect,
    money(endingCash.amount - openingCash.amount - flowNet("amount")),
    money(endingCash.previousAmount - openingCash.previousAmount - flowNet("previousAmount")),
    currentMonthFx,
  );
  const net = sumLineAmounts(lines, (line) => ["operatingNet", "investingNet", "financingNet", "fxEffect"].includes(line.lineCode));
  setDerivedLineAmounts(netIncrease, net.amount, net.previousAmount, net.currentMonthAmount);
}
