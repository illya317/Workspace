import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceCloseWorkspaceDto } from "../../types/close";
import { sha256CanonicalJson } from "./canonical-json";
import { buildFinanceCloseProviderRegistry } from "./providers";
import {
  openFinanceClose,
  refreshFinanceClose,
  type FinanceCloseServiceDependencies,
} from "./service";
import type { OpenFinanceCloseCommand, RefreshFinanceCloseCommand } from "./validation";

const workspace = { marker: "committed workspace" } as unknown as FinanceCloseWorkspaceDto;
const scope = {
  companyCode: "C01", year: 2026, month: 6,
  companyId: 1, periodId: 2, isPeriodClosed: false,
};
const openCommand: OpenFinanceCloseCommand = {
  ...scope, actorUserId: 7, idempotencyKey: "open-race-1",
  requestFingerprint: sha256CanonicalJson({
    kind: "finance_close_open",
    scope: { companyCode: "C01", year: 2026, month: 6, companyId: 1, periodId: 2 },
    actorUserId: 7,
  }),
  idempotentRunId: null,
};
const refreshCommand: RefreshFinanceCloseCommand = {
  ...scope, runId: 41, expectedVersion: 1, actorUserId: 7,
  idempotencyKey: "refresh-race-1",
  requestFingerprint: sha256CanonicalJson({
    kind: "finance_close_refresh", runId: 41, expectedVersion: 1, actorUserId: 7,
  }),
  idempotentRunId: null,
};
const emptyRegistry = buildFinanceCloseProviderRegistry({});

type ReplayEvent = Awaited<ReturnType<FinanceCloseServiceDependencies["findEvent"]>>;

function uniqueRaceDependencies(event: ReplayEvent): FinanceCloseServiceDependencies {
  return {
    transaction: async () => { throw Object.assign(new Error("unique conflict"), { code: "P2002" }); },
    findEvent: async () => event,
    loadWorkspace: async () => workspace,
  } as FinanceCloseServiceDependencies;
}

function event(
  eventKind: "opened" | "refreshed",
  requestFingerprint: string,
  runId: number,
  overrides: Partial<{ companyId: number; periodId: number }> = {},
) {
  return {
    runId, eventKind, requestFingerprint,
    run: { id: runId, companyId: overrides.companyId ?? 1, periodId: overrides.periodId ?? 2 },
  };
}

test("concurrent open and refresh with the same event intent replay the committed workspace", async () => {
  const opened = await openFinanceClose(
    openCommand,
    uniqueRaceDependencies(event("opened", openCommand.requestFingerprint, 41)),
  );
  const refreshed = await refreshFinanceClose(
    refreshCommand,
    {
      providerRegistry: emptyRegistry,
      persistence: uniqueRaceDependencies(event("refreshed", refreshCommand.requestFingerprint, refreshCommand.runId)),
    },
  );

  assert.equal(opened.ok, true);
  assert.equal(refreshed.ok, true);
  if (opened.ok) assert.equal(opened.data, workspace);
  if (refreshed.ok) assert.equal(refreshed.data, workspace);
});

test("colliding close event keys with a different kind, fingerprint, scope or run remain conflicts", async () => {
  const cases = [
    openFinanceClose(openCommand, uniqueRaceDependencies(event("refreshed", openCommand.requestFingerprint, 41))),
    openFinanceClose(openCommand, uniqueRaceDependencies(event("opened", "different-open", 41))),
    openFinanceClose(openCommand, uniqueRaceDependencies(event("opened", openCommand.requestFingerprint, 41, { companyId: 9 }))),
    refreshFinanceClose(refreshCommand, { providerRegistry: emptyRegistry, persistence: uniqueRaceDependencies(event("refreshed", refreshCommand.requestFingerprint, 99)) }),
    refreshFinanceClose(refreshCommand, { providerRegistry: emptyRegistry, persistence: uniqueRaceDependencies(event("refreshed", "different-refresh", refreshCommand.runId)) }),
  ];
  const results = await Promise.all(cases);

  assert.equal(results.every((result) => !result.ok && result.status === 409), true);
});

test("non-unique close persistence errors are not converted into idempotency conflicts", async () => {
  let eventReads = 0;
  const deps = {
    transaction: async () => { throw new Error("database unavailable"); },
    findEvent: async () => { eventReads += 1; return null; },
    loadWorkspace: async () => workspace,
  } as FinanceCloseServiceDependencies;

  await assert.rejects(openFinanceClose(openCommand, deps), /database unavailable/u);
  assert.equal(eventReads, 0);
});
