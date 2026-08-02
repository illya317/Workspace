export function moneyToCents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("会计金额必须是有限数值");
  const correction = amount === 0 ? 0 : Math.sign(amount) * Number.EPSILON;
  return Math.round((amount + correction) * 100);
}

export function moneyEquals(left: unknown, right: unknown): boolean {
  return moneyToCents(left) === moneyToCents(right);
}

export function moneyIsZero(value: unknown): boolean {
  return moneyToCents(value) === 0;
}

export function moneyIsNonZero(value: unknown): boolean {
  return moneyToCents(value) !== 0;
}

export function moneyExceeds(value: unknown, upperBound: unknown): boolean {
  return moneyToCents(value) > moneyToCents(upperBound);
}

export function moneyIsNegative(value: unknown): boolean {
  return moneyToCents(value) < 0;
}

type MoneyVoucher = {
  totalDebit: unknown;
  totalCredit: unknown;
  items: Array<{ accountCode: string; debit: unknown; credit: unknown }>;
};

export function voucherItemsMatchHeaderExact(voucher: MoneyVoucher): boolean {
  const itemDebitCents = voucher.items.reduce((sum, item) => sum + moneyToCents(item.debit), 0);
  const itemCreditCents = voucher.items.reduce((sum, item) => sum + moneyToCents(item.credit), 0);
  return itemDebitCents === moneyToCents(voucher.totalDebit)
    && itemCreditCents === moneyToCents(voucher.totalCredit);
}

export function voucherItemsAreFullyConsumed(
  voucher: MoneyVoucher,
  debitAccounts: ReadonlySet<string>,
  creditAccounts: ReadonlySet<string>,
): boolean {
  return voucher.items.every((item) => {
    const debitCents = moneyToCents(item.debit);
    const creditCents = moneyToCents(item.credit);
    if (debitCents < 0 || creditCents < 0 || (debitCents === 0) === (creditCents === 0)) return false;
    return debitCents > 0 ? debitAccounts.has(item.accountCode) : creditAccounts.has(item.accountCode);
  });
}
