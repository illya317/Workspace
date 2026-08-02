import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  repairHrOrganizationBaselineCompatibility,
  validateHrOrganizationBaselineCompatibilityInput,
} from "./repair-hr-organization-baseline-compatibility.mjs";

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "hr-organization-baseline-compatibility-repair",
    repairKey: "2026-07-28-production-v1",
    actorUserId: 2,
    departments: [{
      departmentId: 835,
      baselineVersionId: 42,
      expectedSequence: 2,
      expectedArchiveTimestamp: "2026-06-22 03:18:41.525",
      validToExclusive: "2026-06-22",
    }],
    positions: [{
      positionId: 3153,
      baselineVersionId: 9,
      expectedSequence: 2,
      expectedArchiveTimestamp: "2026-06-22 06:43:11.51",
      validToExclusive: "2026-06-22",
    }],
    ...overrides,
  };
}

test("organization baseline compatibility input pins archive timestamps and their business dates", () => {
  assert.equal(validateHrOrganizationBaselineCompatibilityInput(input()).repairKey, "2026-07-28-production-v1");
  assert.throws(() => validateHrOrganizationBaselineCompatibilityInput(input({
    departments: [{
      departmentId: 835,
      baselineVersionId: 42,
      expectedSequence: 2,
      expectedArchiveTimestamp: "2026-06-22 03:18:41.525",
      validToExclusive: "2026-06-23",
    }],
  })), /Department repair row/);
  assert.throws(() => validateHrOrganizationBaselineCompatibilityInput(input({
    positions: [
      input().positions[0],
      input().positions[0],
    ],
  })), /Position repair row/);
});

test("an already applied organization baseline compatibility repair is an idempotent no-op", async () => {
  const value = input();
  const inputDigest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(String(sql).trim().split(/\s+/).slice(0, 3).join(" "));
      if (String(sql).includes('SELECT "value"')) {
        return {
          rowCount: 1,
          rows: [{
            value: JSON.stringify({
              inputDigest,
              result: { repairedDepartments: 8, repairedPositions: 17 },
            }),
          }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  assert.deepEqual(await repairHrOrganizationBaselineCompatibility(client, value), {
    repairedDepartments: 8,
    repairedPositions: 17,
    alreadyApplied: true,
  });
  assert.equal(calls.at(-1), "COMMIT");
});

test("organization baseline compatibility appends an unknown slice and cancellation per archived anchor", async () => {
  const value = input();
  const calls = [];
  const client = {
    async query(sql, parameters = []) {
      const text = String(sql);
      calls.push(text);
      if (text.includes('SELECT "value"')) return { rowCount: 0, rows: [] };
      if (text.includes('SELECT id FROM "User"')) return { rowCount: 1, rows: [{ id: 2 }] };
      if (text.includes('AS "archiveTimestamp"')) {
        const source = text.includes('FROM "Department"') ? value.departments[0] : value.positions[0];
        return {
          rowCount: 1,
          rows: [{
            id: parameters[0],
            version: source.expectedSequence,
            isArchived: true,
            archiveTimestamp: source.expectedArchiveTimestamp,
            legacyEndDate: null,
            baselineVersionId: source.baselineVersionId,
            sequence: source.expectedSequence,
            validFrom: null,
            validToExclusive: null,
            recordState: "unknown",
            changeKind: "baseline",
            supersedesId: null,
            baselineIdempotencyKey: `${text.includes('FROM "Department"') ? "migration:department:" : "migration:position:"}${parameters[0]}`,
            baselineExpectedSequence: source.expectedSequence,
            payloadMatches: true,
            hasSuccessor: false,
          }],
        };
      }
      if (text.includes('UPDATE "Department"') || text.includes('UPDATE "Position"')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("INSERT INTO")) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    },
  };
  assert.deepEqual(await repairHrOrganizationBaselineCompatibility(client, value), {
    repairedDepartments: 1,
    repairedPositions: 1,
    alreadyApplied: false,
  });
  assert.equal(calls.filter((sql) => sql.includes('INSERT INTO "DepartmentEffectiveVersion"')).length, 2);
  assert.equal(calls.filter((sql) => sql.includes('INSERT INTO "PositionEffectiveVersion"')).length, 2);
  assert.equal(calls.at(-1), "COMMIT");
});
