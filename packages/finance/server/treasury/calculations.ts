export const TREASURY_CALCULATION_VERSION = "treasury-v1";

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateBankReconciliation(input: {
  statementEndingBalance: number;
  ledgerEndingBalance: number;
  items: Array<{ itemKind: "bank_adjustment" | "ledger_adjustment"; amount: number; status: string }>;
}) {
  const openItems = input.items.filter((item) => item.status !== "cleared");
  const bankAdjustments = roundMoney(openItems
    .filter((item) => item.itemKind === "bank_adjustment")
    .reduce((sum, item) => sum + item.amount, 0));
  const ledgerAdjustments = roundMoney(openItems
    .filter((item) => item.itemKind === "ledger_adjustment")
    .reduce((sum, item) => sum + item.amount, 0));
  const adjustedBankBalance = roundMoney(input.statementEndingBalance + bankAdjustments);
  const adjustedLedgerBalance = roundMoney(input.ledgerEndingBalance + ledgerAdjustments);
  const difference = roundMoney(adjustedBankBalance - adjustedLedgerBalance);
  return { bankAdjustments, ledgerAdjustments, adjustedBankBalance, adjustedLedgerBalance, difference };
}

export function calculateInterestLine(input: {
  principalBasis: number;
  annualRate: number;
  dayCount: number;
  dayCountConvention: "actual_365" | "actual_360" | "30_360";
  sourceReportedInterestAmount?: number | null;
}) {
  const divisor = input.dayCountConvention === "actual_365" ? 365 : 360;
  const calculatedAmount = roundMoney(input.principalBasis * input.annualRate * input.dayCount / divisor);
  const sourceReportedAmount = input.sourceReportedInterestAmount ?? null;
  const sourceDifference = sourceReportedAmount === null
    ? null
    : roundMoney(calculatedAmount - sourceReportedAmount);
  return { divisor, calculatedAmount, sourceReportedAmount, sourceDifference };
}

export function calculateInterestWorkpaper(input: {
  dayCountConvention: "actual_365" | "actual_360" | "30_360";
  lines: Array<{ principalBasis: number; annualRate: number; dayCount: number; sourceReportedInterestAmount?: number | null }>;
  voucherLinks: Array<{ linkKind: string; amount: number }>;
}) {
  const lines = input.lines.map((line) => calculateInterestLine({ ...line, dayCountConvention: input.dayCountConvention }));
  const calculatedAmount = roundMoney(lines.reduce((sum, line) => sum + line.calculatedAmount, 0));
  const sourceReportedAmount = lines.every((line) => line.sourceReportedAmount === null)
    ? null
    : roundMoney(lines.reduce((sum, line) => sum + (line.sourceReportedAmount ?? 0), 0));
  const voucherAmount = roundMoney(input.voucherLinks.reduce((sum, link) => {
    const direction = link.linkKind === "reversal" ? -1 : 1;
    return sum + direction * link.amount;
  }, 0));
  return {
    lines,
    calculatedAmount,
    sourceReportedAmount,
    sourceDifference: sourceReportedAmount === null ? null : roundMoney(calculatedAmount - sourceReportedAmount),
    voucherAmount,
    voucherDifference: roundMoney(calculatedAmount - voucherAmount),
  };
}

export function calculateLoanPrincipalBalance(events: Array<{
  id: number;
  eventKind: string;
  amount: number;
  reversesEventId?: number | null;
}>) {
  const byId = new Map(events.map((event) => [event.id, event]));
  return roundMoney(events.reduce((sum, event) => {
    if (event.eventKind === "drawdown") return sum + event.amount;
    if (event.eventKind === "repayment") return sum - event.amount;
    if (event.eventKind === "reversal" && event.reversesEventId) {
      const reversed = byId.get(event.reversesEventId);
      if (reversed?.eventKind === "drawdown") return sum - event.amount;
      if (reversed?.eventKind === "repayment") return sum + event.amount;
    }
    return sum;
  }, 0));
}
