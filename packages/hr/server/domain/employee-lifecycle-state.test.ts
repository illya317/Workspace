import assert from "node:assert/strict";
import test from "node:test";

import { employeeLifecycleEventState, strictIntegerArray } from "./employee-lifecycle-state";

test("legacy cancellation evidence accepts only wholly valid integer arrays", () => {
  assert.deepEqual(strictIntegerArray([7, 8]), { valid: true, items: [7, 8] });
  assert.deepEqual(strictIntegerArray([7, "bad"]), { valid: false, items: [] });
  assert.deepEqual(strictIntegerArray([0, -1]), { valid: false, items: [] });
  assert.deepEqual(strictIntegerArray(null), { valid: false, items: [] });
});

test("cancellation state remains independent after the effective date", () => {
  const details = { createdAssignmentIds: [42] };
  const cancelledAssignmentIds = new Set([42]);

  assert.deepEqual(
    employeeLifecycleEventState("2026-08-01", details, cancelledAssignmentIds, "2026-07-27"),
    {
      temporalState: "scheduled",
      recordState: "cancelled",
      recordStateProvenance: "legacy_inferred",
    },
  );
  assert.deepEqual(
    employeeLifecycleEventState("2026-08-01", details, cancelledAssignmentIds, "2026-08-02"),
    {
      temporalState: "effective",
      recordState: "cancelled",
      recordStateProvenance: "legacy_inferred",
    },
  );
});

test("confirmed lifecycle events follow their business effective date", () => {
  assert.deepEqual(
    employeeLifecycleEventState("2026-08-01", { createdAssignmentIds: [7] }, new Set(), "2026-07-27"),
    {
      temporalState: "scheduled",
      recordState: "confirmed",
      recordStateProvenance: "explicit",
    },
  );
  assert.deepEqual(
    employeeLifecycleEventState("2026-08-01", { createdAssignmentIds: [7] }, new Set(), "2026-08-01"),
    {
      temporalState: "effective",
      recordState: "confirmed",
      recordStateProvenance: "explicit",
    },
  );
});

test("legacy or malformed effects do not become confirmed records", () => {
  assert.deepEqual(
    employeeLifecycleEventState("2026-08-01", {}, new Set(), "2026-07-27"),
    {
      temporalState: "scheduled",
      recordState: "unknown",
      recordStateProvenance: "unknown",
    },
  );
  assert.deepEqual(
    employeeLifecycleEventState(
      "2026-08-01",
      { createdAssignmentIds: [7, "bad"] },
      new Set(),
      "2026-07-27",
    ),
    {
      temporalState: "scheduled",
      recordState: "unknown",
      recordStateProvenance: "unknown",
    },
  );
});
