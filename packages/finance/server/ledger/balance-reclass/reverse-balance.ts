function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function currentReverseBalanceAmount(input: {
  closingDebit: number;
  closingCredit: number;
  account: { balanceDirection: string };
}): number | null {
  const net = roundMoney(input.closingDebit - input.closingCredit);
  if (net === 0) return null;
  const naturalSide = input.account.balanceDirection === "credit" ? "credit" : "debit";
  const balanceSide = net > 0 ? "debit" : "credit";
  return balanceSide === naturalSide ? null : Math.abs(net);
}
