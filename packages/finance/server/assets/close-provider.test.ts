import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectAssetDepreciationCloseFacts,
  inspectAssetImpairmentCloseFacts,
  inspectAssetMovementCloseFacts,
  type AssetDepreciationCloseFacts,
  type AssetImpairmentCloseFacts,
  type AssetMovementCloseFacts,
} from "./close-provider";
import { assetImpairmentCalculationBasisFingerprint, assetScopeFingerprint } from "./period-scope";
import { replayAssetAccumulatedAmounts } from "./accumulated-replay";
import type { AssetCloseCard } from "./close-provider-evidence";

const scope = { companyCode: "ZX02", year: 2026, month: 6 };

const acquisitionVoucher = {
  id: 10,
  voucherNo: "记-10",
  status: "posted",
  companyCode: "ZX02",
  periodId: 6,
  totalDebit: 6000,
  totalCredit: 6000,
  items: [{ id: 1, accountCode: "1601", debit: 6000, credit: 0 }, { id: 2, accountCode: "1002", debit: 0, credit: 6000 }],
};

const policy = {
  categoryId: 10,
  policyId: 100,
  assetAccountCode: "1601",
  assetAccountId: 1601,
  accumulatedAccountCode: "1602",
  accumulatedAccountId: 1602,
  expenseAccountCode: "6602",
  impairmentLossAccountCode: "6701",
  impairmentAllowanceAccountCode: "1608",
  disposalGainLossAccountCode: "6711",
};

function card(overrides: Partial<AssetCloseCard> = {}): AssetCloseCard {
  return {
    id: 1,
    companyCode: "ZX02",
    companyId: 2,
    version: 1,
    status: "active",
    categoryId: 10,
    assetCode: "ZX02-FA-2026-00001",
    name: "生产设备",
    assetKind: "fixed_asset",
    acquisitionDate: "2026-06-01",
    depreciationStartDate: "2026-06-01",
    originalCost: 6000,
    residualRate: 0,
    openingAccumulatedAmount: 0,
    initializationMode: "standard",
    openingImpairmentAmount: 0,
    openingNetBookValue: null,
    openingAsOfDate: null,
    cutoverDate: null,
    remainingUsefulLifeMonthsAtCutover: null,
    cutoverResidualValue: null,
    cutoverAllocationStatus: null,
    cutoverReconciliationFingerprint: null,
    sourceFile: "assets.xlsx",
    sourceRow: 4,
    acquisitionEvidence: {
      id: 12,
      companyCode: "ZX02",
      companyId: 2,
      periodId: 6,
      amount: 6000,
      sourceChecksum: null,
      evidenceRef: "INV-FA-001",
      confirmedBy: 7,
      confirmedAt: "2026-06-10T08:00:00.000Z",
      version: 1,
      voucherItem: { ...acquisitionVoucher.items[0]!, voucher: acquisitionVoucher },
      importBatch: null,
    },
    usefulLifeMonths: 60,
    method: "straight_line",
    assetAccountCode: "1601",
    assetAccountId: 1601,
    accumulatedAccountCode: "1602",
    accumulatedAccountId: 1602,
    nonAmortizationReason: null,
    disposal: null,
    category: { code: "FA-MACHINERY", name: "机器设备", depreciable: true },
    ...overrides,
  };
}

function movementFacts(overrides: Partial<AssetMovementCloseFacts> = {}): AssetMovementCloseFacts {
  return {
    period: { id: 6 },
    cards: [card()],
    policies: [policy],
    applicabilityEstablished: true,
    assetGlBalance: 6000,
    entries: [],
    adjustments: [],
    priorEntries: [],
    priorAdjustments: [],
    priorImpairments: [],
    ...overrides,
  };
}

