import assert from "node:assert/strict";
import test from "node:test";

import { classifyGenesisState, digestMigrationRows } from "./prisma-genesis-cutover.mjs";

const fromSourceSha = "a".repeat(40);
const candidateSourceSha = "b".repeat(40);
const baselineMigration = "00000000000000_sanitized_baseline";
const baselineChecksum = "c".repeat(64);
const legacyRows = [
  { migration_name: "20260701000000_first", checksum: "1".repeat(64), finished_at: new Date(), rolled_back_at: null, applied_steps_count: 1 },
  { migration_name: "20260702000000_second", checksum: "2".repeat(64), finished_at: new Date(), rolled_back_at: null, applied_steps_count: 1 },
];
const options = {
  fromSourceSha,
  candidateSourceSha,
  legacyMigrationCount: legacyRows.length,
  legacyMigrationSetSha256: digestMigrationRows(legacyRows),
  baselineMigration,
  baselineChecksum,
};

function marker(status = "cleared") {
  return { schemaVersion: 1, kind: "workspace-prisma-genesis", ...options, status, preparedAt: "2026-07-26T00:00:00.000Z" };
}

test("genesis recognizes only the exact audited legacy migration inventory", () => {
  assert.equal(classifyGenesisState({ rows: legacyRows, marker: null, ...options }).state, "legacy-ready");
  assert.throws(
    () => classifyGenesisState({ rows: legacyRows.slice(1), marker: null, ...options }),
    /legacy migration count/,
  );
});

test("genesis recovery accepts an atomically cleared inventory with its exact marker", () => {
  assert.equal(classifyGenesisState({ rows: [], marker: marker(), ...options }).state, "cleared");
  assert.throws(() => classifyGenesisState({ rows: [], marker: null, ...options }), /marker is missing/);
});

test("genesis completion requires one matching sanitized baseline receipt", () => {
  const row = { migration_name: baselineMigration, checksum: baselineChecksum, finished_at: new Date(), rolled_back_at: null, applied_steps_count: 0 };
  assert.equal(classifyGenesisState({ rows: [row], marker: marker(), ...options }).state, "baseline-recorded");
  assert.equal(classifyGenesisState({ rows: [row], marker: marker("completed"), ...options }).state, "completed");
  assert.throws(
    () => classifyGenesisState({ rows: [row, legacyRows[0]], marker: marker(), ...options }),
    /mixed with unexpected migration history/,
  );
  assert.throws(
    () => classifyGenesisState({ rows: [{ ...row, applied_steps_count: 1 }], marker: marker(), ...options }),
    /must be recorded by Prisma resolve/,
  );
});

test("genesis rejects a legacy receipt that was resolved instead of executed", () => {
  const unresolvedLegacyRows = [{ ...legacyRows[0], applied_steps_count: 0 }, legacyRows[1]];
  assert.throws(
    () => classifyGenesisState({ rows: unresolvedLegacyRows, marker: null, ...options }),
    /only resolved, not executed/,
  );
  assert.throws(() => digestMigrationRows(unresolvedLegacyRows), /only resolved, not executed/);
});
