import type { DayCountConvention, TreasuryCreateInput, TreasuryUpdateInput } from "../../types/treasury";

export type CompanyReference = { id: number; code: string; isActive: boolean };
export type PeriodReference = { id: number; companyCode: string; year: number; month: number; startDate: string; endDate: string; isClosed: boolean };
export type AccountReference = { id: number; companyCode: string; year: number | null; isActive: boolean };
export type VoucherItemReference = { id: number; companyCode: string; periodId: number };
export type BankAccountReference = { id: number; companyId: number | null; companyCode: string; version: number };
export type ReconciliationReference = { id: number; bankAccountId: number; periodId: number; version: number };
export type VersionedChildReference = { id: number; parentId: number; version: number };
export type LoanReference = {
  id: number;
  companyId: number;
  companyCode: string;
  startOn: Date;
  endOn: Date | null;
  version: number;
  rateTermConventions: DayCountConvention[];
};
export type RateTermReference = { id: number; loanId: number };
export type PrincipalEventReference = {
  id: number;
  loanId: number;
  voucherItemId: number | null;
  eventKind: string;
  occurredOn: Date;
  amount: unknown;
  referenceNo?: string | null;
  note?: string | null;
  reversesEventId: number | null;
  idempotencyKey: string;
  sourceKind?: string | null;
  sourceReleaseId?: string | null;
  sourceSha256?: string | null;
  sourceFile?: string | null;
  sourceSheet?: string | null;
  sourceRow?: number | null;
  sourceRange?: string | null;
  sourceKey?: string | null;
};
export type WorkpaperReference = { id: number; loanId: number; periodId: number; version: number };
export type ChildReference = { id: number; parentId: number };

export type TreasuryValidationDependencies = {
  findCompanyByCode?: (code: string) => Promise<CompanyReference | null>;
  findPeriod?: (id: number) => Promise<PeriodReference | null>;
  findAccount?: (id: number) => Promise<AccountReference | null>;
  findParty?: (id: number) => Promise<{ id: number } | null>;
  findVoucherItems?: (ids: number[]) => Promise<VoucherItemReference[]>;
  findBankAccount?: (id: number) => Promise<BankAccountReference | null>;
  findReconciliation?: (id: number) => Promise<ReconciliationReference | null>;
  findReconciliationItems?: (ids: number[]) => Promise<VersionedChildReference[]>;
  findLoan?: (id: number) => Promise<LoanReference | null>;
  findRateTerms?: (ids: number[]) => Promise<RateTermReference[]>;
  findPrincipalEvent?: (id: number) => Promise<PrincipalEventReference | null>;
  findPrincipalEventByIdempotencyKey?: (key: string) => Promise<PrincipalEventReference | null>;
  hasReversal?: (eventId: number) => Promise<boolean>;
  findWorkpaper?: (id: number) => Promise<WorkpaperReference | null>;
  findWorkpaperLines?: (ids: number[]) => Promise<ChildReference[]>;
  findVoucherLinks?: (ids: number[]) => Promise<ChildReference[]>;
};

export type TreasuryDerivedCalculation = { calculationVersion: string; inputFingerprint: string };
export type TreasuryCreateCommand = { input: TreasuryCreateInput; userId: number; companyId?: number; idempotentPrincipalEventId?: number; calculation?: TreasuryDerivedCalculation };
export type TreasuryUpdateCommand = { input: TreasuryUpdateInput; userId: number; companyId?: number; calculation?: TreasuryDerivedCalculation };
