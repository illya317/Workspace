import type { FinanceCloseScope } from "../../types/close";

type EffectiveRange = { openedOn: string | null; closedOn: string | null };
type LoanRange = { startOn: string; endOn: string | null; status: string };

export function financeClosePeriodBounds(scope: FinanceCloseScope) {
  return {
    start: `${scope.year}-${String(scope.month).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(scope.year, scope.month, 0)).toISOString().slice(0, 10),
  };
}

export function bankAccountAppliesToClosePeriod(account: EffectiveRange, scope: FinanceCloseScope) {
  const period = financeClosePeriodBounds(scope);
  return (!account.openedOn || account.openedOn <= period.end)
    && (!account.closedOn || account.closedOn >= period.start);
}

export function loanAppliesToClosePeriod(loan: LoanRange, scope: FinanceCloseScope) {
  const period = financeClosePeriodBounds(scope);
  return loan.startOn <= period.end && (!loan.endOn || loan.endOn >= period.start);
}

export function cancelledLoanNeedsCloseReview(loan: LoanRange, scope: FinanceCloseScope) {
  return loan.status === "cancelled" && loanAppliesToClosePeriod(loan, scope);
}