const postedVoucher = {
  id: 30,
  voucherNo: "记-30",
  status: "posted",
  companyCode: "ZX02",
  periodId: 6,
  totalDebit: 100,
  totalCredit: 100,
  items: [{ id: 3, accountCode: "1602", debit: 0, credit: 100 }, { id: 4, accountCode: "6602", debit: 100, credit: 0 }],
};

function disposalVoucher(status = "posted", periodId = 6) {
  return {
    id: 91,
    voucherNo: "记-91",
    status,
    companyCode: "ZX02",
    periodId,
    totalDebit: 6000,
    totalCredit: 6000,
    items: [{ id: 5, accountCode: "6711", debit: 6000, credit: 0 }, { id: 6, accountCode: "1601", debit: 0, credit: 6000 }],
  };
}

function disposalFact(status = "posted", periodId = 6) {
  return {
    id: 90,
    companyCode: "ZX02",
    companyId: 2,
    periodId,
    disposalDate: periodId === 6 ? "2026-06-20" : "2026-03-20",
    disposalType: "scrapped",
    proceedsAmount: 0,
    reason: "达到使用年限",
    evidenceRef: "DISP-001",
    status: "confirmed",
    confirmedBy: 7,
    confirmedAt: "2026-06-20T08:00:00.000Z",
    version: 1,
    voucherId: 91,
    assetVoucherItemId: 6,
    accumulatedVoucherItemId: null,
    impairmentAllowanceVoucherItemId: null,
    proceedsVoucherItemId: null,
    gainLossVoucherItemId: 5,
    voucher: disposalVoucher(status, periodId),
  };
}

function depreciationFacts(overrides: Partial<AssetDepreciationCloseFacts> = {}): AssetDepreciationCloseFacts {
  return {
    ...movementFacts(),
    entries: [{
      id: 20,
      assetId: 1,
      normalAmount: 100,
      status: "posted",
      voucher: postedVoucher,
    }],
    adjustments: [],
    priorEntries: [],
    priorAdjustments: [],
    priorImpairments: [],
    ledgerByAccount: [{ accountCode: "1602", amount: 100 }],
    ...overrides,
  };
}

function impairmentFacts(
  cards: AssetCloseCard[],
  assessment: Omit<NonNullable<AssetImpairmentCloseFacts["assessment"]>, "calculationBasisFingerprint"> | null,
): AssetImpairmentCloseFacts {
  const entries = cards.filter((row) => row.usefulLifeMonths != null).map((row) => ({
    id: 20 + row.id,
    assetId: row.id,
    normalAmount: 100,
    status: "posted",
    voucher: postedVoucher,
  }));
  const assets = cards.map((row) => ({
    assetId: row.id,
    replayFingerprint: replayAssetAccumulatedAmounts({ assetId: row.id, companyCode: "ZX02", openingAccumulatedAmount: row.openingAccumulatedAmount, openingAsOfDate: row.openingAsOfDate, priorEntries: [], priorAdjustments: [], priorImpairments: [] }).basisFingerprint,
  }));
  const calculationBasisFingerprint = assetImpairmentCalculationBasisFingerprint({
    assets,
    entries: entries.map((row) => ({ id: row.id, assetId: row.assetId, amount: row.normalAmount, status: row.status, voucherId: row.voucher.id })),
    adjustments: [],
  });
  return {
    period: { id: 6 }, cards, policies: [policy], entries, adjustments: [], priorEntries: [], priorAdjustments: [], priorImpairments: [],
    assessment: assessment ? { ...assessment, calculationBasisFingerprint } : null,
  };
}

