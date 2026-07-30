export type TaxOwnedFact = {
  id: number;
  companyCode: string;
  version?: number;
  status?: string;
  currencyCode?: string;
  amount?: unknown;
  paymentKind?: string;
  reversesPaymentId?: number | null;
};

export interface TaxValidationDeps {
  company(id: number): Promise<{ id: number; code: string; isActive: boolean } | null>;
  period(id: number): Promise<{ id: number; companyCode: string; year: number; month: number; isClosed: boolean } | null>;
  taxType(id: number): Promise<{ id: number; isActive: boolean; jurisdiction: string } | null>;
  partyExists(id: number): Promise<boolean>;
  registration(id: number): Promise<TaxOwnedFact | null>;
  workpaper(id: number): Promise<TaxOwnedFact | null>;
  filing(id: number): Promise<TaxOwnedFact | null>;
  filings(ids: number[]): Promise<TaxOwnedFact[]>;
  voucherItems(ids: number[]): Promise<Array<{ id: number; companyCode: string }>>;
  paymentByKey(key: string): Promise<TaxOwnedFact | null>;
  payment(id: number): Promise<TaxOwnedFact | null>;
  paymentWasReversed(id: number): Promise<boolean>;
}
