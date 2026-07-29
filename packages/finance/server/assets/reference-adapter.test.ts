import assert from "node:assert/strict";
import { mock, test } from "node:test";

type PeriodEntryAsset = {
  categoryId: number;
  assetAccountCode: string;
  assetAccountId: number | null;
  accumulatedAccountCode: string | null;
  accumulatedAccountId: number | null;
};

const validPeriodEntryAsset: PeriodEntryAsset = {
  categoryId: 20,
  assetAccountCode: "1601",
  assetAccountId: 1601,
  accumulatedAccountCode: "1602",
  accumulatedAccountId: 1602,
};
let periodEntryAsset: PeriodEntryAsset = validPeriodEntryAsset;

const prisma = {
  financePeriod: { findUnique: async () => ({ id: 6, isClosed: false }) },
  financeVoucher: { findUnique: async () => ({
    id: 70,
    voucherNo: "记-70",
    periodId: 6,
    companyCode: "ZX02",
    status: "posted",
    totalDebit: 100,
    totalCredit: 100,
    items: [{ debit: 100, credit: 0, account: { code: "6602" } }, { debit: 0, credit: 100, account: { code: "1602" } }],
  }) },
  financeAssetPeriodEntry: { findMany: async () => [{
    id: 1,
    assetId: 10,
    voucherId: null,
    status: "calculated",
    normalAmount: 100,
    asset: { ...periodEntryAsset },
  }] },
  financeAssetAdjustment: { findMany: async () => [{
    id: 2,
    assetId: null,
    voucherId: null,
    status: "confirmed",
    accountCode: "1602",
    amount: 5,
    asset: null,
  }] },
  financeAssetCard: { findMany: async () => [{
    id: 10,
    version: 3,
    status: "active",
    categoryId: 20,
    acquisitionDate: "2026-01-10",
    depreciationStartDate: "2026-02-01",
    originalCost: 1200,
    residualRate: 0.03,
    usefulLifeMonths: 60,
    method: "straight_line",
    assetAccountCode: "1601",
    assetAccountId: 1601,
    accumulatedAccountCode: "1602",
    accumulatedAccountId: 1602,
    openingAsOfDate: null,
    disposal: null,
  }] },
};

mock.module("@workspace/platform/server/prisma", { exports: { prisma } });
mock.module("./account-policy-resolver", { exports: {
  resolveFinanceAssetCategoryPolicy: async () => ({
    assetAccount: { id: 1601, code: "1601" },
    accumulatedAccount: { id: 1602, code: "1602" },
    expenseAccount: { id: 6602, code: "6602" },
    impairmentLossAccount: { id: 6701, code: "6701" },
    impairmentAllowanceAccount: { id: 1608, code: "1608" },
  }),
} });

const { findAssetImpairmentContext, findAssetPeriodVoucherLinkContext } = await import("./reference-adapter");
const { assetScopeFingerprint } = await import("./period-scope");

test("default period-voucher adapter returns policy-complete entry and adjustment contracts", async () => {
  const context = await findAssetPeriodVoucherLinkContext({
    companyCode: "ZX02",
    year: 2026,
    month: 6,
    voucherNo: "记-70",
    expectedLinkFingerprint: "fingerprint",
  });

  assert.deepEqual(context.entries, [{
    id: 1,
    assetId: 10,
    voucherId: null,
    status: "calculated",
    accountCode: "1602",
    expenseAccountCode: "6602",
    amount: 100,
    policyIssue: null,
  }]);
  assert.deepEqual(context.adjustments, [{
    id: 2,
    assetId: null,
    voucherId: null,
    status: "confirmed",
    accountCode: "1602",
    expenseAccountCode: null,
    amount: 5,
    policyIssue: "已确认折旧摊销调整未分配到具体资产或缺少当前年度费用科目政策",
  }]);

  periodEntryAsset = { ...validPeriodEntryAsset, assetAccountId: null };
  const missingAssetFk = await findAssetPeriodVoucherLinkContext({
    companyCode: "ZX02", year: 2026, month: 6, voucherNo: "记-70", expectedLinkFingerprint: "fingerprint",
  });
  assert.match(missingAssetFk.entries[0]?.policyIssue ?? "", /科目快照/);
  periodEntryAsset = { ...validPeriodEntryAsset, accumulatedAccountId: 9999 };
  const wrongAccumulatedFk = await findAssetPeriodVoucherLinkContext({
    companyCode: "ZX02", year: 2026, month: 6, voucherNo: "记-70", expectedLinkFingerprint: "fingerprint",
  });
  assert.match(wrongAccumulatedFk.entries[0]?.policyIssue ?? "", /科目快照/);
  periodEntryAsset = validPeriodEntryAsset;
});

test("impairment confirmation and close-load persistence shapes retain identical account FK scope", async () => {
  const context = await findAssetImpairmentContext({ companyCode: "ZX02", year: 2026, month: 6 });
  assert.ok(context);
  const closeLoadCards = [{
    id: 10,
    version: 3,
    status: "active",
    categoryId: 20,
    acquisitionDate: "2026-01-10",
    depreciationStartDate: "2026-02-01",
    originalCost: 1200,
    residualRate: 0.03,
    usefulLifeMonths: 60,
    method: "straight_line",
    assetAccountCode: "1601",
    assetAccountId: 1601,
    accumulatedAccountCode: "1602",
    accumulatedAccountId: 1602,
    openingAsOfDate: null,
  }];
  assert.equal(context.cards[0]?.assetAccountId, 1601);
  assert.equal(context.cards[0]?.accumulatedAccountId, 1602);
  assert.equal(assetScopeFingerprint(context.cards), assetScopeFingerprint(closeLoadCards));
});
