import assert from "node:assert/strict";
import test from "node:test";

import { collectGroupAccountSubtreeIds } from "./materialize-confirmed";

test("collects the complete affected subtree for inherited reclassification rules", () => {
  const result = collectGroupAccountSubtreeIds([10], [
    { groupAccountId: 10, parentGroupAccountId: null },
    { groupAccountId: 11, parentGroupAccountId: 10 },
    { groupAccountId: 12, parentGroupAccountId: 11 },
    { groupAccountId: 20, parentGroupAccountId: null },
    { groupAccountId: 21, parentGroupAccountId: 20 },
  ]);

  assert.deepEqual(result, [10, 11, 12]);
});

test("deduplicates overlapping changed rule subtrees", () => {
  const result = collectGroupAccountSubtreeIds([10, 11, 10], [
    { groupAccountId: 10, parentGroupAccountId: null },
    { groupAccountId: 11, parentGroupAccountId: 10 },
    { groupAccountId: 12, parentGroupAccountId: 11 },
  ]);

  assert.deepEqual(result, [10, 11, 12]);
});
