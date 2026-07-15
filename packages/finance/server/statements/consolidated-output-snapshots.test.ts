import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

import {
  persistConsolidatedOutputSnapshot,
  readConsolidatedOutputSnapshot,
} from "./consolidated-output-snapshots";

test("snapshot persistence writes one immutable row through the transaction seam", async () => {
  const data = {
    batchId: 7,
    version: 1,
    inputFingerprint: "a".repeat(64),
    outputFingerprint: "b".repeat(64),
    reportPayload: { generatedAt: "2027-01-04T08:09:10.123Z" },
    generatedAt: new Date("2027-01-04T08:09:10.123Z"),
  };
  let createInput: unknown;
  const tx = {
    financeConsolidationOutputSnapshot: {
      create: async (input: unknown) => {
        createInput = input;
        return input;
      },
    },
  } as Parameters<typeof persistConsolidatedOutputSnapshot>[0];

  await persistConsolidatedOutputSnapshot(tx, { data });

  assert.deepEqual(createInput, { data });
});

test("historical snapshot versions are selected explicitly", () => {
  const result = readConsolidatedOutputSnapshot({
    batchId: 7,
    version: 99,
    inputFingerprint: "a".repeat(64),
    outputFingerprint: "b".repeat(64),
    reportPayload: {},
    generatedAt: new Date("2027-01-04T08:09:10.123Z"),
  }, 7, {} as ConsolidationBatchSnapshot);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.issue.message, /版本不受支持/);
});
