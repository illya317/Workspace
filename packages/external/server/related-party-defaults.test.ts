import assert from "node:assert/strict";
import test from "node:test";

import { projectCoreManagementRelatedParties } from "./related-party-defaults";

const timestamp = new Date("2026-07-29T00:00:00.000Z");

function employee(id: number, name: string, idNumber: string | null = null) {
  return { id, name, idNumber, version: 1, createdAt: timestamp, updatedAt: timestamp };
}

test("projects a unique core employee selected through the finance FK", () => {
  const rows = projectCoreManagementRelatedParties(
    [employee(7, "张三", "ID-7"), employee(8, "李四", "ID-8")],
    "2026-07-29",
  );

  assert.deepEqual(rows.map((row) => ({ id: row.id, targetKind: row.targetKind, type: row.relatedPartyType })), [{
    id: 7,
    targetKind: "employee",
    type: "key_management_related",
  }, {
    id: 8,
    targetKind: "employee",
    type: "key_management_related",
  }]);
  assert.equal(rows[0]?.systemConfigured, true);
});

test("fails closed for duplicate employee names", () => {
  assert.equal(projectCoreManagementRelatedParties(
    [employee(7, "张三"), employee(8, "张三")],
    "2026-07-29",
  ).length, 0);
});
