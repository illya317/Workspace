import assert from "node:assert/strict";
import test from "node:test";

import {
  repairHrLifecycleCompatibility,
  validateHrLifecycleCompatibilityRepairInput,
} from "./repair-hr-lifecycle-compatibility.mjs";

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "hr-lifecycle-compatibility-repair",
    repairKey: "2026-07-27-production-v1",
    actorUserId: 2,
    asOfDate: "2026-07-27",
    normalizeEmploymentDates: [{
      employmentId: 10,
      employeeId: 20,
      expectedVersion: 1,
      fromJoinDate: "2017-5-2",
      toJoinDate: "2017-05-02",
    }],
    inferLeaveDates: [{
      employmentId: 11,
      employeeId: 21,
      expectedVersion: 2,
      inferredLeaveDate: "2026-06-26",
      evidenceAssignmentIds: [31, 32],
    }],
    closeAssignments: [{
      assignmentId: 33,
      employeeId: 22,
      expectedVersion: 3,
      fromEndDate: null,
      toEndDate: "2025-01-31",
    }],
    markPrimaryAssignments: [{ assignmentId: 34, employeeId: 23, expectedVersion: 4 }],
    ...overrides,
  };
}

test("HR lifecycle compatibility input pins exact versions and deterministic date repairs", () => {
  assert.equal(validateHrLifecycleCompatibilityRepairInput(input()).repairKey, "2026-07-27-production-v1");
  assert.throws(() => validateHrLifecycleCompatibilityRepairInput(input({
    normalizeEmploymentDates: [{
      employmentId: 10,
      employeeId: 20,
      expectedVersion: 1,
      fromJoinDate: "2017-5-2",
      toJoinDate: "2017-05-03",
    }],
  })), /normalizeEmploymentDates/);
  assert.throws(() => validateHrLifecycleCompatibilityRepairInput(input({
    closeAssignments: [
      { assignmentId: 33, employeeId: 22, expectedVersion: 3, fromEndDate: null, toEndDate: "2025-01-31" },
      { assignmentId: 33, employeeId: 22, expectedVersion: 3, fromEndDate: null, toEndDate: "2025-01-31" },
    ],
  })), /duplicate assignmentId/);
});

test("an already applied HR lifecycle repair is an idempotent no-op", async () => {
  const value = input();
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(String(sql).trim().split(/\s+/).slice(0, 3).join(" "));
      if (String(sql).includes('SELECT "value"')) {
        const { createHash } = await import("node:crypto");
        const inputDigest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
        return {
          rowCount: 1,
          rows: [{ value: JSON.stringify({ inputDigest, result: { closedAssignments: 209 } }) }],
        };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  assert.deepEqual(await repairHrLifecycleCompatibility(client, value), {
    closedAssignments: 209,
    alreadyApplied: true,
  });
  assert.equal(calls.at(-1), "COMMIT");
});
