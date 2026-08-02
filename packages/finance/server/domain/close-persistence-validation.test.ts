import assert from "node:assert/strict";
import test from "node:test";
import { financeCloseWorkpaperReviewIdempotencyKey } from "../../types/close";
import { sha256CanonicalJson } from "../close/canonical-json";
import {
  validateFinanceCloseEvidenceSnapshotPersistence,
  validateOpenFinanceClosePersistenceCommand,
  validateReviewFinanceCloseWorkpaperPersistenceCommand,
} from "./close-persistence-validation";

test("evidence persistence binds the immutable payload to its SHA-256", () => {
  const payload = { status: "ready", evidenceRefs: ["finance-voucher:7"] };
  const valid = validateFinanceCloseEvidenceSnapshotPersistence({
    taskId: 1,
    taskKey: "bank-balance",
    inputFingerprint: "a".repeat(64),
    contributorVersion: "bank-v1",
    payloadSha256: sha256CanonicalJson(payload),
    payload,
  });
  const changed = validateFinanceCloseEvidenceSnapshotPersistence({
    taskId: 1,
    taskKey: "bank-balance",
    inputFingerprint: "a".repeat(64),
    contributorVersion: "bank-v1",
    payloadSha256: sha256CanonicalJson(payload),
    payload: { ...payload, status: "blocked" },
  });
  assert.equal(valid.ok, true);
  assert.equal(changed.ok, false);
});

test("open persistence rejects a command whose resolved scope no longer matches its fingerprint", () => {
  const command = {
    companyCode: "C01", year: 2026, month: 6, companyId: 1, periodId: 2,
    isPeriodClosed: false, actorUserId: 7, idempotencyKey: "open-1", idempotentRunId: null,
    requestFingerprint: sha256CanonicalJson({
      kind: "finance_close_open",
      scope: { companyCode: "C01", year: 2026, month: 6, companyId: 1, periodId: 2 },
      actorUserId: 7,
    }),
  };
  assert.equal(validateOpenFinanceClosePersistenceCommand(command).ok, true);
  assert.equal(validateOpenFinanceClosePersistenceCommand({ ...command, periodId: 3 }).ok, false);
});

test("workpaper review persistence binds scope, version, preparer and authoritative idempotency key", () => {
  const input = {
    companyCode: "C01", year: 2026, month: 6, taskKey: "employee-reimbursements" as const,
    expectedVersion: 1,
    idempotencyKey: financeCloseWorkpaperReviewIdempotencyKey(41, 1, 8),
  };
  const command = {
    companyCode: "C01", year: 2026, month: 6, companyId: 1, periodId: 2, isPeriodClosed: false,
    input, actorUserId: 8,
    requestFingerprint: sha256CanonicalJson({ kind: "finance_close_workpaper_review", input, actorUserId: 8 }),
    existing: {
      id: 41, companyId: 1, periodId: 2, taskKey: input.taskKey, status: "prepared",
      conclusion: "已核对", evidenceRefs: ["finance-voucher-item:12"], voucherRefs: [],
      preparedByUserId: 7, version: 1,
    },
    idempotentWorkpaperId: null,
  };
  assert.equal(validateReviewFinanceCloseWorkpaperPersistenceCommand(command).ok, true);
  assert.equal(validateReviewFinanceCloseWorkpaperPersistenceCommand({ ...command, actorUserId: 7 }).ok, false);
});