test("asset movements use current-period acquisition facts and explicit annual policies", () => {
  const inspection = inspectAssetMovementCloseFacts(scope, movementFacts());
  assert.equal(inspection.status, "ready");
  assert.deepEqual(inspection.evidenceRefs, ["finance-asset-acquisition-evidence:12"]);
  assert.deepEqual((inspection.payload as { acquisitionIds: number[] }).acquisitionIds, [1]);
  const missingAccountFk = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [card({ assetAccountId: null })] }));
  assert.equal(missingAccountFk.blockers.some((item) => item.code === "asset_policy_snapshot_mismatch"), true);
  const wrongAccumulatedFk = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [card({ accumulatedAccountId: 9999 })] }));
  assert.equal(wrongAccumulatedFk.blockers.some((item) => item.code === "asset_policy_snapshot_mismatch"), true);

  const tamperedAcquisition = (items: typeof acquisitionVoucher.items) => inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [card({
    acquisitionEvidence: {
      ...card().acquisitionEvidence!,
      voucherItem: { ...items[0]!, voucher: { ...acquisitionVoucher, items } },
    },
  })] }));
  const negativeLine = tamperedAcquisition([
    { id: 1, accountCode: "1601", debit: 5900, credit: -100 },
    { id: 2, accountCode: "1002", debit: 100, credit: 6100 },
  ]);
  assert.equal(negativeLine.blockers.some((item) => item.code === "asset_acquisition_voucher_invalid"), true);
  const grossWash = tamperedAcquisition([
    { id: 1, accountCode: "1601", debit: 6100, credit: 100 },
    { id: 2, accountCode: "1002", debit: -100, credit: 5900 },
  ]);
  assert.equal(grossWash.blockers.some((item) => item.code === "asset_acquisition_voucher_invalid"), true);

  const blocked = inspectAssetMovementCloseFacts(scope, movementFacts({
    cards: [card({ status: "disposed" })],
    policies: [],
  }));
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blockers.map((item) => item.code).sort(), ["asset_acquisition_voucher_invalid", "asset_disposal_fact_missing", "asset_policy_missing"]);
});

test("depreciation and amortization require due entries and an exact dedicated voucher", () => {
  const inspection = inspectAssetDepreciationCloseFacts(scope, depreciationFacts());
  assert.equal(inspection.status, "ready");
  assert.deepEqual(inspection.voucherRefs, ["finance-voucher:30"]);

  const missingEntry = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({ entries: [] }));
  assert.equal(missingEntry.status, "blocked");
  assert.equal(missingEntry.blockers.some((item) => item.code === "asset_period_entry_missing"), true);

  const unposted = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({
    entries: [{ id: 20, assetId: 1, normalAmount: 100, status: "calculated", voucher: null }],
  }));
  assert.equal(unposted.status, "blocked");
  assert.equal(unposted.blockers.some((item) => item.code === "asset_period_voucher_missing"), true);

  const staleHeaderVoucher = { ...postedVoucher, items: postedVoucher.items.map((item) => ({ ...item, debit: item.debit ? 100.01 : 0, credit: item.credit ? 100.01 : 0 })) };
  const staleHeader = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({ entries: [{ id: 20, assetId: 1, normalAmount: 100, status: "posted", voucher: staleHeaderVoucher }] }));
  assert.equal(staleHeader.blockers.some((item) => item.code === "asset_period_dedicated_voucher_mismatch"), true);

  const extraVoucher = { ...postedVoucher, items: [...postedVoucher.items, { id: 8, accountCode: "9998", debit: 1, credit: 0 }, { id: 9, accountCode: "9999", debit: 0, credit: 1 }] };
  const extraRows = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({ entries: [{ id: 20, assetId: 1, normalAmount: 100, status: "posted", voucher: extraVoucher }] }));
  assert.equal(extraRows.blockers.some((item) => item.code === "asset_period_dedicated_voucher_mismatch"), true);

  const oneCentVoucher = {
    ...postedVoucher,
    totalDebit: 100.01,
    totalCredit: 100.01,
    items: [{ id: 3, accountCode: "1602", debit: 0, credit: 100.01 }, { id: 4, accountCode: "6602", debit: 100.01, credit: 0 }],
  };
  const oneCent = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({ entries: [{ id: 20, assetId: 1, normalAmount: 100, status: "posted", voucher: oneCentVoucher }] }));
  assert.equal(oneCent.blockers.some((item) => item.code === "asset_period_dedicated_voucher_mismatch"), true);

  const tampered = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({
    entries: [{ id: 20, assetId: 1, normalAmount: 90, status: "posted", voucher: { ...postedVoucher, totalDebit: 90, totalCredit: 90, items: [{ id: 3, accountCode: "1602", debit: 0, credit: 90 }, { id: 4, accountCode: "6602", debit: 90, credit: 0 }] } }],
  }));
  assert.equal(tampered.status, "blocked");
  assert.equal(tampered.blockers.some((item) => item.code === "asset_period_calculation_difference"), true);
});

