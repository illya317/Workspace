import assert from "node:assert/strict";
import test from "node:test";
import type { CloseValidationDependencies } from "./validation";
import { buildOpenFinanceCloseCommand, buildRefreshFinanceCloseCommand } from "./validation";

function deps(overrides: Partial<CloseValidationDependencies> = {}): CloseValidationDependencies {
  const company = { id: 2, code: "C02", isActive: true };
  const period = { id: 6, companyCode: "C02", year: 2026, month: 6, isClosed: false };
  const run = { id: 8, companyId: 2, periodId: 6, status: "open", version: 3, company, period };
  return {
    findCompanyByCode: async () => company,
    findPeriod: async () => period,
    findUser: async (id) => ({ id, canLogin: true }),
    findRun: async () => run,
    findEvent: async () => null,
    ...overrides,
  };
}

test("open validates active company, exact period and active user", async () => {
  const accepted = await buildOpenFinanceCloseCommand({ companyCode: "C02", year: 2026, month: 6, idempotencyKey: "close-open-1" }, 7, deps());
  assert.equal(accepted.ok, true);
  const inactive = await buildOpenFinanceCloseCommand({ companyCode: "C02", year: 2026, month: 6, idempotencyKey: "close-open-1" }, 7, deps({ findCompanyByCode: async () => ({ id: 2, code: "C02", isActive: false }) }));
  assert.equal(inactive.ok, false);
  const wrongPeriod = await buildOpenFinanceCloseCommand({ companyCode: "C02", year: 2026, month: 6, idempotencyKey: "close-open-1" }, 7, deps({ findPeriod: async () => ({ id: 6, companyCode: "C02", year: 2026, month: 5, isClosed: false }) }));
  assert.equal(wrongPeriod.ok, false);
});

test("closed periods reject new open commands but allow a strict idempotent replay", async () => {
  const input = { companyCode: "C02", year: 2026, month: 6, idempotencyKey: "close-open-1" };
  const first = await buildOpenFinanceCloseCommand(input, 7, deps());
  assert.equal(first.ok, true);
  const closedPeriod = { id: 6, companyCode: "C02", year: 2026, month: 6, isClosed: true };
  const closedRun = { id: 8, companyId: 2, periodId: 6, status: "open", version: 3, company: { id: 2, code: "C02", isActive: true }, period: closedPeriod };
  const rejected = await buildOpenFinanceCloseCommand(input, 7, deps({ findPeriod: async () => closedPeriod }));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.issue.status, 409);
  const replay = await buildOpenFinanceCloseCommand(input, 7, deps({
    findPeriod: async () => closedPeriod,
    findEvent: async () => ({ eventKind: "opened", requestFingerprint: first.ok ? first.data.requestFingerprint : "", run: closedRun }),
  }));
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.data.idempotentRunId, 8);
});

test("refresh validates open status and CAS but accepts an identical idempotent repeat", async () => {
  const input = { runId: 8, expectedVersion: 3, idempotencyKey: "close-refresh-1" };
  const accepted = await buildRefreshFinanceCloseCommand(input, 7, deps());
  assert.equal(accepted.ok, true);
  const stale = await buildRefreshFinanceCloseCommand({ ...input, expectedVersion: 2 }, 7, deps());
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.issue.field, "expectedVersion");
  const fingerprint = accepted.ok ? accepted.data.requestFingerprint : "";
  const repeat = await buildRefreshFinanceCloseCommand(input, 7, deps({ findEvent: async () => ({ eventKind: "refreshed", requestFingerprint: fingerprint, run: (await deps().findRun(8))! }) }));
  assert.equal(repeat.ok, true);
  if (repeat.ok) assert.equal(repeat.data.idempotentRunId, 8);
  const conflict = await buildRefreshFinanceCloseCommand(input, 7, deps({ findEvent: async () => ({ eventKind: "opened", requestFingerprint: "different", run: (await deps().findRun(8))! }) }));
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.issue.field, "idempotencyKey");
});

test("closed periods reject new refreshes but allow a strict idempotent replay", async () => {
  const input = { runId: 8, expectedVersion: 3, idempotencyKey: "close-refresh-1" };
  const first = await buildRefreshFinanceCloseCommand(input, 7, deps());
  assert.equal(first.ok, true);
  const closedPeriod = { id: 6, companyCode: "C02", year: 2026, month: 6, isClosed: true };
  const closedRun = { id: 8, companyId: 2, periodId: 6, status: "open", version: 4, company: { id: 2, code: "C02", isActive: true }, period: closedPeriod };
  const rejected = await buildRefreshFinanceCloseCommand(input, 7, deps({ findRun: async () => closedRun }));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.issue.status, 409);
  const replay = await buildRefreshFinanceCloseCommand(input, 7, deps({
    findRun: async () => closedRun,
    findEvent: async () => ({ eventKind: "refreshed", requestFingerprint: first.ok ? first.data.requestFingerprint : "", run: closedRun }),
  }));
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.data.idempotentRunId, 8);
});
