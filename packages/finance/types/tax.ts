export type FinanceSourceTraceInput = {
  sourceKind?: string | null;
  sourceReleaseId?: string | null;
  sourceSha256?: string | null;
  sourceFile?: string | null;
  sourceSheet?: string | null;
  sourceRow?: number | null;
  sourceRange?: string | null;
  sourceKey?: string | null;
};

export type TaxScope = { companyCode: string; year: number; month: number };

export type TaxRegistrationWriteInput = FinanceSourceTraceInput & {
  companyCode: string;
  taxTypeId: number;
  authorityName?: string | null;
  registrationNo: string;
  jurisdiction: string;
  filingFrequency: "monthly" | "quarterly" | "annual" | "event";
  effectiveFrom: string;
  effectiveThrough?: string | null;
  status: "draft" | "active" | "suspended" | "ended";
};

export type TaxAccrualLineInput = FinanceSourceTraceInput & {
  id?: number;
  voucherItemId?: number | null;
  lineNo: number;
  recognitionOn?: string | null;
  description: string;
  taxBaseAmount?: number | null;
  taxRate?: number | null;
  quantity?: number | null;
  unitRate?: number | null;
  divisor?: number | null;
  sourceReportedTaxAmount?: number | null;
};

export type TaxWorkpaperWriteInput = FinanceSourceTraceInput & {
  registrationId: number;
  periodId: number;
  companyCode: string;
  year: number;
  month: number;
  status: "draft" | "prepared" | "reconciled" | "blocked";
  note?: string | null;
  accrualLines: TaxAccrualLineInput[];
};

export type TaxFilingWriteInput = FinanceSourceTraceInput & {
  registrationId: number;
  periodId: number;
  companyCode: string;
  year: number;
  month: number;
  filingReference?: string | null;
  filedOn?: string | null;
  status: "draft" | "filed" | "accepted" | "amended" | "cancelled";
  currencyCode: string;
  sourceReportedDeclaredAmount?: number | null;
  sourceReportedPayableAmount?: number | null;
  note?: string | null;
};

export type TaxPaymentAllocationInput = FinanceSourceTraceInput & {
  filingId: number;
  voucherItemId?: number | null;
  allocatedAmount: number;
};

export type TaxPaymentAppendInput = FinanceSourceTraceInput & {
  companyCode: string;
  paymentKind: "payment" | "refund" | "reversal";
  paidOn: string;
  amount: number;
  currencyCode: string;
  paymentReference?: string | null;
  note?: string | null;
  reversesPaymentId?: number | null;
  idempotencyKey: string;
  allocations: TaxPaymentAllocationInput[];
};

export type TaxCreateInput =
  | ({ kind: "registration_create" } & TaxRegistrationWriteInput)
  | ({ kind: "workpaper_create" } & TaxWorkpaperWriteInput)
  | ({ kind: "filing_create" } & TaxFilingWriteInput)
  | ({ kind: "payment_append" } & TaxPaymentAppendInput);

export type TaxUpdateInput =
  | ({ kind: "registration_update"; id: number; version: number } & TaxRegistrationWriteInput)
  | ({ kind: "workpaper_update"; id: number; version: number } & TaxWorkpaperWriteInput)
  | ({ kind: "filing_update"; id: number; version: number } & TaxFilingWriteInput);

export type TaxBlockerDto = {
  code: string;
  message: string;
  entityKind: string;
  entityId: number | null;
  deepLink: string;
};

export type TaxWorkspaceDto = {
  scope: TaxScope & { periodId: number | null; isClosed: boolean };
  taxTypes: Array<Record<string, unknown>>;
  registrations: Array<Record<string, unknown>>;
  workpapers: Array<Record<string, unknown>>;
  filings: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  reconciliationSnapshots: Array<Record<string, unknown>>;
  blockers: TaxBlockerDto[];
  evidenceRefs: string[];
};