test("depreciation rejects legacy statuses, multiple vouchers and stale annual policy snapshots", () => {
  const legacy = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({
    entries: [{ id: 20, assetId: 1, normalAmount: 100, status: "calculated", voucher: postedVoucher }],
  }));
  assert.equal(legacy.status, "blocked");
  assert.equal(legacy.blockers.some((item) => item.code === "asset_period_voucher_missing"), true);

  const secondVoucher = { ...postedVoucher, id: 31, voucherNo: "记-31" };
  const split = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({
    adjustments: [{ id: 40, assetId: 1, accountCode: "1602", amount: 10, status: "confirmed", voucher: secondVoucher }],
  }));
  assert.equal(split.status, "blocked");
  assert.equal(split.blockers.some((item) => item.code === "asset_period_dedicated_voucher_required"), true);

  const stalePolicy = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({
    policies: [{ ...policy, policyId: 101, accumulatedAccountCode: "1603" }],
  }));
  assert.equal(stalePolicy.status, "blocked");
  assert.equal(stalePolicy.blockers.some((item) => item.code === "asset_policy_snapshot_mismatch"), true);

  const wrongExpense = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({
    entries: [{ id: 20, assetId: 1, normalAmount: 100, status: "posted", voucher: { ...postedVoucher, items: [{ id: 3, accountCode: "1602", debit: 0, credit: 100 }, { id: 4, accountCode: "6601", debit: 100, credit: 0 }] } }],
  }));
  assert.equal(wrongExpense.status, "blocked");
  assert.equal(wrongExpense.blockers.some((item) => item.code === "asset_period_dedicated_voucher_mismatch"), true);
});

test("historical disposals do not pollute a later close scope", () => {
  const historical = card({
    status: "disposed",
    acquisitionDate: "2026-01-01",
    disposal: { ...disposalFact("posted", 3), id: 80, voucherId: 81, voucher: { ...disposalVoucher("posted", 3), id: 81 } },
  });
  const movement = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [historical], policies: [], assetGlBalance: 0 }));
  assert.equal(movement.status, "ready");
  assert.deepEqual((movement.payload as { assetCount: number }).assetCount, 0);
  const depreciation = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({ cards: [historical], policies: [], assetGlBalance: 0, entries: [], priorEntries: [] }));
  assert.equal(depreciation.status, "ready");
});

test("current-period disposal rechecks the voucher fact", () => {
  const disposed = card({
    status: "disposed",
    disposal: disposalFact("draft"),
  });
  const inspection = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [disposed] }));
  assert.equal(inspection.status, "blocked");
  assert.equal(inspection.blockers.some((item) => item.code === "asset_disposal_voucher_invalid"), true);

  const grossWashVoucher = {
    ...disposalVoucher(),
    totalDebit: 6200,
    totalCredit: 6200,
    items: [{ id: 5, accountCode: "6711", debit: 6100, credit: 100 }, { id: 6, accountCode: "1601", debit: 100, credit: 6100 }],
  };
  const grossWash = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [card({
    status: "disposed",
    disposal: { ...disposalFact(), voucher: grossWashVoucher },
  })] }));
  assert.equal(grossWash.blockers.some((item) => item.code === "asset_disposal_voucher_invalid"), true);
  const zeroProceedsWithResidualRole = inspectAssetMovementCloseFacts(scope, movementFacts({
    cards: [card({ status: "disposed", disposal: { ...disposalFact(), proceedsVoucherItemId: 5 } })],
  }));
  assert.equal(zeroProceedsWithResidualRole.blockers.some((item) => item.code === "asset_disposal_voucher_invalid"), true);
  const aliasedRequiredRole = inspectAssetMovementCloseFacts(scope, movementFacts({
    cards: [card({ status: "disposed", disposal: { ...disposalFact(), gainLossVoucherItemId: 6 } })],
  }));
  assert.equal(aliasedRequiredRole.blockers.some((item) => item.code === "asset_disposal_voucher_invalid"), true);
});

