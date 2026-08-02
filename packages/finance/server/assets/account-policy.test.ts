import assert from "node:assert/strict";
import test from "node:test";

import { financeAssetCategoryPolicyDefaults } from "./account-policy";

function category(input: Partial<Parameters<typeof financeAssetCategoryPolicyDefaults>[0]> = {}) {
  return {
    code: "FA-MACHINERY",
    name: "机器设备",
    assetKind: "fixed_asset" as const,
    defaultUsefulLifeMonths: 120,
    defaultResidualRate: 0.03,
    defaultMethod: "straight_line",
    ...input,
  };
}

test("provides the standard account pair and editable estimates for fixed assets", () => {
  assert.deepEqual(financeAssetCategoryPolicyDefaults(category()), {
    assetAccountCode: "1601",
    accumulatedAccountCode: "1602",
    defaultUsefulLifeMonths: 120,
    defaultResidualRate: 0.03,
    defaultMethod: "straight_line",
    usefulLifeMode: "required",
    minimumUsefulLifeMonths: 1,
    maximumUsefulLifeMonths: null,
    reviewRequired: false,
    classificationRule: "用于生产经营、预计使用超过一个会计年度且成本能够可靠计量的机器及生产设备。",
  });
});

test("distinguishes prepaid accounts by the approved classification instead of using one blanket fallback", () => {
  const network = financeAssetCategoryPolicyDefaults(category({
    code: "PA-NETWORK",
    name: "网络及服务费",
    assetKind: "prepaid",
    defaultUsefulLifeMonths: null,
    defaultResidualRate: 0,
  }));
  const parking = financeAssetCategoryPolicyDefaults(category({
    code: "PA-PARKING",
    name: "车位",
    assetKind: "prepaid",
    defaultUsefulLifeMonths: null,
    defaultResidualRate: 0,
  }));
  assert.equal(network.assetAccountCode, "1463");
  assert.equal(parking.assetAccountCode, "1123");
  assert.equal(network.accumulatedAccountCode, null);
  assert.equal(network.maximumUsefulLifeMonths, 12);
});

test("marks rent and leasehold improvements for classification review", () => {
  const rent = financeAssetCategoryPolicyDefaults(category({ code: "PA-RENT", name: "房租", assetKind: "prepaid" }));
  const leasehold = financeAssetCategoryPolicyDefaults(category({ code: "LT-LEASEHOLD", name: "租入资产改良", assetKind: "long_term_deferred" }));
  assert.equal(rent.reviewRequired, true);
  assert.match(rent.classificationRule, /租赁识别/);
  assert.equal(leasehold.minimumUsefulLifeMonths, 13);
  assert.match(leasehold.classificationRule, /使用权资产/);
});
