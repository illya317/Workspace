import assert from "node:assert/strict";
import test from "node:test";

import type { ParsedAssetWorkbook } from "./current-period-workbook-types";
import { applyFinanceAssetLegacySyntheticAssets, type FinanceAssetLegacySyntheticAsset } from "./legacy-synthetic-assets";

const definition: FinanceAssetLegacySyntheticAsset = {
  sourceKey: "9&10-3:29",
  sourceSheet: "9&10-3",
  sourceRange: "9&10-3!A18:E29",
  name: "长期待摊费用-承租装修成本池",
  category: "LT-LEASEHOLD",
  assetKind: "long_term_deferred",
  originalCost: 100,
  closingNet: 10,
  fullUsefulLife: 60,
  approvalReason: "总账已证实并批准承接",
};

test("injects one controlled renovation card while preserving included and excluded evidence", () => {
  const result = applyFinanceAssetLegacySyntheticAssets(parsed(), [definition]);
  const asset = result.assets[0]!;
  assert.equal(result.assets.length, 1);
  assert.equal(asset.sourceFile, "synthetic-assets.xlsx");
  assert.equal(asset.sourceRange, "9&10-3!A18:E29");
  assert.equal(asset.originalCost, 100);
  assert.equal(asset.openingAccumulatedAmount, 90);
  assert.equal(asset.closingNetAmount, 10);
  assert.equal(asset.usefulLifeMonths, 60);
  assert.match(asset.note ?? "", /includedEvidenceKeys=9&10-3:18/);
  assert.match(asset.note ?? "", /excludedEvidenceKeys=9&10-3:20/);
  assert.match(asset.note ?? "", /excludedEvidenceAmount=10.00/);
  assert.equal(result.controls.at(-1)?.status, "pass");
  assert.match(result.warnings[0]?.message ?? "", /已由本期受控配置生成/);
});

test("fails closed on cost mismatch or sourceKey collision", () => {
  assert.throws(() => applyFinanceAssetLegacySyntheticAssets(parsed(), [{ ...definition, originalCost: 99 }]), /必须等于 included/);
  const withCollision = parsed();
  withCollision.assets.push({
    sourceFile: "synthetic-assets.xlsx", sourceSheet: "9&10-3", sourceRow: 29, sourceRange: "9&10-3!A29:E29", sourceKey: definition.sourceKey,
    assetCode: "OLD", name: "冲突", assetKind: "long_term_deferred", categoryCandidate: "LT-LEASEHOLD", originalCost: 1,
    openingAccumulatedAmount: 0, openingAsOfDate: "2026-05-31", closingNetAmount: 1,
  });
  assert.throws(() => applyFinanceAssetLegacySyntheticAssets(withCollision, [definition]), /sourceKey.*冲突/);
});

function parsed(): ParsedAssetWorkbook {
  return {
    scope: { sourceFile: "synthetic-assets.xlsx", companyCode: "TESTCO", year: 2026, month: 6 },
    workbookCompanyLabels: ["Synthetic Assets Co."],
    periodEvidence: [],
    assets: [],
    renovationCostEvidence: [
      { sourceFile: "synthetic-assets.xlsx", sourceSheet: "9&10-3", sourceRow: 18, sourceRange: "9&10-3!A18:E18", sourceKey: "9&10-3:18", amount: 100, treatment: "included" },
      { sourceFile: "synthetic-assets.xlsx", sourceSheet: "9&10-3", sourceRow: 20, sourceRange: "9&10-3!A20:E20", sourceKey: "9&10-3:20", amount: 10, treatment: "excluded_from_source_total" },
    ],
    controls: [],
    blockers: [],
    warnings: [{ code: "RENOVATION_CARD_EVIDENCE_MISSING", message: "缺少资产卡", sourceSheet: "9&10-3", sourceRange: "9&10-3!A18:E29" }],
    readyForImport: true,
  };
}