test("indefinite-life intangibles require explicit non-amortization evidence", () => {
  const missingBasisCard = card({
    assetKind: "intangible",
    usefulLifeMonths: null,
    depreciationStartDate: null,
    accumulatedAccountCode: "1702",
    nonAmortizationReason: null,
    category: { code: "IA-LICENSE", name: "牌照及许可", depreciable: true },
  });
  const blocked = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({ cards: [missingBasisCard], entries: [] }));
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blockers.some((item) => item.code === "asset_useful_life_missing"), true);

  const supported = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({
    cards: [{ ...missingBasisCard, nonAmortizationReason: "经复核使用寿命不确定，每期执行减值测试" }],
    policies: [{ ...policy, policyId: 101, accumulatedAccountCode: "1702" }],
    entries: [],
    ledgerByAccount: [{ accountCode: "1702", amount: 0 }],
  }));
  assert.equal(supported.status, "ready");
});

test("pending legacy cutover allocation blocks close without requiring a fabricated period row", () => {
  const july = { companyCode: "ZX02", year: 2026, month: 7 };
  const pending = card({
    acquisitionDate: "2025-01-01",
    depreciationStartDate: "2026-07-01",
    initializationMode: "legacy_cutover",
    openingAccumulatedAmount: 5_000,
    openingImpairmentAmount: 0,
    openingNetBookValue: 1_000,
    openingAsOfDate: "2026-06-30",
    cutoverDate: "2026-06-30",
    remainingUsefulLifeMonthsAtCutover: 10,
    cutoverResidualValue: 0,
    cutoverAllocationStatus: "pending",
    cutoverReconciliationFingerprint: "a".repeat(64),
  });
  const inspection = inspectAssetDepreciationCloseFacts(july, depreciationFacts({ cards: [pending], entries: [], ledgerByAccount: [] }));
  assert.equal(inspection.status, "blocked");
  assert.equal(inspection.blockers.some((item) => item.code === "asset_cutover_allocation_pending"), true);
  assert.equal(inspection.blockers.some((item) => item.code === "asset_period_entry_missing"), false);
});

test("impairment stays pending without a confirmed workpaper and fails closed when its scope changes", () => {
  const cards = [card()];
  const pending = inspectAssetImpairmentCloseFacts(scope, impairmentFacts(cards, null));
  assert.equal(pending.status, "pending");

  const assessment = {
    id: 40,
    conclusion: "no_indication",
    basis: "逐项复核经营状态与可收回金额信号",
    evidenceRef: "WP-FA-2026-06",
    impairmentAmount: 0,
    assetScopeFingerprint: assetScopeFingerprint(cards),
    assetCount: 1,
    status: "confirmed",
    version: 1,
    voucher: null,
    allocations: [],
  };
  const ready = inspectAssetImpairmentCloseFacts(scope, impairmentFacts(cards, assessment));
  assert.equal(ready.status, "ready");
  const missingBasis = inspectAssetImpairmentCloseFacts(scope, impairmentFacts(cards, { ...assessment, basis: "" }));
  assert.equal(missingBasis.status, "blocked");
  assert.equal((missingBasis.payload as { basis: string }).basis, "");
  assert.equal((ready.payload as { status: string; recordedAssetCount: number }).status, "confirmed");
  assert.equal((ready.payload as { recordedAssetCount: number }).recordedAssetCount, 1);
  assert.notEqual(missingBasis.inputFingerprint, ready.inputFingerprint);
  const stale = inspectAssetImpairmentCloseFacts(scope, impairmentFacts([{ ...cards[0], version: 2 }], assessment));
  assert.equal(stale.status, "blocked");
  assert.equal(stale.blockers.some((item) => item.code === "asset_impairment_scope_stale"), true);

  const changedBasisFacts = impairmentFacts(cards, assessment);
  changedBasisFacts.entries[0]!.normalAmount = 90;
  const changedBasis = inspectAssetImpairmentCloseFacts(scope, changedBasisFacts);
  assert.equal(changedBasis.status, "blocked");
  assert.equal(changedBasis.blockers.some((item) => item.code === "asset_impairment_basis_stale"), true);
});

