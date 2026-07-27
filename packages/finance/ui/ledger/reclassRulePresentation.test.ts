import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveFilteredRuleSelection,
  visibleRuleCandidateIds,
} from "./reclassRulePresentation";

const allRows = [{ groupAccountId: 1123 }, { groupAccountId: 2202 }];
const unconfirmedRows = [{ groupAccountId: 2202 }];

test("rule status filter removes a previously selected non-matching account", () => {
  assert.deepEqual([...visibleRuleCandidateIds(unconfirmedRows, 1123, false)], [2202]);
  assert.equal(resolveFilteredRuleSelection({
    currentId: 1123,
    allRows,
    filteredRows: unconfirmedRows,
    filterActive: true,
    preserveFilteredOutSelection: false,
  }), 2202);
});

test("dirty rule form may temporarily preserve its filtered-out selection", () => {
  assert.deepEqual([...visibleRuleCandidateIds(unconfirmedRows, 1123, true)], [2202, 1123]);
  assert.equal(resolveFilteredRuleSelection({
    currentId: 1123,
    allRows,
    filteredRows: unconfirmedRows,
    filterActive: true,
    preserveFilteredOutSelection: true,
  }), 1123);
});

test("active rule filter clears selection when it has no matches", () => {
  assert.equal(resolveFilteredRuleSelection({
    currentId: 1123,
    allRows,
    filteredRows: [],
    filterActive: true,
    preserveFilteredOutSelection: false,
  }), null);
});
