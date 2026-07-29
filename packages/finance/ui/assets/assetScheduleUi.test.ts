import assert from "node:assert/strict";
import test from "node:test";

import type { FormSurfaceFieldSpec } from "@workspace/core/ui";
import type { FinanceAssetCardDto } from "../../types/assets";
import { assetCardColumns, assetFormSections, editAssetDraft, emptyAssetDraft } from "./assetScheduleUi";

const card = {
  id: 12,
  version: 3,
  companyCode: "ZX02",
  assetCode: "FA-001",
  name: "一二三四五六七八九十十一",
  assetKind: "fixed_asset",
  categoryId: 4,
  categoryCode: "FA-ELECTRONIC",
  categoryName: "电子设备",
  assetAccountId: 1601,
  assetAccountCode: "1601",
  assetAccountName: "固定资产",
  accumulatedAccountId: 1602,
  accumulatedAccountCode: "1602",
  accumulatedAccountName: "累计折旧",
  acquisitionDate: "2026-03-01",
  depreciationStartDate: "2026-04-01",
  originalCost: 10000,
  residualRate: 0.03,
  usefulLifeMonths: 60,
  method: "straight_line",
  openingAccumulatedAmount: 0,
  openingAsOfDate: "2026-03-31",
  status: "active",
  nonAmortizationReason: null,
  note: null,
  sourceSheet: null,
  sourceRow: null,
  grossCost: 10000,
  waivedCost: 0,
  capitalizedCost: 10000,
} satisfies FinanceAssetCardDto;

test("truncates long asset names while retaining the full hover title", () => {
  const nameColumn = assetCardColumns.find((column) => column.key === "name");
  assert.ok(nameColumn);
  assert.deepEqual(nameColumn.cell(card), { kind: "text", value: "一二三四五六七八九十...", title: card.name });
});

test("builds an edit draft without losing versioned policy fields", () => {
  const draft = editAssetDraft(card, 2026);
  assert.equal(draft.version, 3);
  assert.equal(draft.accountYear, 2026);
  assert.equal(draft.categoryId, 4);
  assert.equal(draft.residualRatePercent, 3);
  assert.equal(draft.openingAsOfDate, "2026-03-31");
  assert.equal(draft.depreciationStartDate, "2026-04-01");
});

test("presents the residual rate as an integer percentage", () => {
  const sections = assetFormSections(editAssetDraft(card, 2026), () => undefined);
  const field = findField(sections, "residualRatePercent");
  assert.equal(field.label, "残值率（%）");
  assert.equal(field.value, 3);
  assert.equal(field.step, 1);
  assert.deepEqual(field.spec.validation, { min: 0, max: 99 });
});

test("shows the runtime company scope as a read-only card identity", () => {
  const sections = assetFormSections(editAssetDraft(card, 2026), () => undefined);
  const company = findField(sections, "companyCode");
  assert.equal(company.label, "公司");
  assert.equal(company.value, "ZX02");
  assert.equal(company.readOnly, true);
});

test("marks asset detail fields as read only when update is unavailable", () => {
  const sections = assetFormSections(editAssetDraft(card, 2026), () => undefined, true);
  assert.equal(findField(sections, "assetCode").readOnly, true);
  assert.equal(findField(sections, "assetKind").disabled, true);
  assert.equal(findField(sections, "originalCost").readOnly, true);
});

test("creates a UUID request key and keeps the generated asset code read only", () => {
  const draft = emptyAssetDraft("ZX02", 2026);
  assert.match(draft.idempotencyKey ?? "", /^[0-9a-f-]{36}$/i);
  const sections = assetFormSections(draft, () => undefined, false, { assetCodePlaceholder: "选择资产分类后生成" });
  const assetCode = findField(sections, "assetCode");
  assert.equal(assetCode.readOnly, true);
  assert.equal(assetCode.value, "选择资产分类后生成");
});

test("keeps category selectable while derived accounts are read only", () => {
  const sections = assetFormSections(editAssetDraft(card, 2026), () => undefined, false, {
    categoryName: card.categoryName,
    assetAccountName: card.assetAccountName,
    accumulatedAccountName: card.accumulatedAccountName,
  });
  const category = findField(sections, "categoryId");
  const assetAccount = findField(sections, "assetAccountId");
  const accumulatedAccount = findField(sections, "accumulatedAccountId");
  assert.deepEqual(category.spec.options, {
    source: "remote",
    fkKey: "finance.assets.category",
    endpoint: "/api/modules/finance/assets/reference-options",
    returnField: "id",
    queryParams: { assetKind: "fixed_asset", companyCode: "ZX02", year: 2026 },
  });
  assert.equal(category.displayValue, "电子设备");
  assert.deepEqual(assetAccount.spec, { valueType: "string", control: "text" });
  assert.equal(assetAccount.value, "固定资产");
  assert.equal(assetAccount.readOnly, true);
  assert.deepEqual(accumulatedAccount.spec, { valueType: "string", control: "text" });
  assert.equal(accumulatedAccount.value, "累计折旧");
  assert.equal(accumulatedAccount.readOnly, true);
});

function findField(
  sections: ReturnType<typeof assetFormSections>,
  key: string,
): FormSurfaceFieldSpec {
  const item = sections.flatMap((section) => section.items).find((candidate) => candidate.key === key);
  assert.ok(item && "spec" in item, `field not found: ${key}`);
  return item;
}
