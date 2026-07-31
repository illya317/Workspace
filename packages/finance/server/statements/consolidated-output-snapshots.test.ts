import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidatedReportOutputPackage, ConsolidationBatchSnapshot } from "@workspace/finance/types";

import {
  CONSOLIDATED_OUTPUT_SNAPSHOT_VERSION,
  persistConsolidatedOutputSnapshot,
  prepareConsolidatedOutputSnapshot,
  readConsolidatedOutputSnapshot,
} from "./consolidated-output-snapshots";
import { consolidationFingerprint } from "./consolidation-fingerprints";

test("snapshot persistence writes one immutable row through the transaction seam", async () => {
  const data = {
    batchId: 7,
    version: CONSOLIDATED_OUTPUT_SNAPSHOT_VERSION,
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

function inputBatch(): ConsolidationBatchSnapshot {
  return {
    id: 7,
    parentCompanyId: 1,
    parentCompanyCode: "ZX01",
    parentCompanyName: "母公司",
    year: 2027,
    month: 1,
    periodKind: "month",
    version: 1,
    baseBatchId: null,
    scopeFingerprint: "scope",
    sourceFingerprint: "sources",
    rateFingerprint: "rates",
    entities: [{ id: 2 }, { id: 1 }],
    sources: [{ id: 4 }, { id: 3 }],
    exchangeRates: [
      { id: 6, applications: [{ companyId: 2 }, { companyId: 1 }] },
      { id: 5, applications: [] },
    ],
    entries: [
      {
        id: 8,
        createdAt: "2027-01-01T00:00:00.000Z",
        updatedAt: "2027-01-02T00:00:00.000Z",
        title: "抵销",
        lines: [{ id: 10 }, { id: 9 }],
        taxEffects: [{
          id: 12,
          createdAt: "2027-01-01T00:00:00.000Z",
          updatedAt: "2027-01-02T00:00:00.000Z",
        }],
      },
    ],
    controlDecisions: [{ id: 14 }, { id: 13 }],
    events: [],
  } as unknown as ConsolidationBatchSnapshot;
}

function reportPayload(
  batch: ConsolidationBatchSnapshot,
  generatedAt: Date,
): ConsolidatedReportOutputPackage {
  return {
    generatedAt: generatedAt.toISOString(),
    statements: [],
    sourceCount: 0,
    approvedEntryCount: 0,
    batch: {
      id: batch.id,
      parentCompanyId: batch.parentCompanyId,
      parentCompanyCode: batch.parentCompanyCode,
      parentCompanyName: batch.parentCompanyName,
      year: batch.year,
      month: batch.month,
      periodKind: batch.periodKind,
      version: batch.version,
      baseBatchId: batch.baseBatchId,
      scopeFingerprint: batch.scopeFingerprint,
      sourceFingerprint: batch.sourceFingerprint,
      rateFingerprint: batch.rateFingerprint,
    },
  } as ConsolidatedReportOutputPackage;
}

test("v2 input fingerprint ignores persistence timestamps and relation order", () => {
  const generatedAt = new Date("2027-01-04T08:09:10.123Z");
  const batch = inputBatch();
  const prepared = prepareConsolidatedOutputSnapshot(batch, reportPayload(batch, generatedAt), generatedAt);
  const currentBatch = structuredClone(batch);
  currentBatch.entities.reverse();
  currentBatch.sources.reverse();
  currentBatch.exchangeRates.reverse();
  currentBatch.exchangeRates[1]!.applications.reverse();
  currentBatch.entries[0]!.createdAt = "2027-01-04T09:09:10.123Z";
  currentBatch.entries[0]!.updatedAt = "2027-01-04T09:09:10.456Z";
  currentBatch.entries[0]!.lines.reverse();
  currentBatch.entries[0]!.taxEffects[0]!.updatedAt = "2027-01-04T09:09:10.456Z";
  currentBatch.controlDecisions.reverse();

  assert.equal(readConsolidatedOutputSnapshot(
    prepared.data,
    batch.id,
    currentBatch,
  ).ok, true);

  currentBatch.entries[0]!.title = "事实已变化";
  assert.equal(readConsolidatedOutputSnapshot(
    prepared.data,
    batch.id,
    currentBatch,
  ).ok, false);
});

test("historical v1 snapshots accept legacy month metadata and lock-owned timestamps", () => {
  const generatedAt = new Date("2027-01-04T08:09:10.123Z");
  const batch = inputBatch();
  const historicalPayload = reportPayload(batch, generatedAt);
  delete (historicalPayload.batch as { periodKind?: string }).periodKind;
  const historicalSnapshot = {
    batchId: batch.id,
    version: 1,
    inputFingerprint: "a".repeat(64),
    outputFingerprint: consolidationFingerprint(historicalPayload),
    reportPayload: historicalPayload,
    generatedAt,
  };
  batch.entries[0]!.updatedAt = "2027-01-04T09:09:10.456Z";
  assert.equal(readConsolidatedOutputSnapshot(
    historicalSnapshot,
    batch.id,
    batch,
  ).ok, true);

  batch.sourceFingerprint = "changed";
  assert.equal(readConsolidatedOutputSnapshot(
    historicalSnapshot,
    batch.id,
    batch,
  ).ok, false);
});
