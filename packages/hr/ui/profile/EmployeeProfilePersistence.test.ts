import assert from "node:assert/strict";
import test from "node:test";

import type { ProfileField } from "@workspace/hr/types";
import { normalizeFieldValue } from "./EmployeeProfilePersistenceValues";

test("remote-reference string ids are normalized to numbers before persistence", () => {
  const field = { key: "positionId", label: "岗位", type: "fk" } as ProfileField;
  assert.equal(normalizeFieldValue(field, "101"), 101);
  assert.equal(normalizeFieldValue(field, 101), 101);
  assert.equal(normalizeFieldValue(field, null), null);
});

test("name-valued references remain strings", () => {
  const field = { key: "company", label: "公司", type: "fk", valueFrom: "name" } as ProfileField;
  assert.equal(normalizeFieldValue(field, "101"), "101");
});
