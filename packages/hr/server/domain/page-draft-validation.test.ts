import assert from "node:assert/strict";
import test from "node:test";

import { buildEmployeePageDraftCommand } from "./employee-validation";
import { buildHrPageDraftEnvelopeCommand } from "./page-draft-validation";

test("page draft envelope rejects duplicate cell changes", () => {
  const result = buildHrPageDraftEnvelopeCommand({
    userId: 1,
    changes: [
      { id: 2, field: "name", value: "甲" },
      { id: 2, field: "name", value: "乙" },
    ],
  });
  assert.equal(result.ok, false);
});

test("employee page draft normalizes all fields in one command", () => {
  const result = buildEmployeePageDraftCommand({
    userId: 1,
    changes: [
      { id: 2, field: "gender", value: "女" },
      { id: 3, field: "alias", value: "小张、张工" },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.changes, [
    { id: 2, field: "gender", value: false },
    { id: 3, field: "alias", value: JSON.stringify(["小张", "张工"]) },
  ]);
});

test("employee page draft accepts audited identity and account corrections", () => {
  const result = buildEmployeePageDraftCommand({
    userId: 1,
    changes: [
      { id: 2, field: "employeeId", value: " EMP-00004 " },
      { id: 2, field: "userId", value: "42" },
    ],
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      userId: 1,
      changes: [
        { id: 2, field: "employeeId", value: "EMP-00004" },
        { id: 2, field: "userId", value: 42 },
      ],
    },
  });
});
