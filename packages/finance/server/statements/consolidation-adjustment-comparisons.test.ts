import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";
import type { ConsolidationBatchRow } from "./consolidation-dto";
import {
  buildConsolidationAdjustmentComparisons,
  buildTranslationOciComparisons,
  selectFirstOpeningCapitalRows,
} from "./consolidation-adjustment-comparisons";

const entities = [
  { companyId: 1, code: "ZX01", name: "母公司", role: "parent" as const },
  { companyId: 2, code: "ZX02", name: "子公司甲", role: "subsidiary" as const },
];

function group(status: ConsolidationVoucherMatchGroup["status"]): ConsolidationVoucherMatchGroup {
  return {
    category: "intercompanyBalance",
    generationKey: "intercompanyBalance:1:2",
    status,
    leftCompanyId: 1,
    rightCompanyId: 2,
    leftNetAmount: 100,
    rightNetAmount: status === "difference" ? -90 : -100,
    matchedAmount: status === "matched" ? 100 : 0,
    differenceAmount: status === "difference" ? 10 : 0,
    matchingRule: "凭证明细匹配",
    matchingVersion: "test-v1",
    differenceResolution: status === "matched" ? null : "需核对差额",
    comparisonCurrencyCode: "CNY",
    requiredActions: status === "matched" ? [] : ["reconcileDifference"],
    ownershipShareRatio: null,
    leftFacts: [{
      itemId: 1, voucherId: 11, voucherNo: "记-001", voucherDate: "2026-07-01",
      companyId: 1, counterpartyCompanyId: 2, accountCode: "1122", accountName: "应收账款",
      description: "内部往来", lineCode: "accountsReceivableNet", signedAmount: 100,
      currencyCode: "CNY", sourceFingerprint: "left",
    }],
    rightFacts: [{
      itemId: 2, voucherId: 22, voucherNo: "记-002", voucherDate: "2026-07-02",
      companyId: 2, counterpartyCompanyId: 1, accountCode: "2202", accountName: "应付账款",
      description: "内部往来", lineCode: "accountsPayable", signedAmount: status === "difference" ? -90 : -100,
      currencyCode: "CNY", sourceFingerprint: "right",
    }],
  };
}

test("comparison keeps each source voucher line instead of replacing it with balances", () => {
  const [row] = buildConsolidationAdjustmentComparisons(entities, [group("matched")]);
  assert.equal(row?.status, "equal");
  assert.equal(row?.leftSources[0]?.voucherNo, "记-001");
  assert.equal(row?.rightSources[0]?.voucherNo, "记-002");
  assert.match(row?.entrySummary ?? "", /借：2202 应付账款/);
  assert.equal(row?.title, "母公司 → 子公司甲 往来款");
  assert.equal(row?.leftCompany, "母公司");
  assert.equal(row?.rightCompany, "子公司甲");
  assert.equal(row?.leftCurrencyCode, "CNY");
  assert.equal(row?.rightCurrencyCode, "CNY");
  assert.equal(row?.differenceCurrencyCode, "CNY");
  assert.equal(row?.treatmentKind, "eliminate");
});

test("comparison exposes voucher-level difference", () => {
  const [row] = buildConsolidationAdjustmentComparisons(entities, [group("difference")]);
  assert.equal(row?.status, "difference");
  assert.equal(row?.difference, 10);
  assert.equal(row?.rightSources[0]?.amount, 90);
  assert.equal(row?.reviewStatus, "exception");
  assert.equal(row?.treatmentKind, "reconcile");
});

test("does not present a numeric difference across incomparable currencies", () => {
  const crossCurrency = group("unresolved");
  crossCurrency.rightFacts[0] = { ...crossCurrency.rightFacts[0]!, currencyCode: "CAD" };
  crossCurrency.comparisonCurrencyCode = null;
  crossCurrency.requiredActions = ["translateToCny", "allocateNonControllingInterest"];
  crossCurrency.ownershipShareRatio = 0.75;
  const [row] = buildConsolidationAdjustmentComparisons(entities, [crossCurrency]);
  assert.equal(row?.leftCurrencyCode, "CNY");
  assert.equal(row?.rightCurrencyCode, "CAD");
  assert.equal(row?.differenceCurrencyCode, null);
  assert.equal(row?.treatmentKind, "translateAndAllocateNonControllingInterest");
  assert.equal(row?.ownershipShareRatio, 0.75);
});

