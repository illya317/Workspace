import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { Prisma } from "@workspace/platform/server/prisma";
import { sha256CanonicalJson } from "./canonical-json";
import {
  createOrReadFinanceCloseEvidenceSnapshot,
  FinanceCloseEvidenceSnapshotConflict,
} from "./evidence-snapshot-store";

type StoredEvidence = {
  id: number;
  taskId: number;
  inputFingerprint: string;
  contributorVersion: string;
  payloadSha256: string;
};

function evidenceInput(payloadSha256?: string) {
  const payload = { status: "ready" } as Prisma.InputJsonValue;
  return {
    taskId: 17,
    taskKey: "bank-balance",
    inputFingerprint: "a".repeat(64),
    contributorVersion: "provider-v1",
    payloadSha256: payloadSha256 ?? sha256CanonicalJson(payload),
    payload,
  };
}

function appendOnlyStore() {
  let stored: StoredEvidence | null = null;
  const calls = { createMany: 0, findUnique: 0 };
  const financeCloseEvidenceSnapshot = {
    async createMany(args: { data: Array<Omit<StoredEvidence, "id">>; skipDuplicates: boolean }) {
      calls.createMany += 1;
      const incoming = args.data[0];
      assert.equal(args.skipDuplicates, true);
      if (!stored) stored = { id: 41, ...incoming };
      return { count: stored.id === 41 && calls.createMany === 1 ? 1 : 0 };
    },
    async findUnique() {
      calls.findUnique += 1;
      return stored ? { id: stored.id, payloadSha256: stored.payloadSha256 } : null;
    },
  };
  return {
    calls,
    client: { financeCloseEvidenceSnapshot } as unknown as Pick<Prisma.TransactionClient, "financeCloseEvidenceSnapshot">,
  };
}

test("reuses the same immutable evidence snapshot on a duplicate refresh", async () => {
  const store = appendOnlyStore();
  const first = await createOrReadFinanceCloseEvidenceSnapshot(store.client, evidenceInput());
  const replay = await createOrReadFinanceCloseEvidenceSnapshot(store.client, evidenceInput());

  assert.deepEqual(first, { id: 41, payloadSha256: sha256CanonicalJson({ status: "ready" }) });
  assert.deepEqual(replay, first);
  assert.deepEqual(store.calls, { createMany: 2, findUnique: 2 });
});

test("rejects a duplicate identity whose immutable payload hash differs", async () => {
  const store = appendOnlyStore();
  await createOrReadFinanceCloseEvidenceSnapshot(store.client, evidenceInput());

  await assert.rejects(
    createOrReadFinanceCloseEvidenceSnapshot(store.client, evidenceInput("b".repeat(64))),
    FinanceCloseEvidenceSnapshotConflict,
  );
});

test("immutable evidence snapshot persistence contains no update or upsert path", () => {
  const source = ["service.ts", "evidence-snapshot-store.ts"]
    .map((file) => fs.readFileSync(path.resolve("packages/finance/server/close", file), "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /financeCloseEvidenceSnapshot\.(?:upsert|update|updateMany|delete|deleteMany)\b/u);
  assert.match(source, /financeCloseEvidenceSnapshot\.createMany\([\s\S]+skipDuplicates:\s*true/u);
});
