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
