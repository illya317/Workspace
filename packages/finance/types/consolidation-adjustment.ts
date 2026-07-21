export interface ConsolidationAdjustmentVoucherSource {
  voucherItemId: number;
  voucherNo: string;
  voucherDate: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  direction: "借" | "贷";
  amount: number;
  currencyCode: string;
}
