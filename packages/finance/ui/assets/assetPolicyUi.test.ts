import assert from "node:assert/strict";
import test from "node:test";

import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import type { FinanceAssetCategoryDto } from "../../types/assets";
import { assetPolicyFormSections, editAssetPolicyDraft } from "./assetPolicyUi";

const category = {
  id: 2,
  code: "FA-MACHINERY",
  name: "机器设备",
  assetKind: "fixed_asset",
  defaultUsefulLifeMonths: 120,
  defaultResidualRatePercent: 3,
  defaultMethod: "straight_line",
  depreciable: true,
  policyId: null,
  policyVersion: 0,
  companyPolicyVersion: 0,
  policySource: "system_default",
  policyMappingIssue: null,
  assetAccountId: 1601,
  assetAccountCode: "1601",
  assetAccountName: "固定资产",
  accumulatedAccountId: 1602,
  accumulatedAccountCode: "1602",
  accumulatedAccountName: "累计折旧",
  expenseAccountId: null,
  expenseAccountCode: null,
  expenseAccountName: null,
  impairmentLossAccountId: null,
  impairmentLossAccountCode: null,
  impairmentLossAccountName: null,
  impairmentAllowanceAccountId: null,
  impairmentAllowanceAccountCode: null,
  impairmentAllowanceAccountName: null,
  disposalGainLossAccountId: null,
  disposalGainLossAccountCode: null,
  disposalGainLossAccountName: null,
  usefulLifeMode: "required",
  minimumUsefulLifeMonths: 1,
  maximumUsefulLifeMonths: null,
  reviewRequired: false,
  classificationRule: "用于生产经营且预计使用超过一个会计年度的机器设备。",
} satisfies FinanceAssetCategoryDto;

test("builds an editable company-year policy draft from the system recommendation", () => {
  const draft = editAssetPolicyDraft(category, "02", 2026);
  assert.equal(draft.companyCode, "02");
  assert.equal(draft.year, 2026);
  assert.equal(draft.version, 0);
  assert.equal(draft.assetAccountId, 1601);
  assert.equal(draft.defaultResidualRatePercent, 3);
});

test("group saves update the group row while inherited company edits create or update only the company row", () => {
  const group = { ...category, policySource: "group" as const, policyVersion: 4, companyPolicyVersion: 0 };
  const inherited = { ...group, companyPolicyVersion: 2 };
  assert.equal(editAssetPolicyDraft(group, "01", 2026, "group").version, 4);
  assert.equal(editAssetPolicyDraft(inherited, "02", 2026, "company").version, 2);
});

test("uses real account references and compact policy fields", () => {
  const draft = editAssetPolicyDraft(category, "02", 2026);
  const sections = assetPolicyFormSections({ category, draft, readOnly: false, onChange: () => undefined });
  const assetAccount = findField(sections, "assetAccountId");
  const accumulated = findField(sections, "accumulatedAccountId");
  const classification = findField(sections, "classificationRule");
  const residual = findField(sections, "defaultResidualRatePercent");
  assert.equal(sections.find((section) => section.key === "accounts")?.layout?.columns, 2);
  assert.equal(assetAccount.spec.valueType, "reference");
  assert.equal(assetAccount.displayValue, "1601 · 固定资产");
  assert.equal(accumulated.required, true);
  assert.equal(classification.rows, undefined);
  assert.equal(classification.span, undefined);
  assert.equal(residual.value, 3);
  assert.equal(residual.step, 1);
});

function findField(
  sections: ReturnType<typeof assetPolicyFormSections>,
  key: string,
): FormSurfaceFieldSpec {
  const item = sections.flatMap((section) => section.items).find((candidate) => candidate.key === key);
  assert.ok(item && "spec" in item, `field not found: ${key}`);
  return item;
}
