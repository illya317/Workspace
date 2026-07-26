import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentEmployeeBatchDraftCommand,
  buildAgentEmployeeDraftCommand,
  employeeFieldSnapshotMatches,
  parseExpectedEmployeeFieldSnapshots,
} from "./agent-employee-proposal-validation";

test("HR Agent proposal commands validate identity, field, value, and batch operator", () => {
  assert.deepEqual(buildAgentEmployeeDraftCommand({
    employeeId: " EMP-X001 ",
    field: "school",
    newValue: "北京大学",
  }), {
    ok: true,
    data: { employeeId: "EMP-X001", keyword: "", field: "school", value: "北京大学" },
  });
  const unsupportedField = buildAgentEmployeeDraftCommand({
    employeeId: "EMP-X001",
    field: "name",
    newValue: "X",
  });
  assert.equal(unsupportedField.ok, false);
  if (unsupportedField.ok) throw new Error("expected unsupported field validation failure");
  assert.match(unsupportedField.issue.message, /不支持修改/);

  assert.deepEqual(buildAgentEmployeeBatchDraftCommand({
    filterField: "politics",
    filterOp: "equals",
    filterValue: "群众",
    updateField: "hometown",
    updateValue: "上海",
  }), {
    ok: true,
    data: {
      filterField: "politics",
      filterOp: "equals",
      filterValue: "群众",
      updateField: "hometown",
      updateValue: "上海",
    },
  });
  const unsupportedOperator = buildAgentEmployeeBatchDraftCommand({
    filterField: "politics",
    filterOp: "delete",
    updateField: "hometown",
  });
  assert.equal(unsupportedOperator.ok, false);
  if (unsupportedOperator.ok) throw new Error("expected unsupported operator validation failure");
  assert.match(unsupportedOperator.issue.message, /筛选操作不支持/);
});

test("HR Agent proposal snapshots require unique employee ids, versions, and scalar old values", () => {
  assert.deepEqual(parseExpectedEmployeeFieldSnapshots([
    { employeeId: "EMP-X001", version: 4, oldValue: "本科" },
    { employeeId: "00002", version: 7, oldValue: null },
  ]), [
    { employeeId: "EMP-X001", version: 4, oldValue: "本科" },
    { employeeId: "00002", version: 7, oldValue: null },
  ]);
  assert.throws(() => parseExpectedEmployeeFieldSnapshots([]), /版本快照/);
  assert.throws(() => parseExpectedEmployeeFieldSnapshots([
    { employeeId: "EMP-X001", version: 1, oldValue: null },
    { employeeId: "EMP-X001", version: 2, oldValue: null },
  ]), /重复工号/);
  assert.throws(() => parseExpectedEmployeeFieldSnapshots([
    { employeeId: "EMP-X001", version: 1, oldValue: { unsafe: true } },
  ]), /版本快照无效/);
});

test("HR Agent proposal snapshot rejects a changed version or old field value", () => {
  const expected = { employeeId: "EMP-X001", version: 4, oldValue: "本科" };
  assert.equal(employeeFieldSnapshotMatches({ employeeId: "EMP-X001", version: 4, education: "本科" }, "education", expected), true);
  assert.equal(employeeFieldSnapshotMatches({ employeeId: "EMP-X001", version: 5, education: "本科" }, "education", expected), false);
  assert.equal(employeeFieldSnapshotMatches({ employeeId: "EMP-X001", version: 4, education: "硕士" }, "education", expected), false);
});
