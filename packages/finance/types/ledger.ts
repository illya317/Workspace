export interface Account {
  id: number;
  code: string;
  name: string;
}

export interface VoucherItem {
  id: number;
  accountId: number;
  account: Account;
  debit: number;
  credit: number;
  description: string;
  sortOrder: number;
  relatedEntity?: string | null;
}

export interface Period {
  id: number;
  year: number;
  month: number;
}

export interface Voucher {
  id: number;
  voucherNo: string;
  date: string;
  periodId: number;
  period: Period;
  description: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
  companyCode: string | null;
  items: VoucherItem[];
}

export interface VoucherResponse {
  vouchers: Voucher[];
  total: number;
  page: number;
  pageSize: number;
}
