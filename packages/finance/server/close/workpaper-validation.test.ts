import assert from "node:assert/strict";
import test from "node:test";
import { financeCloseWorkpaperReviewIdempotencyKey, type SaveFinanceCloseWorkpaperInput } from "../../types/close";
import {
  buildReviewFinanceCloseWorkpaperCommand,
  buildSaveFinanceCloseWorkpaperCommand,
  type FinanceCloseWorkpaperValidationDependencies,
} from "./workpaper-validation";
import { sha256CanonicalJson } from "./canonical-json";

const scope = { companyCode: "C01", year: 2026, month: 6 };
const hashedExternalEvidence = `external-sha256:${"a".repeat(64)}:https://evidence.example/close/42.pdf`;
const base: SaveFinanceCloseWorkpaperInput = {
  ...scope,
  taskKey: "employee-reimbursements",
  status: "prepared",
  conclusion: "已核对",
  evidenceRefs: [hashedExternalEvidence],
  voucherRefs: [],
  expectedVersion: null,
  idempotencyKey: "close-wp-save-1",
};

function dependencies(overrides: Partial<FinanceCloseWorkpaperValidationDependencies> = {}): FinanceCloseWorkpaperValidationDependencies {
  return {
    resolveScope: async () => ({ ...scope, companyId: 1, periodId: 2, isPeriodClosed: false }),
    userCanLogin: async () => true,
    findWorkpaper: async () => null,
    findEvent: async () => null,
    findVouchers: async (ids) => ids.map((id) => ({ id, companyCode: "C01", periodId: 2, status: "posted" })),
    findVoucherItems: async (ids) => ids.map((id) => ({
      id,
      voucher: {
        companyCode: "C01", periodId: 2, status: "posted",
        period: { companyCode: "C01", year: 2026, month: 6 },
      },
    })),
    ...overrides,
  };
}

test("prepared close workpaper requires a conclusion and governed evidence", async () => {
  const result = await buildSaveFinanceCloseWorkpaperCommand({
    ...base, conclusion: null, evidenceRefs: [], voucherRefs: [],
  }, 7, dependencies());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "conclusion");
});

test("voucher references must resolve to posted vouchers in the exact company period", async () => {
  const result = await buildSaveFinanceCloseWorkpaperCommand({
    ...base, evidenceRefs: [], voucherRefs: ["finance-voucher:12"],
  }, 7, dependencies({ findVouchers: async () => [{ id: 12, companyCode: "C02", periodId: 2, status: "posted" }] }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "voucherRefs");
});

test("plain text, plain URLs and unresolved documents cannot establish governed evidence", async () => {
  for (const evidenceRefs of [["done"], ["https://example.com/report.pdf"], ["document:42"]]) {
    const result = await buildSaveFinanceCloseWorkpaperCommand({ ...base, evidenceRefs }, 7, dependencies());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issue.field, "evidenceRefs");
  }
});

test("voucher-item evidence must resolve to a posted voucher in the exact scope", async () => {
  const result = await buildSaveFinanceCloseWorkpaperCommand({
    ...base, evidenceRefs: ["finance-voucher-item:12"],
  }, 7, dependencies({
    findVoucherItems: async () => [{
      id: 12,
      voucher: {
        companyCode: "C02", periodId: 2, status: "posted",
        period: { companyCode: "C02", year: 2026, month: 6 },
      },
    }],
  }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "evidenceRefs");
});

test("review enforces CAS and preparer-reviewer separation", async () => {
  const workpaper = {
    id: 10, companyId: 1, periodId: 2, taskKey: base.taskKey, status: "prepared",
    conclusion: "已核对", evidenceRefs: [hashedExternalEvidence], voucherRefs: [], preparedByUserId: 7, version: 3,
  };
  const sameActor = await buildReviewFinanceCloseWorkpaperCommand({
    ...scope, taskKey: base.taskKey, expectedVersion: 3,
    idempotencyKey: financeCloseWorkpaperReviewIdempotencyKey(workpaper.id, 3, 7),
  }, 7, dependencies({ findWorkpaper: async () => workpaper }));
  assert.equal(sameActor.ok, false);
  const reviewer = await buildReviewFinanceCloseWorkpaperCommand({
    ...scope, taskKey: base.taskKey, expectedVersion: 3,
    idempotencyKey: financeCloseWorkpaperReviewIdempotencyKey(workpaper.id, 3, 8),
  }, 8, dependencies({ findWorkpaper: async () => workpaper }));
  assert.equal(reviewer.ok, true);
});

test("review idempotency replays the original request and rejects another workpaper scope", async () => {
  const original = {
    id: 10, companyId: 1, periodId: 2, taskKey: base.taskKey, status: "reviewed",
    conclusion: "已核对", evidenceRefs: [hashedExternalEvidence], voucherRefs: [], preparedByUserId: 7, version: 4,
  };
  const idempotencyKey = financeCloseWorkpaperReviewIdempotencyKey(original.id, 3, 8);
  const input = { ...scope, taskKey: base.taskKey, expectedVersion: 3, idempotencyKey };
  const replay = await buildReviewFinanceCloseWorkpaperCommand(input, 8, dependencies({
    findWorkpaper: async () => original,
    findEvent: async () => ({
      workpaperId: original.id,
      eventKind: "reviewed",
      requestFingerprint: sha256CanonicalJson({ kind: "finance_close_workpaper_review", input, actorUserId: 8 }),
    }),
  }));
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.data.idempotentWorkpaperId, original.id);

  const otherWorkpaper = { ...original, id: 11, companyId: 9, periodId: 10 };
  const collision = await buildReviewFinanceCloseWorkpaperCommand(input, 8, dependencies({ findWorkpaper: async () => otherWorkpaper }));
  assert.equal(collision.ok, false);
  if (!collision.ok) assert.equal(collision.issue.field, "idempotencyKey");
});
