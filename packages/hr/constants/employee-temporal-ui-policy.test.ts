import assert from "node:assert/strict";
import test from "node:test";

import { edpFields, employmentFields } from "./profile-fields";
import { edpConfig, employmentConfig } from "./tab-configs/people";

test("assignment fields stay reusable by lifecycle forms while ordinary tables are read-only", () => {
  for (const field of edpFields) {
    assert.notEqual(field.readOnly, true, `${field.key} must remain editable in the lifecycle command form`);
  }
  for (const field of edpConfig.fields) {
    assert.equal(field.editable, false, `${field.key} must stay read-only in the ordinary EDP table`);
  }
});

test("profile edits dates directly while the ordinary employment table stays read-only", () => {
  assert.equal(employmentFields.find((field) => field.key === "isActive")?.readOnly, true);
  for (const key of ["joinDate", "leaveDate"]) {
    assert.notEqual(employmentFields.find((field) => field.key === key)?.readOnly, true);
    assert.equal(employmentConfig.fields.find((field) => field.key === key)?.editable, false);
  }
});
