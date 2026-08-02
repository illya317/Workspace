import assert from "node:assert/strict";
import test from "node:test";

import {
  isEmploymentLifecycleField,
  isEmploymentProfileCorrectionField,
} from "./employee-temporal-write-policy";

test("employment profile corrections cannot mutate lifecycle boundaries", () => {
  for (const field of ["isActive", "joinDate", "leaveDate"]) {
    assert.equal(isEmploymentLifecycleField(field), true);
    assert.equal(isEmploymentProfileCorrectionField(field), false);
  }
});

test("employment profile keeps only non-period correction fields", () => {
  for (const field of [
    "officeLocation",
    "personnelType",
    "rank",
    "title",
    "leaveReason",
    "leaveNote",
  ]) {
    assert.equal(isEmploymentProfileCorrectionField(field), true);
    assert.equal(isEmploymentLifecycleField(field), false);
  }
  assert.equal(isEmploymentProfileCorrectionField("contracts"), false);
  assert.equal(isEmploymentProfileCorrectionField("employeeId"), false);
});
