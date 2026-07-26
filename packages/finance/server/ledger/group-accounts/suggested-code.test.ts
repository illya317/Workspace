import assert from "node:assert/strict";
import test from "node:test";

import { allocateSuggestedGroupCode } from "./sync";

const parent = { id: 1, code: "1002", category: "asset", parentId: null };

test("suggested child code follows the mapped group parent hierarchy", () => {
  const code = allocateSuggestedGroupCode(
    { code: "100203", category: "asset", parentAccountCode: "1002" },
    [parent, { id: 2, code: "100201", category: "asset", parentId: 1 }],
    1,
  );

  assert.equal(code, "100203");
});

test("suggested child code increments after occupied siblings", () => {
  const code = allocateSuggestedGroupCode(
    { code: "A-001", category: "asset", parentAccountCode: "A" },
    [
      parent,
      { id: 2, code: "100201", category: "asset", parentId: 1 },
      { id: 3, code: "100202", category: "asset", parentId: 1 },
    ],
    1,
  );

  assert.equal(code, "100203");
});

test("suggested child code keeps incrementing when a parent has more than 99 direct children", () => {
  const groups = [
    parent,
    ...Array.from({ length: 99 }, (_, index) => ({
      id: index + 2,
      code: `1002${String(index + 1).padStart(2, "0")}`,
      category: "asset",
      parentId: 1,
    })),
  ];

  const code = allocateSuggestedGroupCode(
    { code: "A-100", category: "asset", parentAccountCode: "A" },
    groups,
    1,
  );

  assert.equal(code, "1002100");
});

test("suggested root keeps an available conventional local code", () => {
  const code = allocateSuggestedGroupCode(
    { code: "1406", category: "asset", parentAccountCode: null },
    [{ id: 1, code: "1405", category: "asset", parentId: null }],
    null,
  );

  assert.equal(code, "1406");
});

test("suggested root increments within its accounting category", () => {
  const code = allocateSuggestedGroupCode(
    { code: "5403", category: "expense", parentAccountCode: null },
    [
      { id: 1, code: "6603", category: "expense", parentId: null },
      { id: 2, code: "6604", category: "expense", parentId: null },
    ],
    null,
  );

  assert.equal(code, "6605");
});
