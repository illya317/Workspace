import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "@workspace/platform/server/prisma";
import {
  appendConsolidationBatchEvent,
  claimConsolidationBatchRevision,
  immutableAuditSnapshot,
} from "./consolidation-mutations";

test("claims a batch with id, status, and client revision before incrementing once", async () => {
  let mutation: unknown;
  const tx = {
    financeConsolidationBatch: {
      updateMany: async (input: unknown) => {
        mutation = input;
        return { count: 1 };
      },
    },
  } as unknown as Prisma.TransactionClient;

  const nextRevision = await claimConsolidationBatchRevision(tx, {
    batchId: 7,
    status: "draft",
    expectedRevision: 4,
  });

  assert.equal(nextRevision, 5);
  assert.deepEqual(mutation, {
    where: { id: 7, status: "draft", revision: 4 },
    data: { revision: { increment: 1 } },
  });
});

test("failed compare-and-swap returns null", async () => {
  const tx = {
    financeConsolidationBatch: {
      updateMany: async () => ({ count: 0 }),
    },
  } as unknown as Prisma.TransactionClient;
  assert.equal(await claimConsolidationBatchRevision(tx, {
    batchId: 7,
    status: "submitted",
    expectedRevision: 4,
  }), null);
});

test("appends deletion evidence at the claimed batch revision", async () => {
  let event: unknown;
  const tx = {
    financeConsolidationBatchEvent: {
      create: async (input: unknown) => {
        event = input;
        return input;
      },
    },
  } as unknown as Prisma.TransactionClient;
  const snapshot = immutableAuditSnapshot({ id: 12, amount: { toJSON: () => "100.00" } });

  await appendConsolidationBatchEvent(tx, {
    batchId: 7,
    eventType: "mutation",
    action: "entry.delete",
    fromStatus: "draft",
    toStatus: "draft",
    note: "重复录入",
    actorUserId: 9,
    actorName: "张三",
    batchRevision: 5,
    targetType: "entry",
    targetId: 12,
    snapshot,
  });

  assert.deepEqual(event, {
    data: {
      batchId: 7,
      eventType: "mutation",
      action: "entry.delete",
      fromStatus: "draft",
      toStatus: "draft",
      note: "重复录入",
      actorUserId: 9,
      actorName: "张三",
      batchRevision: 5,
      targetType: "entry",
      targetId: 12,
      snapshot: { id: 12, amount: "100.00" },
    },
  });
});
