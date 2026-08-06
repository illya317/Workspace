import assert from "node:assert/strict";
import test from "node:test";

import { consolidationEntryHasIncompleteMatchingEvidence } from "./consolidation-entry-readiness";

function entry(input: { generationKey: string | null; matchSide: string | null; sourceFingerprint?: string | null }) {
  return {
    entryType: "investmentEquity",
    generationKey: input.generationKey,
    matchDifference: 0,
    differenceResolution: "已按历史证据分类",
    lines: [{
      lineCode: "nonControllingInterests",
      matchSide: input.matchSide,
      sourceKind: "workpaper",
      sourceId: "policy:test:nci:opening",
      sourceFingerprint: input.sourceFingerprint === undefined ? "stable" : input.sourceFingerprint,
      sourceAmount: 25,
      sourceCurrency: "CNY",
      counterpartyCompanyId: 1,
    }],
  };
}

test("classified policy workpaper lines do not require an artificial matching side", () => {
  assert.equal(consolidationEntryHasIncompleteMatchingEvidence(entry({
    generationKey: "policy:remittance-fx:opening",
    matchSide: null,
  })), false);
});

test("manual lines and policy lines missing real evidence remain incomplete", () => {
  assert.equal(consolidationEntryHasIncompleteMatchingEvidence(entry({
    generationKey: null,
    matchSide: null,
  })), true);
  assert.equal(consolidationEntryHasIncompleteMatchingEvidence(entry({
    generationKey: "policy:remittance-fx:opening",
    matchSide: null,
    sourceFingerprint: null,
  })), true);
});
