export interface Company {
  code: string;
  name: string;
}

export type ImportType = "balance" | "journal" | "account" | "auxiliary";

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

export interface PreviewAuxiliaryBalance {
  accountCode: string;
  accountName: string;
  dimensionType: "customer" | "supplier" | "person";
  dimensionCode: string;
  dimensionName: string;
  closingDebit: number;
  closingCredit: number;
}

export interface PreviewResult {
  type: ImportType;
  companyCode: string;
  year: number;
  sourceFileName?: string;
  rows: number;
  accounts: PreviewAccount[];
  balances?: PreviewBalance[];
  vouchers?: PreviewVoucher[];
  auxiliaryBalances?: PreviewAuxiliaryBalance[];
  errors: string[];
  warnings: string[];
}
