/**
 * Phase 6: 重分类审核 — 共享类型
 */

// ─── DTO (API 返回) ──────────────────────────────────────

export interface ReclassResultRow {
  id: number;
  periodId: number;
  voucherItemId: number;
  voucherNo: string;
  voucherDate: string;
  relatedEntity: string | null;
  description: string | null;
  sourceAccount: string;
  sourceAccountName: string;
  abnormalSide: string | null;
  itemDebit: number;
  itemCredit: number;
  targetAccount: string;
  amount: number;
  status: "pending" | "approved" | "adjusted" | "rejected" | "no_match";
  note: string | null;
  adjustedBy: number | null;
  adjustedByName: string | null;
  adjustedAt: string | null;
}

// ─── List ─────────────────────────────────────────────────

export interface ListReclassResultsParams {
  periodId: number;
  status?: "pending" | "approved" | "adjusted" | "rejected" | "all";
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface ListReclassResultsOutput {
  items: ReclassResultRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Review ───────────────────────────────────────────────

export type ReviewPayload =
  | { action: "approve"; note?: string }
  | { action: "reject"; note?: string }
  | { action: "revert" }
  | { action: "adjust"; targetAccount: string; amount: number; note?: string };

export interface ReviewReclassParams {
  id: number;
  payload: ReviewPayload;
  userId: number;
}
