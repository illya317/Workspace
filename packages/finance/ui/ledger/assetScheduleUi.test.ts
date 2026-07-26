import assert from "node:assert/strict";
import test from "node:test";

import type { FinanceAssetCardDto } from "../../types/assets";
import { assetCardColumns, editAssetDraft } from "./assetScheduleUi";

const card = {
  id: 12,
  version: 3,
  companyCode: "ZX02",
  assetCode: "FA-001",
  name: "一二三四五六七八九十十一",
  assetKind: "fixed_asset",
  category: null,
  assetAccountCode: "1601",
  accumulatedAccountCode: "1602",
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
  const draft = editAssetDraft(card);
  assert.equal(draft.version, 3);
  assert.equal(draft.openingAsOfDate, "2026-03-31");
  assert.equal(draft.depreciationStartDate, "2026-04-01");
});
