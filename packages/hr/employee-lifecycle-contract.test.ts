import assert from "node:assert/strict";
import test from "node:test";

import {
  employeeCanOnboardAt,
  employeeEmploymentContainsDate,
} from "./employee-lifecycle-contract";

test("active employment without an end date cannot be onboarded again", () => {
  assert.equal(employeeCanOnboardAt({
    employments: [{ isActive: true, joinDate: "2024-04-16", leaveDate: null }],
    assignmentCount: 1,
    lifecycleEventCount: 1,
    effectiveDate: "2026-07-28",
  }), false);
});

test("onboarding is available after the previous employment ended", () => {
  assert.equal(employeeCanOnboardAt({
    employments: [{ isActive: false, joinDate: "2024-04-16", leaveDate: "2026-06-30" }],
    assignmentCount: 1,
    lifecycleEventCount: 1,
    effectiveDate: "2026-07-28",
  }), true);
});

test("future employment blocks an earlier duplicate onboarding", () => {
  assert.equal(employeeCanOnboardAt({
    employments: [{ isActive: false, joinDate: "2026-08-01", leaveDate: null }],
    assignmentCount: 0,
    lifecycleEventCount: 0,
    effectiveDate: "2026-07-28",
  }), false);
});

test("the sole empty legacy placeholder can be hydrated by onboarding", () => {
  assert.equal(employeeCanOnboardAt({
    employments: [{ isActive: true, joinDate: null, leaveDate: null }],
    assignmentCount: 0,
    lifecycleEventCount: 0,
    effectiveDate: "2026-07-28",
  }), true);
});

test("employment activity is derived for the selected effective date", () => {
  const employment = { isActive: false, joinDate: "2026-01-01", leaveDate: "2026-07-31" };
  assert.equal(employeeEmploymentContainsDate(employment, "2026-07-28"), true);
  assert.equal(employeeEmploymentContainsDate(employment, "2026-08-01"), false);
});
