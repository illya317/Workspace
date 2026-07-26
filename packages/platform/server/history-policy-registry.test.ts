import assert from "node:assert/strict";
import test from "node:test";

import {
  getHistoryPolicy,
  getRestorableHistoryPolicy,
} from "./history-policy-registry";

test("temporal employee records cannot bypass domain commands through audit restore", () => {
  for (const entityType of ["Employee", "Employment", "EDP", "EmployeeProject"]) {
    assert.equal(getHistoryPolicy(entityType)?.restore, false);
    assert.equal(getRestorableHistoryPolicy(entityType), undefined);
  }
});

test("closing temporal restore does not disable unrelated registered restore policies", () => {
  assert.equal(getRestorableHistoryPolicy("Project")?.restore.mode, "update-or-create");
});
