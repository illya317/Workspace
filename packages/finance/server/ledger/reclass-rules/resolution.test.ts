import assert from "node:assert/strict";
import test from "node:test";

import { resolveLongestPrefixRule } from "./resolution";

const rules = [
  { id: 1, sourceAccountCode: "12", abnormalSide: "both", decision: "reclassify", targetAccountCode: "2201", enabled: true },
  { id: 2, sourceAccountCode: "1221", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "2241", enabled: true },
  { id: 3, sourceAccountCode: "122101", abnormalSide: "credit", decision: "no_reclass", targetAccountCode: null, enabled: false },
];

test("resolves the enabled longest account-code prefix", () => {
  const resolved = resolveLongestPrefixRule("12210101", "credit", rules);
  assert.equal(resolved?.id, 2);
});

test("prefers an exact abnormal side when prefix lengths tie", () => {
  const resolved = resolveLongestPrefixRule("122101", "credit", [
    { id: 1, sourceAccountCode: "1221", abnormalSide: "both", decision: "no_reclass", targetAccountCode: null },
    { id: 2, sourceAccountCode: "1221", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "2241" },
  ]);
  assert.equal(resolved?.id, 2);
});
