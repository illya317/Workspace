import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmployeeFieldUpdateCommand,
  buildEmployeePageDraftCommand,
} from "./employee-validation";

test("ordinary HR updates cannot rewrite an employee account binding", () => {
  const field = buildEmployeeFieldUpdateCommand("userId", 99);
  assert.equal(field.ok, false);
  if (!field.ok) assert.match(field.issue.message, /账号管理流程/);

  const draft = buildEmployeePageDraftCommand({
    userId: 1,
    changes: [{ id: 7, field: "userId", value: 99 }],
  });
  assert.equal(draft.ok, false);
});