test("recorded impairment requires a dedicated posted voucher whose totals match", () => {
  const cards = [card()];
  const assessment = {
    id: 40,
    conclusion: "impairment_recorded",
    basis: "可收回金额低于账面价值",
    evidenceRef: "WP-FA-2026-06",
    impairmentAmount: 200,
    assetScopeFingerprint: assetScopeFingerprint(cards),
    assetCount: 1,
    status: "confirmed",
    version: 1,
    voucher: {
      id: 50, voucherNo: "记-50", status: "posted", companyCode: "ZX02", periodId: 6, totalDebit: 200, totalCredit: 200,
      items: [{ id: 51, accountCode: "6701", debit: 200, credit: 0 }, { id: 52, accountCode: "1608", debit: 0, credit: 200 }],
    },
    allocations: [{ assetId: 1, amount: 200 }],
  };
  const ready = inspectAssetImpairmentCloseFacts(scope, impairmentFacts(cards, assessment));
  assert.equal(ready.status, "ready");
  const reordered = inspectAssetImpairmentCloseFacts(scope, impairmentFacts(cards, {
    ...assessment,
    voucher: { ...assessment.voucher, items: [...assessment.voucher.items].reverse() },
  }));
  assert.equal(ready.inputFingerprint, reordered.inputFingerprint);
  const changedLine = inspectAssetImpairmentCloseFacts(scope, impairmentFacts(cards, {
    ...assessment,
    voucher: { ...assessment.voucher, items: [{ ...assessment.voucher.items[0]!, accountCode: "6702" }, assessment.voucher.items[1]!] },
  }));
  assert.notEqual(ready.inputFingerprint, changedLine.inputFingerprint);
  const grossWash = inspectAssetImpairmentCloseFacts(scope, impairmentFacts(cards, {
    ...assessment,
    voucher: {
      ...assessment.voucher,
      items: [
        { id: 51, accountCode: "6701", debit: 210, credit: 10 },
        { id: 53, accountCode: "6701", debit: -10, credit: -10 },
        { id: 52, accountCode: "1608", debit: 10, credit: 210 },
        { id: 54, accountCode: "1608", debit: -10, credit: -10 },
      ],
    },
  }));
  assert.equal(grossWash.blockers.some((item) => item.code === "asset_impairment_voucher_mismatch"), true);
  const mismatch = inspectAssetImpairmentCloseFacts(scope, impairmentFacts(cards, { ...assessment, voucher: { ...assessment.voucher, totalDebit: 250, totalCredit: 250 } }));
  assert.equal(mismatch.status, "blocked");
  assert.equal(mismatch.blockers.some((item) => item.code === "asset_impairment_voucher_mismatch"), true);
  assert.notEqual(mismatch.inputFingerprint, ready.inputFingerprint);
});

