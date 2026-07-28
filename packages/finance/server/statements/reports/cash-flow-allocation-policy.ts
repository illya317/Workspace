export interface CashSideItem {
  debit: number;
  credit: number;
  account: { code: string };
}

const CASH_ACCOUNT_PREFIXES = ["1001", "1002", "1012"];

function isCashAccount(code: string) {
  return CASH_ACCOUNT_PREFIXES.some((prefix) => code.startsWith(prefix));
}

export function normalizeCashFlowAllocationAmount(input: {
  amount: number;
  lineDirection: "in" | "out" | "net";
  ownerVoucherItem: CashSideItem | null;
  counterpartItem: CashSideItem | null;
}) {
  const cashItems = [input.ownerVoucherItem, input.counterpartItem]
    .filter((item): item is CashSideItem => item !== null && isCashAccount(item.account.code));
  const cashNet = cashItems.reduce((sum, item) => sum + item.debit - item.credit, 0);
  const actualDirection = cashNet > 0 ? "in" : cashNet < 0 ? "out" : null;
  const directionSign = actualDirection && input.lineDirection !== "net" && actualDirection !== input.lineDirection
    ? -1
    : 1;
  return Math.abs(input.amount) * directionSign;
}
