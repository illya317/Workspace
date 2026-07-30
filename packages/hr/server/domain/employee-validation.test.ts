import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmployeeFieldUpdateCommand,
} from "./employee-validation";

test("ordinary HR updates cannot rewrite an employee account binding", () => {
  const field = buildEmployeeFieldUpdateCommand("userId", 99);
  assert.equal(field.ok, false);
  if (!field.ok) assert.match(field.issue.message, /账号管理流程/);
});