test("close fingerprints change with refreshed voucher and ledger evidence", () => {
  const disposed = card({ status: "disposed", disposal: disposalFact() });
  const movementPosted = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [disposed] }));
  const movementDraft = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [{ ...disposed, disposal: { ...disposed.disposal!, voucher: { ...disposed.disposal!.voucher, status: "draft" } } }] }));
  assert.notEqual(movementPosted.inputFingerprint, movementDraft.inputFingerprint);

  const acquisition = inspectAssetMovementCloseFacts(scope, movementFacts());
  const changedAcquisitionLine = inspectAssetMovementCloseFacts(scope, movementFacts({
    cards: [card({
      acquisitionEvidence: {
        ...card().acquisitionEvidence!,
        voucherItem: {
          ...card().acquisitionEvidence!.voucherItem!,
          voucher: {
            ...acquisitionVoucher,
            items: [{ ...acquisitionVoucher.items[0]! }, { ...acquisitionVoucher.items[1]!, accountCode: "2202" }],
          },
        },
      },
    })],
  }));
  assert.notEqual(acquisition.inputFingerprint, changedAcquisitionLine.inputFingerprint);
  const changedAcquisitionAudit = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [card({
    acquisitionEvidence: { ...card().acquisitionEvidence!, evidenceRef: "INV-FA-002", version: 2 },
  })] }));
  assert.notEqual(acquisition.inputFingerprint, changedAcquisitionAudit.inputFingerprint);
  const invalidAcquisitionAudit = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [card({
    acquisitionEvidence: { ...card().acquisitionEvidence!, evidenceRef: "" },
  })] }));
  assert.equal(invalidAcquisitionAudit.blockers.some((item) => item.code === "asset_acquisition_evidence_invalid"), true);

  const changedDisposalAudit = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [card({
    status: "disposed",
    disposal: { ...disposalFact(), reason: "事故报废", version: 2 },
  })] }));
  assert.notEqual(movementPosted.inputFingerprint, changedDisposalAudit.inputFingerprint);
  const invalidDisposalAudit = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [card({
    status: "disposed",
    disposal: { ...disposalFact(), evidenceRef: "" },
  })] }));
  assert.equal(invalidDisposalAudit.blockers.some((item) => item.code === "asset_disposal_evidence_invalid"), true);

  const imported = card({
    acquisitionEvidence: {
      ...card().acquisitionEvidence!,
      sourceChecksum: "checksum-a",
      voucherItem: null,
      importBatch: { id: 70, companyCode: "ZX02", companyId: 2, sourceFile: "assets.xlsx", checksum: "checksum-a", status: "confirmed" },
    },
  });
  const importFingerprintA = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [imported] }));
  const importFingerprintB = inspectAssetMovementCloseFacts(scope, movementFacts({
    cards: [{
      ...imported,
      acquisitionEvidence: {
        ...imported.acquisitionEvidence!,
        sourceChecksum: "checksum-b",
        importBatch: { ...imported.acquisitionEvidence!.importBatch!, checksum: "checksum-b" },
      },
    }],
  }));
  assert.notEqual(importFingerprintA.inputFingerprint, importFingerprintB.inputFingerprint);
  const importSourceRowChanged = inspectAssetMovementCloseFacts(scope, movementFacts({ cards: [{ ...imported, sourceRow: 5 }] }));
  assert.notEqual(importFingerprintA.inputFingerprint, importSourceRowChanged.inputFingerprint);

  const depreciation = inspectAssetDepreciationCloseFacts(scope, depreciationFacts());
  const changedLedger = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({ ledgerByAccount: [{ accountCode: "1602", amount: 90 }] }));
  const changedVoucher = inspectAssetDepreciationCloseFacts(scope, depreciationFacts({ entries: [{ id: 20, assetId: 1, normalAmount: 100, status: "posted", voucher: { ...postedVoucher, status: "draft" } }] }));
  assert.notEqual(depreciation.inputFingerprint, changedLedger.inputFingerprint);
  assert.notEqual(depreciation.inputFingerprint, changedVoucher.inputFingerprint);
});
