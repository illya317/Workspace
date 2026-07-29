import type {
  FinanceSourceTraceInput,
  TaxAccrualLineInput,
  TaxPaymentAllocationInput,
  TaxWorkspaceDto,
} from "../../types/tax";

export type TaxView = "accrual" | "filing-payment" | "reconciliation-evidence";
export type TaxCreateKind = "registration" | "workpaper" | "filing" | "payment";

export type TaxTypeRow = {
  id: number;
  code: string;
  name: string;
  jurisdiction: string;
  calculationMethod: string;
};

export type RegistrationRow = FinanceSourceTraceInput & {
  id: number;
  taxTypeId: number;
  authorityPartyId: number | null;
  registrationNo: string;
  jurisdiction: string;
  filingFrequency: "monthly" | "quarterly" | "annual" | "event";
  effectiveFrom: string;
  effectiveThrough: string | null;
  status: "draft" | "active" | "suspended" | "ended";
  version: number;
  taxType: TaxTypeRow | null;
  authorityPartyName: string | null;
};

export type AccrualLineRow = FinanceSourceTraceInput & TaxAccrualLineInput & {
  id: number;
  voucherItemLabel: string | null;
  method: "base_rate" | "quantity_unit_rate" | null;
  calculatedAmount: number | null;
  sourceReportedAmount: number | null;
  sourceDifference: number | null;
};

export type WorkpaperRow = FinanceSourceTraceInput & {
  id: number;
  registrationId: number;
  periodId: number;
  status: "draft" | "prepared" | "reconciled" | "blocked";
  calculationVersion: string;
  inputFingerprint: string;
  note: string | null;
  version: number;
  calculatedAmount: number | null;
  sourceReportedAmount: number | null;
  sourceDifference: number | null;
  accrualLines: AccrualLineRow[];
};

export type FilingRow = FinanceSourceTraceInput & {
  id: number;
  registrationId: number;
  periodId: number;
  filingReference: string | null;
  filedOn: string | null;
  status: "draft" | "filed" | "accepted" | "amended" | "cancelled";
  currencyCode: string;
  sourceReportedDeclaredAmount: number | null;
  sourceReportedPayableAmount: number | null;
  note: string | null;
  version: number;
  reconciliation: {
    calculatedAmount: number | null;
    declaredAmount: number | null;
    payableAmount: number | null;
    paidAmount: number | null;
    asOfDate: string | null;
    filingEvidenceComplete: boolean;
    paymentEvidenceComplete: boolean;
    effectivePaymentIds: number[];
    calculatedToDeclaredDifference: number | null;
    declaredToPayableDifference: number | null;
    payableToPaidDifference: number | null;
  };
};

export type PaymentAllocationRow = TaxPaymentAllocationInput & { id?: number; voucherItemLabel: string | null };

export type PaymentRow = FinanceSourceTraceInput & {
  id: number;
  paymentKind: "payment" | "refund" | "reversal";
  paidOn: string;
  amount: number;
  currencyCode: string;
  paymentReference: string | null;
  note: string | null;
  reversesPaymentId: number | null;
  idempotencyKey: string;
  allocatedAmount: number;
  unallocatedAmount: number;
  allocations: PaymentAllocationRow[];
};

export type SnapshotRow = {
  id: number;
  registrationId: number;
  status: string;
  inputFingerprint: string;
  payloadSha256: string;
  contributorVersion: string;
  capturedAt: string;
};

export type TaxWorkspace = Omit<
  TaxWorkspaceDto,
  "taxTypes" | "registrations" | "workpapers" | "filings" | "payments" | "reconciliationSnapshots"
> & {
  taxTypes: TaxTypeRow[];
  registrations: RegistrationRow[];
  workpapers: WorkpaperRow[];
  filings: FilingRow[];
  payments: PaymentRow[];
  reconciliationSnapshots: SnapshotRow[];
};

export type SourceDraft = {
  sourceKind: string;
  sourceReleaseId: string;
  sourceFile: string;
  sourceKey: string;
};

export type RegistrationDraft = SourceDraft & {
  kind: "registration";
  id?: number;
  version?: number;
  taxTypeId: string;
  authorityPartyId: string;
  authorityPartyName: string;
  registrationNo: string;
  jurisdiction: string;
  filingFrequency: RegistrationRow["filingFrequency"];
  effectiveFrom: string;
  effectiveThrough: string;
  status: RegistrationRow["status"];
};

export type AccrualLineDraft = SourceDraft & {
  key: string;
  id?: number;
  lineNo: string;
  recognitionOn: string;
  description: string;
  method: "base_rate" | "quantity_unit_rate";
  taxBaseAmount: string;
  taxRate: string;
  quantity: string;
  unitRate: string;
  divisor: string;
  voucherItemId: string;
  voucherItemLabel: string;
  sourceReportedTaxAmount: string;
};

export type WorkpaperDraft = SourceDraft & {
  kind: "workpaper";
  id?: number;
  version?: number;
  registrationId: string;
  status: WorkpaperRow["status"];
  note: string;
  accrualLines: AccrualLineDraft[];
};

export type FilingDraft = SourceDraft & {
  kind: "filing";
  id?: number;
  version?: number;
  registrationId: string;
  filingReference: string;
  filedOn: string;
  status: FilingRow["status"];
  currencyCode: string;
  sourceReportedDeclaredAmount: string;
  sourceReportedPayableAmount: string;
  note: string;
};

export type AllocationDraft = SourceDraft & {
  key: string;
  filingId: string;
  voucherItemId: string;
  voucherItemLabel: string;
  allocatedAmount: string;
};

export type PaymentDraft = SourceDraft & {
  kind: "payment";
  paymentKind: PaymentRow["paymentKind"];
  paidOn: string;
  amount: string;
  currencyCode: string;
  paymentReference: string;
  note: string;
  reversesPaymentId: string;
  idempotencyKey: string;
  allocations: AllocationDraft[];
};

export type TaxDraft = RegistrationDraft | WorkpaperDraft | FilingDraft | PaymentDraft;
