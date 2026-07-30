type CompanyFact = { id: number; code: string; isActive: boolean };
type PeriodFact = { id: number; companyCode: string; year: number; month: number; isClosed: boolean };
type OwnedFact = {
  id: number;
  companyCode: string;
  version?: number;
  status?: string;
  currencyCode?: string;
  startOn?: Date;
  endOn?: Date | null;
};
type VoucherFact = { id: number; companyCode: string };
type PrincipalEventFact = {
  id: number;
  loanId: number;
  eventKind: string;
  amount: unknown;
  reversesEventId: number | null;
  idempotencyKey: string;
};

export interface TreasuryValidationDeps {
  company(id: number): Promise<CompanyFact | null>;
  period(id: number): Promise<PeriodFact | null>;
  bankAccount(id: number): Promise<OwnedFact | null>;
  reconciliation(id: number): Promise<OwnedFact | null>;
  loan(id: number): Promise<OwnedFact | null>;
  interestWorkpaper(id: number): Promise<OwnedFact | null>;
  partyExists(id: number): Promise<boolean>;
  account(id: number): Promise<{ id: number; companyCode: string; year: number | null; isActive: boolean } | null>;
  voucherItems(ids: number[]): Promise<VoucherFact[]>;
  principalEvent(id: number): Promise<PrincipalEventFact | null>;
  principalEventByKey(key: string): Promise<PrincipalEventFact | null>;
  eventWasReversed(id: number): Promise<boolean>;
}
