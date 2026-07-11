import { NextResponse } from "next/server";
import { BalanceItem, ReportPeriod } from "../report-helpers";

export function generateCashFlow(period: ReportPeriod, balances: BalanceItem[]) {
  const cashAccounts = balances.filter((b) => {
    const code = b.account.code;
    return code.startsWith("1001") || code.startsWith("1002") || code.startsWith("1012");
  });
  const netCash = cashAccounts.reduce((s, b) => s + b.closingDebit - b.closingCredit, 0);
  return NextResponse.json({
    type: "cashflow",
    period,
    cashAccounts: cashAccounts.map((b) => ({
      code: b.account.code,
      name: b.account.name,
      opening: +(b.openingDebit - b.openingCredit).toFixed(2),
      closing: +(b.closingDebit - b.closingCredit).toFixed(2),
    })),
    netChange: +netCash.toFixed(2),
  });
}
