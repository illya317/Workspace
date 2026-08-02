import assert from "node:assert/strict";
import test from "node:test";

import { filterPositionsForLoadedDepartments } from "./department-position-data";

const positions = [
  { id: 1, departmentId: 10 },
  { id: 2, departmentId: 20 },
  { id: 3, departmentId: null },
];

test("active view keeps positions in loaded departments and positions without a department", () => {
  const result = filterPositionsForLoadedDepartments(positions, new Set([10]), false);

  assert.deepEqual(result.map((position) => position.id), [1, 3]);
});

test("archive view keeps archived positions whose departments are still active", () => {
  const result = filterPositionsForLoadedDepartments(positions, new Set([10]), true);

  assert.deepEqual(result.map((position) => position.id), [1, 2, 3]);
});
