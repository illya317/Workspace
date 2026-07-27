import assert from "node:assert/strict";
import test from "node:test";

import { isHydratableOnboardingPlaceholder } from "./employee-lifecycle-validation";

test("legacy active empty employment can be hydrated by the first onboarding command", () => {
  assert.equal(isHydratableOnboardingPlaceholder([
    { isActive: true, joinDate: null, leaveDate: null },
  ], 0, 0), true);
});

test("onboarding placeholder hydration fails closed when lifecycle facts already exist", () => {
  const row = [{ isActive: true, joinDate: null, leaveDate: null }];
  assert.equal(isHydratableOnboardingPlaceholder(row, 1, 0), false);
  assert.equal(isHydratableOnboardingPlaceholder(row, 0, 1), false);
  assert.equal(isHydratableOnboardingPlaceholder([
    { isActive: true, joinDate: "2026-07-27", leaveDate: null },
  ], 0, 0), false);
  assert.equal(isHydratableOnboardingPlaceholder([
    { isActive: false, joinDate: null, leaveDate: null },
  ], 0, 0), false);
});
