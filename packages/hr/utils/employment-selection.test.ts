import assert from "node:assert/strict";
import test from "node:test";

import {
  employmentForAgreementDate,
  employmentsContainingDate,
  orderEmploymentsByPreference,
  preferredEmployment,
} from "./employment-selection";

test("employment preference uses business state instead of the legacy active flag", () => {
  const rows = [
    { id: 1, joinDate: "2024-01-01", leaveDate: "2026-07-01", temporalState: "past" as const },
    { id: 2, joinDate: "2026-09-01", leaveDate: null, temporalState: "upcoming" as const },
    { id: 3, joinDate: "2026-08-01", leaveDate: null, temporalState: "upcoming" as const },
  ];

  assert.equal(preferredEmployment(rows)?.id, 3);
  assert.deepEqual(orderEmploymentsByPreference(rows).map((row) => row.id), [3, 2, 1]);
});

test("current employment wins and recent history is ordered before older history", () => {
  const rows = [
    { id: 1, joinDate: "2023-01-01", leaveDate: "2024-12-31", temporalState: "past" as const },
    { id: 2, joinDate: "2025-01-01", leaveDate: "2025-12-31", temporalState: "past" as const },
    { id: 3, joinDate: "2026-01-01", leaveDate: null, temporalState: "current" as const },
  ];

  assert.deepEqual(orderEmploymentsByPreference(rows).map((row) => row.id), [3, 2, 1]);
});

test("contract ownership is resolved from the inclusive employment period", () => {
  const rows = [
    { id: 1, joinDate: "2024-01-01", leaveDate: "2025-12-31", temporalState: "past" as const },
    { id: 2, joinDate: "2026-01-01", leaveDate: null, temporalState: "current" as const },
  ];

  assert.deepEqual(employmentsContainingDate(rows, "2025-12-31").map((row) => row.id), [1]);
  assert.deepEqual(employmentsContainingDate(rows, "2026-01-01").map((row) => row.id), [2]);
});

test("overlapping employment periods remain visible as an ambiguous contract owner", () => {
  const rows = [
    { id: 1, joinDate: "2026-01-01", leaveDate: null, temporalState: "current" as const },
    { id: 2, joinDate: "2026-07-01", leaveDate: null, temporalState: "current" as const },
  ];

  assert.deepEqual(employmentsContainingDate(rows, "2026-07-27").map((row) => row.id), [1, 2]);
  assert.equal(employmentForAgreementDate(rows, "2026-07-27").ok, false);
});
