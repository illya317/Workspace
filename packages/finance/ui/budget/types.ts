export interface DeptBudgetItem {
  dept: string;
  account: string;
  total: number;
  months: number[];
  expenseType: string;
  accountId: number | null;
  accountCode: string | null;
  accountActive: boolean | null;
}

export interface RdBudgetItem {
  project: string;
  category: string;
  total: number;
  months: number[];
  accountId: number | null;
  accountCode: string | null;
  accountActive: boolean | null;
}
