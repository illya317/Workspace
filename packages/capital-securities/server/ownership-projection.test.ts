import assert from "node:assert/strict";
import test from "node:test";

import { rebuildOwnershipProjection } from "./ownership-projection";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test("issuer rebuild locks, hashes, replaces, and records complete provenance", async () => {
  const calls: string[] = [];
  let createdRows: Array<Record<string, unknown>> = [];
  let runData: Record<string, unknown> | null = null;
  const sourceEvents = [
    {
      id: 1, issuerCompanyId: 7, sequence: 1, eventType: "incorporation", eventName: "设立",
      effectiveDate: day("2024-01-01"), ledgerMode: "transactions", dataCompleteness: "complete",
      recordStatus: "confirmed", registeredCapitalCheckpointYuan: 100,
      consolidatedByPartyIdAfter: 10, supersedesEventId: null,
      sourceType: "agreement", sourceLabel: "设立协议", sourceReference: "A-1",
      transactions: [{ id: 1, sequence: 1, fromPartyId: null, toPartyId: 10, registeredCapitalAmountYuan: 100 }],
      snapshotPositions: [],
    },
    {
      id: 2, issuerCompanyId: 7, sequence: 2, eventType: "transfer", eventName: "转让",
      effectiveDate: day("2025-02-10"), ledgerMode: "transactions", dataCompleteness: "complete",
      recordStatus: "confirmed", registeredCapitalCheckpointYuan: 100,
      consolidatedByPartyIdAfter: 10, supersedesEventId: null,
      sourceType: "agreement", sourceLabel: "转让协议", sourceReference: "A-2",
      transactions: [{ id: 2, sequence: 1, fromPartyId: 10, toPartyId: 20, registeredCapitalAmountYuan: 25 }],
      snapshotPositions: [],
    },
  ];
  const tx = {
    $queryRaw: async () => { calls.push("lock"); return [{ locked: "" }]; },
    company: { findUnique: async () => { calls.push("issuer"); return { id: 7 }; } },
    shareCapitalEvent: { findMany: async () => { calls.push("events"); return sourceEvents; } },
    ownershipProjectionRun: {
      findFirst: async () => { calls.push("generation"); return { generation: 2 }; },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("run");
        runData = data;
        return { id: 91 };
      },
    },
    ownershipInterest: {
      count: async () => { calls.push("count"); return 4; },
      deleteMany: async () => { calls.push("delete"); return { count: 4 }; },
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        calls.push("create");
        createdRows = data;
        return { count: data.length };
      },
    },
  };
  const database = {
    $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
  };

  const receipt = await rebuildOwnershipProjection({
    issuerCompanyId: 7,
    triggeredBy: 3,
    triggerReason: "event confirmed",
  }, database as never);

  assert.deepEqual(calls, ["lock", "issuer", "events", "count", "generation", "run", "delete", "create"]);
  assert.equal(receipt.generation, 3);
  assert.match(receipt.ledgerHash, /^[a-f0-9]{64}$/);
  assert.equal(receipt.projectionRowCount, 3);
  assert.equal((runData as Record<string, unknown> | null)?.projectionRowCount, 3);
  assert.deepEqual(createdRows.map((row) => ({
    ownerPartyId: row.ownerPartyId,
    sourceEventId: row.sourceEventId,
    closedByEventId: row.closedByEventId,
    projectionRunId: row.projectionRunId,
    projectionGeneration: row.projectionGeneration,
  })), [
    { ownerPartyId: 10, sourceEventId: 1, closedByEventId: 2, projectionRunId: 91, projectionGeneration: 3 },
    { ownerPartyId: 10, sourceEventId: 2, closedByEventId: null, projectionRunId: 91, projectionGeneration: 3 },
    { ownerPartyId: 20, sourceEventId: 2, closedByEventId: null, projectionRunId: 91, projectionGeneration: 3 },
  ]);
});

test("issuer rebuild refuses to erase legacy projection when no source ledger exists", async () => {
  let deleted = false;
  const tx = {
    $queryRaw: async () => [],
    company: { findUnique: async () => ({ id: 7 }) },
    shareCapitalEvent: { findMany: async () => [] },
    ownershipInterest: {
      count: async () => 2,
      deleteMany: async () => { deleted = true; },
    },
  };
  const database = { $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx) };
  await assert.rejects(
    rebuildOwnershipProjection({ issuerCompanyId: 7 }, database as never),
    /已拒绝清空/,
  );
  assert.equal(deleted, false);
});

test("issuer rebuild fails before deleting projection when the issuer is missing", async () => {
  let deleted = false;
  const tx = {
    $queryRaw: async () => [],
    company: { findUnique: async () => null },
    ownershipInterest: { deleteMany: async () => { deleted = true; } },
  };
  const database = { $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx) };
  await assert.rejects(
    rebuildOwnershipProjection({ issuerCompanyId: 404 }, database as never),
    /发行主体不存在/,
  );
  assert.equal(deleted, false);
});
