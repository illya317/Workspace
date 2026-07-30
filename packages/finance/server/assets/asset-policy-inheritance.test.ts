import assert from "node:assert/strict";
import test from "node:test";

import { financeAssetPolicySemanticsMatch, type FinanceAssetPolicySemanticSnapshot } from "./asset-policy-inheritance";

const policy: FinanceAssetPolicySemanticSnapshot = {
  assetAccountCode: "1601",
  accumulatedAccountCode: "1602",
  expenseAccountCode: "6602",
  impairmentLossAccountCode: "6701",
  impairmentAllowanceAccountCode: "1608",
  disposalGainLossAccountCode: "6711",
  defaultUsefulLifeMonths: 60,
  defaultResidualRatePercent: 3,
  defaultMethod: "straight_line",
  usefulLifeMode: "required",
  minimumUsefulLifeMonths: 1,
  maximumUsefulLifeMonths: null,
  reviewRequired: false,
  classificationRule: "用于生产经营的办公设备。",
};

test("only semantic differences create a company asset-policy override", () => {
  assert.equal(financeAssetPolicySemanticsMatch(policy, { ...policy }), true);
  assert.equal(financeAssetPolicySemanticsMatch(policy, { ...policy, defaultUsefulLifeMonths: 48 }), false);
  assert.equal(financeAssetPolicySemanticsMatch(policy, { ...policy, assetAccountCode: "160101" }), false);
});
