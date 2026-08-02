import assert from "node:assert/strict";
import test from "node:test";

import { deriveDepartmentCodeCascade } from "./department-code-cascade";

test("department cascade follows configured organization suffixes and position format", () => {
  const result = deriveDepartmentCodeCascade({
    changedDepartment: { id: 1, code: "FUN001", level: 1, parentId: null },
    newCode: "OPS001",
    departments: [
      { id: 1, code: "FUN001", level: 1, parentId: null },
      { id: 2, code: "FUN1000", level: 2, parentId: 1 },
      { id: 3, code: "FUN1001", level: 3, parentId: 2 },
    ],
    positions: [
      { id: 10, code: "POS/FUN1001/007", departmentId: 3 },
    ],
    departmentRule: {
      identifierFormat: "uppercaseLetters",
      identifierLength: 3,
      functionalPrefix: "FUN",
      separator: "",
      managementRootSuffix: "001",
      level2Suffix: "000",
      level2SequenceLength: 4,
      level3SequenceLength: 3,
    },
    positionRule: {
      prefix: "POS",
      separator: "/",
      sequenceLength: 3,
      sequenceStart: 1,
    },
  });

  assert.deepEqual(result.departments, [
    { id: 1, code: "OPS001" },
    { id: 2, code: "OPS1000" },
    { id: 3, code: "OPS1001" },
  ]);
  assert.deepEqual(result.positions, [
    { id: 10, code: "POS/OPS1001/007" },
  ]);
});

test("department cascade does not assume a three-character organization identifier", () => {
  const result = deriveDepartmentCodeCascade({
    changedDepartment: { id: 1, code: "A1BC001", level: 1, parentId: null },
    newCode: "D2EF001",
    departments: [
      { id: 1, code: "A1BC001", level: 1, parentId: null },
      { id: 2, code: "A1BC100", level: 2, parentId: 1 },
    ],
    positions: [],
    departmentRule: {
      identifierFormat: "uppercaseAlphanumeric",
      identifierLength: 4,
      functionalPrefix: "A1BC",
      separator: "",
      managementRootSuffix: "001",
      level2Suffix: "00",
      level2SequenceLength: 4,
      level3SequenceLength: 2,
    },
    positionRule: {
      prefix: "GW",
      separator: "-",
      sequenceLength: 2,
      sequenceStart: 1,
    },
  });

  assert.deepEqual(result.departments, [
    { id: 1, code: "D2EF001" },
    { id: 2, code: "D2EF100" },
  ]);
});
