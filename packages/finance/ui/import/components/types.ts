export interface Company {
  id: number;
  code: string;
  name: string;
}

export interface PreviewAccount {
  code: string;
  name: string;
  parentCode: string | null;
  category: string;
  balanceDirection: string;
}

export interface PreviewBalance {
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface PreviewVoucherItem {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

export interface PreviewVoucher {
  voucherNo: string;
  date: string;
  description: string;
  items: PreviewVoucherItem[];
  totalDebit: number;
  totalCredit: number;
}

export interface PreviewResult {
  type: "balance" | "journal" | "account";
  companyCode: string;
  year: number;
  sourceFileName?: string;
  rows: number;
  accounts: PreviewAccount[];
  balances?: PreviewBalance[];
  vouchers?: PreviewVoucher[];
  errors: string[];
  warnings: string[];
}
