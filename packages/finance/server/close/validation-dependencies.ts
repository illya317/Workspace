import type { FinanceCloseScope } from "../../types/close";

type CompanyRef = { id: number; code: string; isActive: boolean };
type PeriodRef = { id: number; companyCode: string; year: number; month: number; isClosed: boolean };
type UserRef = { id: number; canLogin: boolean };
type RunRef = {
  id: number;
  companyId: number;
  periodId: number;
  status: string;
  version: number;
  company: CompanyRef;
  period: PeriodRef;
};
type EventRef = { eventKind: string; requestFingerprint: string | null; run: RunRef };

export type CloseValidationDependencies = {
  findCompanyByCode(code: string): Promise<CompanyRef | null>;
  findPeriod(scope: FinanceCloseScope): Promise<PeriodRef | null>;
  findUser(userId: number): Promise<UserRef | null>;
  findRun(runId: number): Promise<RunRef | null>;
  findEvent(idempotencyKey: string): Promise<EventRef | null>;
};
