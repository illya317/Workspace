export type FinanceCloseScope = {
  companyCode: string;
  year: number;
  month: number;
};

export type FinanceCloseTaskStatus = "pending" | "ready" | "blocked" | "unavailable";

export type FinanceCloseBlockerDto = {
  code: string;
  message: string;
  deepLink: string;
};

export type FinanceCloseCatalogItem = {
  sequence: number;
  taskKey: string;
  contributorKey: string;
  ownerResourceKey: string;
  label: string;
  deepLink: string;
  requiredEvidence: string;
};

export type FinanceCloseTaskDto = FinanceCloseCatalogItem & {
  id: number | null;
  status: FinanceCloseTaskStatus;
  contributorVersion: string | null;
  inputFingerprint: string | null;
  blockers: FinanceCloseBlockerDto[];
  evidenceRefs: string[];
  voucherRefs: string[];
  inspectedAt: string | null;
  version: number | null;
};

export type FinanceCloseStatusCounts = Record<FinanceCloseTaskStatus, number>;

export type FinanceCloseRunDto = {
  id: number;
  companyId: number;
  periodId: number;
  startedByUserId: number;
  status: string;
  version: number;
  openedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceCloseWorkspaceDto = {
  scope: FinanceCloseScope & {
    companyId: number;
    periodId: number;
    isPeriodClosed: boolean;
  };
  run: FinanceCloseRunDto | null;
  tasks: FinanceCloseTaskDto[];
  statusCounts: FinanceCloseStatusCounts;
};

export type FinanceCloseProviderInspection = {
  status: FinanceCloseTaskStatus;
  contributorVersion: string;
  inputFingerprint: string;
  blockers: FinanceCloseBlockerDto[];
  evidenceRefs: string[];
  voucherRefs: string[];
  deepLink: string;
  payload: unknown;
};

export const FINANCE_CLOSE_WORKPAPER_TASK_KEYS = [
  "employee-reimbursements",
  "payroll-accruals",
  "contract-and-rd-assessment",
  "asset-inventory-estimates",
  "expense-cost-accruals",
  "advance-receipts-review",
  "other-receivables-review",
  "payables-and-prepayments",
  "contract-execution-review",
  "fx-and-profit-closing",
  "account-usage-review",
  "related-party-reconciliation",
  "unusual-transactions-contingencies",
  "cashflow-equity-statements",
  "close-process-review",
] as const;

export type FinanceCloseWorkpaperTaskKey = typeof FINANCE_CLOSE_WORKPAPER_TASK_KEYS[number];
export type FinanceCloseWorkpaperStatus = "draft" | "prepared" | "reviewed" | "blocked";

export type FinanceCloseWorkpaperDto = {
  id: number;
  taskKey: FinanceCloseWorkpaperTaskKey;
  status: FinanceCloseWorkpaperStatus;
  conclusion: string | null;
  evidenceRefs: string[];
  voucherRefs: string[];
  preparedByUserId: number | null;
  preparedAt: string | null;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  version: number;
  updatedAt: string;
};

export type SaveFinanceCloseWorkpaperInput = FinanceCloseScope & {
  taskKey: FinanceCloseWorkpaperTaskKey;
  status: "draft" | "prepared" | "blocked";
  conclusion: string | null;
  evidenceRefs: string[];
  voucherRefs: string[];
  expectedVersion: number | null;
  idempotencyKey: string;
};

export type ReviewFinanceCloseWorkpaperInput = FinanceCloseScope & {
  taskKey: FinanceCloseWorkpaperTaskKey;
  expectedVersion: number;
  idempotencyKey: string;
};

export function financeCloseWorkpaperReviewIdempotencyKey(
  workpaperId: number,
  expectedVersion: number,
  actorUserId: number,
) {
  return `finance-close-wp-review-v2-${workpaperId}-${expectedVersion}-${actorUserId}`;
}

export interface FinanceCloseProvider {
  inspectPeriodClose(scope: FinanceCloseScope): Promise<FinanceCloseProviderInspection>;
}

export type OpenFinanceCloseInput = FinanceCloseScope & {
  idempotencyKey: string;
};

export type RefreshFinanceCloseInput = {
  runId: number;
  expectedVersion: number;
  idempotencyKey: string;
};