test("comparison calculates from all history but only expands the selected year", () => {
  const historical = group("matched");
  historical.leftFacts.unshift({ ...historical.leftFacts[0]!, itemId: 9, voucherDate: "2019-07-01" });
  const [row] = buildConsolidationAdjustmentComparisons(entities, [historical], [], 2026);
  assert.equal(row?.leftAmount, 100);
  assert.equal(row?.leftSources.length, 1);
  assert.equal(row?.leftHistoricalSourceCount, 1);
  assert.equal(row?.displayPeriodLabel, "2026年");
});

test("comparison exposes persisted review state without losing voucher evidence", () => {
  const [approved] = buildConsolidationAdjustmentComparisons(entities, [group("matched")], [{
    generationKey: "intercompanyBalance:1:2",
    status: "accepted",
    entryId: 18,
    entry: { id: 18, status: "approved" },
  }]);
  assert.equal(approved?.entryId, 18);
  assert.equal(approved?.reviewStatus, "approved");
  assert.equal(approved?.leftSources[0]?.voucherNo, "记-001");

  const [returned] = buildConsolidationAdjustmentComparisons(entities, [group("matched")], [{
    generationKey: "intercompanyBalance:1:2",
    status: "rejected",
    entryId: 18,
    entry: { id: 18, status: "draft" },
  }]);
  assert.equal(returned?.reviewStatus, "returned");
});

test("opening capital selection collapses annual account versions by company and account code", () => {
  const rows = selectFirstOpeningCapitalRows([
    { id: 1, companyCode: "CA01", openingDebit: 0, openingCredit: 0, account: { id: 11, code: "3001" } },
    { id: 2, companyCode: "CA01", openingDebit: 0, openingCredit: 100_000, account: { id: 11, code: "3001" } },
    { id: 3, companyCode: "CA01", openingDebit: 0, openingCredit: 100_000, account: { id: 12, code: "3001" } },
    { id: 4, companyCode: "CA01", openingDebit: 0, openingCredit: 20_000, account: { id: 13, code: "3002" } },
  ]);

  assert.deepEqual(rows.map((row) => row.id), [2, 4]);
});

test("shows OCI as pending before lock and reads the per-entity amount from the locked output", () => {
  const baseBatch = {
    year: 2026,
    month: 6,
    entities: [{
      id: 52,
      companyId: 2,
      companyName: "子公司甲",
      isConsolidated: true,
      functionalCurrency: "CAD",
      shareRatio: null,
    }],
    outputSnapshot: null,
  } as unknown as ConsolidationBatchRow;
  const [pending] = buildTranslationOciComparisons(baseBatch, entities);
  assert.equal(pending?.category, "translation");
  assert.equal(pending?.status, "pendingCalculation");
  assert.equal(pending?.differenceCurrencyCode, null);
  assert.equal(pending?.targetLineCode, "otherComprehensiveIncome");

  const lockedBatch = {
    ...baseBatch,
    outputSnapshot: {
      reportPayload: {
        statements: [{
          reportType: "balanceSheet",
          lines: [{
            lineCode: "otherComprehensiveIncome",
            sourceAmount: 321.45,
            entityAmounts: [{ entitySnapshotId: 52, amount: 321.45 }],
          }],
        }],
      },
    },
  } as unknown as ConsolidationBatchRow;
  const [calculated] = buildTranslationOciComparisons(lockedBatch, entities);
  assert.equal(calculated?.reviewStatus, "calculated");
  assert.equal(calculated?.rightAmount, 321.45);
  assert.equal(calculated?.rightCurrencyCode, "CNY");
  assert.match(calculated?.entrySummary ?? "", /CNY 321\.45/);
});
