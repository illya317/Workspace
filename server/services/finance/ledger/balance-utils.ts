export type SideBalance = {
  debit: number;
  credit: number;
};

export type ComputedBalance = {
  accountId: number;
  accountCode: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
};

export type FinanceAccountLike = {
  id: number;
  code: string;
  parentId: number | null;
  balanceDirection: string;
};

// 基准年份不再硬编码，改为从 FinanceBalanceSnapshot 动态查询 isActive baseline

export function toSides(
  balanceDirection: string,
  openingDebit: number,
  openingCredit: number,
  currentDebit: number,
  currentCredit: number,
): SideBalance {
  if (balanceDirection === "debit") {
    const net = openingDebit - openingCredit + currentDebit - currentCredit;
    return net >= 0 ? { debit: net, credit: 0 } : { debit: 0, credit: -net };
  }

  const net = openingCredit - openingDebit + currentCredit - currentDebit;
  return net >= 0 ? { debit: 0, credit: net } : { debit: -net, credit: 0 };
}

export function addToMap(map: Map<string, SideBalance>, code: string, debit: number, credit: number) {
  const current = map.get(code) || { debit: 0, credit: 0 };
  current.debit += debit;
  current.credit += credit;
  map.set(code, current);
}

export function rollUpByParent(accounts: FinanceAccountLike[], direct: Map<string, SideBalance>) {
  const totals = new Map<string, SideBalance>();
  for (const [code, value] of direct.entries()) {
    totals.set(code, { ...value });
  }

  const idToCode = new Map(accounts.map((account) => [account.id, account.code]));
  const sorted = [...accounts].sort((a, b) => b.code.length - a.code.length);

  for (const account of sorted) {
    if (!account.parentId) continue;
    const parentCode = idToCode.get(account.parentId);
    const value = totals.get(account.code);
    if (!parentCode || !value) continue;
    addToMap(totals, parentCode, value.debit, value.credit);
  }

  return totals;
}
