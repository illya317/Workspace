import assert from "node:assert/strict";
import test from "node:test";

import {
  reclassRuleFormItems,
  reclassRuleReadOnlyItems,
  resolveFilteredRuleSelection,
  visibleRuleCandidateIds,
} from "./reclassRulePresentation";
import type { RuleCandidate } from "@workspace/finance/types";

const allRows = [{ groupAccountId: 1123 }, { groupAccountId: 2202 }];
const unconfirmedRows = [{ groupAccountId: 2202 }];
const candidate = {
  policyVersionId: 1,
  groupAccountId: 1601,
  accountCode: "1601",
  accountName: "固定资产",
  balanceDirection: "debit",
  abnormalSide: "credit",
  abnormalAmount: 0,
  hasHistoricalAbnormalBalance: false,
  effectiveDecision: "no_reclass",
  existingRuleId: null,
  existingRuleSourceGroupAccountId: null,
  inheritedFromAccountCode: null,
  existingTarget: null,
  existingTargetGroupAccountId: null,
  existingDecision: "no_reclass",
  existingSource: "manual",
  existingEnabled: true,
  existingBasis: "account_net",
  defaultBasis: "account_net",
  hasAuxiliaryFacts: false,
} satisfies RuleCandidate;

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

test("no-reclassification hides target and calculation basis", () => {
  const editable = reclassRuleFormItems({
    candidate,
    draft: { decision: "no_reclass", targetGroupAccountId: null, basis: "account_net" },
    targetOptions: [],
    onChange: () => undefined,
  });
  assert.deepEqual(editable.map((field) => field.key), ["decision"]);
  assert.deepEqual(reclassRuleReadOnlyItems(candidate, null).map((field) => field.key), ["decision"]);
});

test("reclassification shows target and calculation basis", () => {
  const editable = reclassRuleFormItems({
    candidate: { ...candidate, effectiveDecision: "reclassify", existingDecision: "reclassify" },
    draft: { decision: "reclassify", targetGroupAccountId: 1602, basis: "account_net" },
    targetOptions: [{ value: "1602", label: "1602 累计折旧", searchText: "累计折旧" }],
    onChange: () => undefined,
  });
  assert.deepEqual(editable.map((field) => field.key), ["decision", "targetGroupAccountId", "basis"]);
});
