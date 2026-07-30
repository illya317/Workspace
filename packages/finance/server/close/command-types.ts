import type { FinanceCloseScope } from "../../types/close";

export type ResolvedFinanceCloseScope = FinanceCloseScope & {
  companyId: number;
  periodId: number;
  isPeriodClosed: boolean;
};

export type OpenFinanceCloseCommand = ResolvedFinanceCloseScope & {
  actorUserId: number;
  idempotencyKey: string;
  requestFingerprint: string;
  idempotentRunId: number | null;
};

export type RefreshFinanceCloseCommand = ResolvedFinanceCloseScope & {
  runId: number;
  expectedVersion: number;
  actorUserId: number;
  idempotencyKey: string;
  requestFingerprint: string;
  idempotentRunId: number | null;
};
