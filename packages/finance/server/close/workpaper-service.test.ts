import assert from "node:assert/strict";
import test from "node:test";
import { financeCloseWorkpaperReviewIdempotencyKey } from "../../types/close";
import { sha256CanonicalJson } from "./canonical-json";
import type {
  FinanceCloseWorkpaperServiceDependencies,
} from "./workpaper-service";
import {
  reviewFinanceCloseWorkpaper,
  saveFinanceCloseWorkpaper,
} from "./workpaper-service";
import type {
  ReviewFinanceCloseWorkpaperCommand,
  SaveFinanceCloseWorkpaperCommand,
} from "./workpaper-validation";

const now = new Date("2026-06-30T12:00:00.000Z");
const row = {
  id: 41, companyId: 1, periodId: 2, taskKey: "employee-reimbursements",
  status: "reviewed", conclusion: "已核对", evidenceRefs: ["finance-voucher-item:12"], voucherRefs: [],
  preparedByUserId: 7, preparedAt: now, reviewedByUserId: 8, reviewedAt: now,
  version: 2, updatedAt: now,
};

function raceDependencies(
  eventKind: "saved" | "reviewed",
  requestFingerprint: string,
  overrides: Partial<{ workpaperId: number; workpaper: typeof row }> = {},
) {
  return {
    transaction: async () => { throw Object.assign(new Error("unique conflict"), { code: "P2002" }); },
    findWorkpaper: async () => row,
    findEvent: async () => ({ workpaperId: row.id, eventKind, requestFingerprint, workpaper: row, ...overrides }),
  } as FinanceCloseWorkpaperServiceDependencies;
}

const saveInput = {
  companyCode: "C01", year: 2026, month: 6, taskKey: "employee-reimbursements" as const,
  status: "prepared" as const, conclusion: "已核对", evidenceRefs: ["finance-voucher-item:12"], voucherRefs: [],
  expectedVersion: null, idempotencyKey: "save-race-1",
};
const saveCommand: SaveFinanceCloseWorkpaperCommand = {
  companyCode: "C01", year: 2026, month: 6, companyId: 1, periodId: 2, isPeriodClosed: false,
  input: saveInput,
  actorUserId: 7,
  requestFingerprint: sha256CanonicalJson({ kind: "finance_close_workpaper_save", input: saveInput, actorUserId: 7 }),
  existing: null,
  idempotentWorkpaperId: null,
};

const reviewInput = {
  companyCode: "C01", year: 2026, month: 6, taskKey: "employee-reimbursements" as const,
  expectedVersion: 1, idempotencyKey: financeCloseWorkpaperReviewIdempotencyKey(41, 1, 8),
};
const reviewCommand: ReviewFinanceCloseWorkpaperCommand = {
  companyCode: "C01", year: 2026, month: 6, companyId: 1, periodId: 2, isPeriodClosed: false,
  input: reviewInput,
  actorUserId: 8,
  requestFingerprint: sha256CanonicalJson({ kind: "finance_close_workpaper_review", input: reviewInput, actorUserId: 8 }),
  existing: {
    id: 41, companyId: 1, periodId: 2, taskKey: "employee-reimbursements", status: "prepared",
    conclusion: "已核对", evidenceRefs: ["finance-voucher-item:12"], voucherRefs: [], preparedByUserId: 7, version: 1,
  },
  idempotentWorkpaperId: null,
};

test("concurrent save with the same idempotency intent converges to the committed workpaper", async () => {
  const result = await saveFinanceCloseWorkpaper(saveCommand, raceDependencies("saved", saveCommand.requestFingerprint));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.id, row.id);
});

test("concurrent review with the same idempotency intent converges to the committed workpaper", async () => {
  const result = await reviewFinanceCloseWorkpaper(reviewCommand, raceDependencies("reviewed", reviewCommand.requestFingerprint));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.status, "reviewed");
});

test("concurrent workpaper commands with a colliding key but different intent remain conflicts", async () => {
  const save = await saveFinanceCloseWorkpaper(saveCommand, raceDependencies("saved", "different-save"));
  const review = await reviewFinanceCloseWorkpaper(reviewCommand, raceDependencies("reviewed", "different-review"));
  const crossScope = await saveFinanceCloseWorkpaper(saveCommand, raceDependencies(
    "saved",
    saveCommand.requestFingerprint,
    { workpaper: { ...row, companyId: 9 } },
  ));
  const wrongWorkpaper = await reviewFinanceCloseWorkpaper(reviewCommand, raceDependencies(
    "reviewed",
    reviewCommand.requestFingerprint,
    { workpaperId: 99 },
  ));
  assert.equal(save.ok, false);
  assert.equal(review.ok, false);
  assert.equal(crossScope.ok, false);
  assert.equal(wrongWorkpaper.ok, false);
  if (!save.ok) assert.equal(save.status, 409);
  if (!review.ok) assert.equal(review.status, 409);
});
