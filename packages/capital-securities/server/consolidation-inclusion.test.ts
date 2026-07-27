import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("server-only", { namedExports: {} } as never);
mock.module("@workspace/platform/server/business-action-executor", {
  namedExports: { assertBusinessActionDirectExecutionAllowed: async () => ({ ok: true }) },
});

const calls: { created: unknown[]; rebuilt: unknown[] } = { created: [], rebuilt: [] };
let included = false;

const sourceEvents = [{
  id: 1,
  issuerCompanyId: 2,
  sequence: 1,
  eventType: "incorporation",
  eventName: "设立",
  effectiveDate: new Date("2024-01-01T00:00:00.000Z"),
  ledgerMode: "transactions",
  dataCompleteness: "complete",
  recordStatus: "confirmed",
  registeredCapitalCheckpointYuan: 100,
  consolidatedByPartyIdAfter: null,
  supersedesEventId: null,
  sourceType: "import",
  sourceLabel: "股权资料",
  sourceReference: null,
  transactions: [{
    id: 1,
    sequence: 1,
    fromPartyId: null,
    toPartyId: 10,
    registeredCapitalAmountYuan: 100,
  }],
  snapshotPositions: [],
}];

const tx = {
  ownershipInterest: {
    findUnique: async (query: { include?: unknown }) => query.include
      ? {
          id: 76,
          issuerCompanyId: 2,
          ownerPartyId: 10,
          version: 1,
          effectiveFrom: new Date("2024-01-01T00:00:00.000Z"),
          effectiveTo: null,
          isConsolidated: included,
          owner: { company: { id: 1 } },
        }
      : { issuerCompanyId: 2 },
  },
  shareCapitalEvent: {
    findMany: async () => sourceEvents,
    create: async ({ data }: { data: unknown }) => {
      calls.created.push(data);
      return { id: 2 };
    },
  },
  $queryRaw: async () => [{ locked: "1" }],
};

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
    prisma: { $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx) },
  },
});
mock.module("./ownership-projection", {
  namedExports: {
    toEquityLedgerEvents: (events: unknown[]) => events,
    rebuildOwnershipProjectionInTransaction: async (_tx: unknown, command: unknown) => {
      calls.rebuilt.push(command);
      return { runId: 5 };
    },
  },
});

const { setConsolidationInclusion } = await import("./consolidation-inclusion");

test("appends the control snapshot and rebuilds the projection in one transaction", async () => {
  included = false;
  calls.created.length = 0;
  calls.rebuilt.length = 0;
  const result = await setConsolidationInclusion({
    relationId: 76,
    expectedVersion: 1,
    included: true,
    effectiveDate: "2026-07-31",
    actorUserId: 9,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.changed, true);
  assert.equal(calls.created.length, 1);
  assert.equal(calls.rebuilt.length, 1);
  const event = calls.created[0] as {
    consolidatedByPartyIdAfter: number | null;
    eventType: string;
    ledgerMode: string;
    snapshotPositions: { create: Array<{ partyId: number; registeredCapitalAmountYuan: number }> };
  };
  assert.equal(event.consolidatedByPartyIdAfter, 10);
  assert.equal(event.eventType, "confirmation_snapshot");
  assert.equal(event.ledgerMode, "confirmation_snapshot");
  assert.deepEqual(event.snapshotPositions.create.map((position) => [position.partyId, position.registeredCapitalAmountYuan]), [[10, 100]]);
});

test("does not append another event when the projected choice already matches", async () => {
  included = false;
  calls.created.length = 0;
  calls.rebuilt.length = 0;
  const result = await setConsolidationInclusion({
    relationId: 76,
    expectedVersion: 1,
    included: false,
    effectiveDate: "2026-07-31",
    actorUserId: 9,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.changed, false);
  assert.equal(calls.created.length, 0);
  assert.equal(calls.rebuilt.length, 0);
});
