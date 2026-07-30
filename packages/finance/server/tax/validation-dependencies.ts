type TaxRegistrationFact = {
  id: number;
  companyCode: string;
  version: number;
  status: string;
  effectiveFrom: string;
  effectiveThrough: string | null;
};

type TaxOwnedFact = {
  id: number;
  companyCode: string;
  version: number;
  status: string;
  currencyCode?: string;
};

export type TaxPaymentFact = {
  id: number;
  companyCode: string;
  paymentKind: string;
  paidOn: string;
  amount: number;
  currencyCode: string;
  paymentReference: string | null;
  note: string | null;
  reversesPaymentId: number | null;
  sourceKind: string | null;
  sourceReleaseId: string | null;
  sourceSha256: string | null;
  sourceFile: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  sourceRange: string | null;
  sourceKey: string | null;
  allocations: Array<{ filingId: number; voucherItemId: number | null; allocatedAmount: number }>;
};

export interface TaxValidationDependencies {
  findCompanyByCode(code: string): Promise<{ id: number; code: string; isActive: boolean } | null>;
  findPeriod(id: number): Promise<{ id: number; companyCode: string; year: number; month: number; isClosed: boolean } | null>;
  findTaxType(id: number): Promise<{ id: number; isActive: boolean } | null>;
  findRegistration(id: number): Promise<TaxRegistrationFact | null>;
  findWorkpaper(id: number): Promise<TaxOwnedFact | null>;
  findFiling(id: number): Promise<TaxOwnedFact | null>;
  findFilings(ids: number[]): Promise<Array<TaxOwnedFact & { currencyCode: string }>>;
  findAccrualLines(ids: number[]): Promise<Array<{ id: number; workpaperId: number }>>;
  findVoucherItems(ids: number[]): Promise<Array<{ id: number; companyCode: string; periodId: number; year: number; month: number }>>;
  findPaymentByIdempotencyKey(key: string): Promise<TaxPaymentFact | null>;
  findPayment(id: number): Promise<TaxPaymentFact | null>;
  paymentWasReversed(id: number): Promise<boolean>;
  filingHasAllocations(id: number): Promise<boolean>;
}
