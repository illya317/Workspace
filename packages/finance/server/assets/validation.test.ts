import assert from "node:assert/strict";
import test from "node:test";

import type { UpdateFinanceAssetCardInput, UpdateFinanceAssetCategoryPolicyInput } from "../../types/assets";
import { createFinanceAssetCardSchema } from "./schemas";
import {
  buildConfirmFinanceAssetAcquisitionEvidenceCommand,
  buildCreateFinanceAssetCardCommand,
  buildDeleteFinanceAssetCategoryPolicyCommand,
  buildConfirmFinanceAssetImpairmentAssessmentCommand,
  buildConfirmFinanceAssetDisposalCommand,
  buildLinkFinanceAssetPeriodVoucherCommand,
  buildPreviewFinanceAssetCodeCommand,
  buildUpdateFinanceAssetCardCommand,
  buildUpdateFinanceAssetCategoryPolicyCommand,
  residualRatePercentToDecimal,
} from "./validation";
import { assetPeriodVoucherLinkFingerprint } from "./period-scope";

const validInput: UpdateFinanceAssetCardInput = {
  id: 12,
  version: 3,
  companyCode: "ZX02",
  assetCode: "FA-001",
  name: "生产设备",
  assetKind: "fixed_asset",
  categoryId: 2,
  accountYear: 2026,
  originalCost: 10000,
  residualRatePercent: 3,
  usefulLifeMonths: 60,
  depreciationStartDate: "2026-04-01",
};
const createIdempotencyKey = "7d7b637a-e24d-4f0b-a8eb-246bb2436561";

const fixedCategory = {
  id: 2,
  code: "FA-MACHINERY",
  name: "机器设备",
  assetKind: "fixed_asset" as const,
  assetAccount: { id: 1601, code: "1601", name: "固定资产" },
  accumulatedAccount: { id: 1602, code: "1602", name: "累计折旧" },
  expenseAccount: null,
  defaultUsefulLifeMonths: 120,
  defaultResidualRate: 0.03,
  defaultMethod: "straight_line",
  usefulLifeMode: "required" as const,
  minimumUsefulLifeMonths: 1,
  maximumUsefulLifeMonths: null,
  reviewRequired: false,
};

const validationDependencies = {
  findCategory: async ({ id }: { id: number }) => id === 2 ? fixedCategory : null,
};

test("builds a create command with a UUID and saved category policy", async () => {
  const result = await buildCreateFinanceAssetCardCommand({
    ...validInput,
    assetCode: "CLIENT-CODE-IGNORED",
    idempotencyKey: createIdempotencyKey,
  }, 7, validationDependencies);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.idempotencyKey, createIdempotencyKey);
  assert.equal(result.data.category.code, "FA-MACHINERY");
});

test("rejects a create command without a UUID idempotency key", async () => {
  const result = await buildCreateFinanceAssetCardCommand({ ...validInput, idempotencyKey: "asset-create-1" }, 7, validationDependencies);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "idempotencyKey");
});

test("builds an asset-code preview from the saved annual category", async () => {
  const result = await buildPreviewFinanceAssetCodeCommand({ companyCode: "ZX02", year: 2026, categoryId: 2 }, validationDependencies);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.category.code, "FA-MACHINERY");
});

test("builds a versioned asset update command with policy FK references", async () => {
  const result = await buildUpdateFinanceAssetCardCommand(validInput, 7, validationDependencies);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.id, 12);
  assert.equal(result.data.input.version, 3);
  assert.equal(result.data.userId, 7);
  assert.equal(result.data.category.code, "FA-MACHINERY");
  assert.equal(result.data.accounts.asset.code, "1601");
  assert.equal(result.data.accounts.accumulated?.code, "1602");
});

test("rejects asset updates without a valid version", async () => {
  const result = await buildUpdateFinanceAssetCardCommand({ ...validInput, version: 0 }, 7, validationDependencies);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "version");
});

test("accepts an integer residual-rate percentage and converts it for persistence", async () => {
  const result = await buildUpdateFinanceAssetCardCommand(validInput, 7, validationDependencies);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.residualRatePercent, 3);
  assert.equal(residualRatePercentToDecimal(result.data.input.residualRatePercent ?? 0), 0.03);
});

test("rejects fractional residual-rate percentages", async () => {
  const result = await buildUpdateFinanceAssetCardCommand({ ...validInput, residualRatePercent: 0.03 }, 7, validationDependencies);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "residualRatePercent");
});

test("parses the residual-rate request as an integer percentage", () => {
  const result = createFinanceAssetCardSchema.safeParse({ ...validInput, idempotencyKey: createIdempotencyKey, residualRatePercent: "3" });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.residualRatePercent, 3);
  assert.equal("assetCode" in result.data, false);

  const fractional = createFinanceAssetCardSchema.safeParse({ ...validInput, idempotencyKey: createIdempotencyKey, residualRatePercent: "3.5" });
  assert.equal(fractional.success, false);
});

test("ignores client account overrides and consumes the saved policy", async () => {
  const parsed = createFinanceAssetCardSchema.parse({ ...validInput, idempotencyKey: createIdempotencyKey, assetAccountId: 9999, accumulatedAccountId: 9998 });
  assert.equal("assetAccountId" in parsed, false);
  assert.equal("accumulatedAccountId" in parsed, false);
  const result = await buildUpdateFinanceAssetCardCommand({ ...validInput, ...parsed }, 7, validationDependencies);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.accounts.asset.code, "1601");
  assert.equal(result.data.accounts.accumulated?.code, "1602");
});

test("rejects a category without an explicit annual policy", async () => {
  const result = await buildUpdateFinanceAssetCardCommand(validInput, 7, { findCategory: async () => null });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "categoryId");
  assert.match(result.issue.message, /核算政策/);
});

test("requires a basis when an intangible asset has no definite life", async () => {
  const intangible = {
    ...fixedCategory,
    code: "IA-LICENSE",
    name: "牌照及许可",
    assetKind: "intangible" as const,
    assetAccount: { id: 1701, code: "1701", name: "无形资产" },
    accumulatedAccount: { id: 1702, code: "1702", name: "累计摊销" },
    usefulLifeMode: "required_or_indefinite_basis" as const,
  };
  const result = await buildUpdateFinanceAssetCardCommand({
    ...validInput,
    assetKind: "intangible",
    usefulLifeMonths: null,
    depreciationStartDate: null,
  }, 7, { findCategory: async () => intangible });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "nonAmortizationReason");
});

test("confirms acquisition evidence only from the unique policy-account debit item of a dedicated voucher", async () => {
  const input = {
    companyCode: "ZX02", year: 2026, month: 6, assetId: 1, assetVersion: 3,
    voucherNo: "记-40", evidenceRef: "FA-ACQ-2026-06-1",
  };
  const context = {
    period: { id: 6, isClosed: false },
    company: { id: 2, code: "ZX02" },
    asset: {
      id: 1, companyCode: "ZX02", companyId: 2, version: 3, status: "active", acquisitionDate: "2026-06-01",
      categoryId: 2, originalCost: 1000, assetAccountCode: "1601", assetAccountId: 1601,
    },
    existingEvidenceId: null,
    voucher: {
      id: 40, voucherNo: "记-40", periodId: 6, companyCode: "ZX02", status: "posted", totalDebit: 1000, totalCredit: 1000,
      items: [{ id: 401, accountCode: "1601", debit: 1000, credit: 0 }, { id: 402, accountCode: "1002", debit: 0, credit: 1000 }],
    },
    policy: { assetAccountCode: "1601", assetAccountId: 1601 },
    occupiedVoucherItemIds: [],
  };
  const ready = await buildConfirmFinanceAssetAcquisitionEvidenceCommand(input, 7, { findAcquisitionContext: async () => context });
  assert.equal(ready.ok, true);
  if (ready.ok) {
    assert.equal(ready.data.companyId, 2);
    assert.equal(ready.data.voucherItemId, 401);
    assert.equal(ready.data.amount, 1000);
  }
  const reused = await buildConfirmFinanceAssetAcquisitionEvidenceCommand(input, 7, {
    findAcquisitionContext: async () => ({ ...context, occupiedVoucherItemIds: [401] }),
  });
  assert.equal(reused.ok, false);
  const wrongLine = await buildConfirmFinanceAssetAcquisitionEvidenceCommand(input, 7, {
    findAcquisitionContext: async () => ({
      ...context,
      voucher: { ...context.voucher, items: [{ id: 401, accountCode: "1601", debit: 900, credit: 0 }, { id: 402, accountCode: "1002", debit: 100, credit: 1000 }] },
    }),
  });
  assert.equal(wrongLine.ok, false);
  const oneCentShort = await buildConfirmFinanceAssetAcquisitionEvidenceCommand(input, 7, {
    findAcquisitionContext: async () => ({
      ...context,
      voucher: {
        ...context.voucher,
        totalDebit: 999.99,
        totalCredit: 999.99,
        items: [{ id: 401, accountCode: "1601", debit: 999.99, credit: 0 }, { id: 402, accountCode: "1002", debit: 0, credit: 999.99 }],
      },
    }),
  });
  assert.equal(oneCentShort.ok, false);
  const wrongAccountFk = await buildConfirmFinanceAssetAcquisitionEvidenceCommand(input, 7, {
    findAcquisitionContext: async () => ({ ...context, asset: { ...context.asset, assetAccountId: 9999 } }),
  });
  assert.equal(wrongAccountFk.ok, false);
  const missingAccountFk = await buildConfirmFinanceAssetAcquisitionEvidenceCommand(input, 7, {
    findAcquisitionContext: async () => ({ ...context, asset: { ...context.asset, assetAccountId: null } }),
  });
  assert.equal(missingAccountFk.ok, false);
});

test("confirms an explicit zero-impairment assessment with a frozen asset scope", async () => {
  const result = await buildConfirmFinanceAssetImpairmentAssessmentCommand({
    companyCode: "ZX02",
    year: 2026,
    month: 6,
    version: 0,
    conclusion: "no_indication",
    basis: "逐项检查减值迹象",
    evidenceRef: "WP-FA-2026-06",
    impairmentAmount: 0,
    voucherNo: null,
    allocations: [],
  }, 7, {
    findImpairmentContext: async () => ({
      period: { id: 6, isClosed: false },
      cards: [{
        id: 1, version: 2, status: "active", categoryId: 2, acquisitionDate: "2026-01-01",
        depreciationStartDate: "2026-02-01", originalCost: 10000, usefulLifeMonths: 60,
        residualRate: 0.03,
        method: "straight_line", assetAccountCode: "1601", assetAccountId: 1601,
        accumulatedAccountCode: "1602", accumulatedAccountId: 1602,
        openingAsOfDate: null,
      }],
      policies: [{
        categoryId: 2, assetAccountCode: "1601", assetAccountId: 1601,
        accumulatedAccountCode: "1602", accumulatedAccountId: 1602,
        impairmentLossAccountCode: "6701", impairmentAllowanceAccountCode: "1608",
      }],
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.assetCount, 1);
  assert.match(result.data.assetScopeFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.data.voucher, null);
});

test("requires a matching posted dedicated voucher when impairment is recorded", async () => {
  const base = {
    companyCode: "ZX02",
    year: 2026,
    month: 6,
    version: 0,
    conclusion: "impairment_recorded" as const,
    basis: "可收回金额低于账面价值",
    evidenceRef: "WP-FA-2026-06",
    impairmentAmount: 200,
    voucherNo: "记-50",
    allocations: [{ assetId: 1, amount: 200 }],
  };
  const dependencies = {
    findImpairmentContext: async () => ({ period: { id: 6, isClosed: false }, cards: [{
      id: 1, version: 1, status: "active", categoryId: 2, acquisitionDate: "2026-01-01",
      depreciationStartDate: "2026-02-01", originalCost: 10000, usefulLifeMonths: 60,
      residualRate: 0.03, method: "straight_line", assetAccountCode: "1601", assetAccountId: 1601,
      accumulatedAccountCode: "1602", accumulatedAccountId: 1602, openingAsOfDate: null,
    }], policies: [{
      categoryId: 2, assetAccountCode: "1601", assetAccountId: 1601,
      accumulatedAccountCode: "1602", accumulatedAccountId: 1602,
      impairmentLossAccountCode: "6701", impairmentAllowanceAccountCode: "1608",
    }] }),
    findImpairmentVoucher: async () => ({
      id: 50, voucherNo: "记-50", periodId: 6, companyCode: "ZX02", status: "posted", totalDebit: 250, totalCredit: 250,
      items: [{ id: 501, accountCode: "6701", debit: 250, credit: 0 }, { id: 502, accountCode: "1608", debit: 0, credit: 250 }],
    }),
  };
  const mismatch = await buildConfirmFinanceAssetImpairmentAssessmentCommand(base, 7, dependencies);
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.issue.field, "impairmentAmount");

  const ready = await buildConfirmFinanceAssetImpairmentAssessmentCommand(base, 7, {
    ...dependencies,
    findImpairmentVoucher: async () => ({
      id: 50, voucherNo: "记-50", periodId: 6, companyCode: "ZX02", status: "posted", totalDebit: 200, totalCredit: 200,
      items: [{ id: 501, accountCode: "6701", debit: 200, credit: 0 }, { id: 502, accountCode: "1608", debit: 0, credit: 200 }],
    }),
  });
  assert.equal(ready.ok, true);
  const wrongAccountFk = await buildConfirmFinanceAssetImpairmentAssessmentCommand(base, 7, {
    ...dependencies,
    findImpairmentContext: async () => {
      const context = await dependencies.findImpairmentContext();
      return { ...context, cards: context.cards.map((card) => ({ ...card, assetAccountId: 9999 })) };
    },
  });
  assert.equal(wrongAccountFk.ok, false);
  const missingAccumulatedFk = await buildConfirmFinanceAssetImpairmentAssessmentCommand(base, 7, {
    ...dependencies,
    findImpairmentContext: async () => {
      const context = await dependencies.findImpairmentContext();
      return { ...context, cards: context.cards.map((card) => ({ ...card, accumulatedAccountId: null })) };
    },
  });
  assert.equal(missingAccumulatedFk.ok, false);
  const grossWash = await buildConfirmFinanceAssetImpairmentAssessmentCommand(base, 7, {
    ...dependencies,
    findImpairmentVoucher: async () => ({
      id: 50, voucherNo: "记-50", periodId: 6, companyCode: "ZX02", status: "posted", totalDebit: 200, totalCredit: 200,
      items: [
        { id: 501, accountCode: "6701", debit: 210, credit: 10 },
        { id: 503, accountCode: "6701", debit: -10, credit: -10 },
        { id: 502, accountCode: "1608", debit: 10, credit: 210 },
        { id: 504, accountCode: "1608", debit: -10, credit: -10 },
      ],
    }),
  });
  assert.equal(grossWash.ok, false);
  const oneCentOver = await buildConfirmFinanceAssetImpairmentAssessmentCommand(base, 7, {
    ...dependencies,
    findImpairmentVoucher: async () => ({
      id: 50, voucherNo: "记-50", periodId: 6, companyCode: "ZX02", status: "posted", totalDebit: 200.01, totalCredit: 200.01,
      items: [{ id: 501, accountCode: "6701", debit: 200.01, credit: 0 }, { id: 502, accountCode: "1608", debit: 0, credit: 200.01 }],
    }),
  });
  assert.equal(oneCentOver.ok, false);
});

test("asset disposal is versioned, period-scoped and requires a posted voucher", async () => {
  const input = {
    companyCode: "ZX02", year: 2026, month: 6, assetId: 1, assetVersion: 3,
    disposalDate: "2026-06-20", disposalType: "sold" as const, proceedsAmount: 800,
    reason: "设备更新出售", evidenceRef: "SALE-2026-06-01", voucherNo: "记-60",
  };
  const context = {
    period: { id: 6, isClosed: false },
    asset: {
      id: 1, companyCode: "ZX02", version: 3, status: "active", acquisitionDate: "2024-01-01", categoryId: 2,
      assetCode: "ZX02-FA-2024-00001", originalCost: 1000, assetAccountCode: "1601", assetAccountId: 1601,
      accumulatedAccountCode: "1602", accumulatedAccountId: 1602,
      openingAccumulatedAmount: 0, openingAsOfDate: null,
    },
    existingDisposalId: null,
    voucher: {
      id: 60, voucherNo: "记-60", periodId: 6, companyCode: "ZX02", status: "posted", totalDebit: 1000, totalCredit: 1000,
      items: [
        { id: 601, accountCode: "1002", debit: 800, credit: 0 },
        { id: 602, accountCode: "6711", debit: 200, credit: 0 },
        { id: 603, accountCode: "1601", debit: 0, credit: 1000 },
      ],
    },
    policy: {
      assetAccountCode: "1601", assetAccountId: 1601, accumulatedAccountCode: "1602", accumulatedAccountId: 1602,
      impairmentAllowanceAccountCode: "1608", disposalGainLossAccountCode: "6711",
    },
    priorEntries: [],
    priorAdjustments: [],
    priorImpairments: [],
    currentEntries: [],
    currentAdjustments: [],
    occupiedVoucherItemIds: [],
  };
  assert.equal((await buildConfirmFinanceAssetDisposalCommand(input, 7, { findDisposalContext: async () => context })).ok, true);
  const wrongAssetFk = await buildConfirmFinanceAssetDisposalCommand(input, 7, {
    findDisposalContext: async () => ({ ...context, asset: { ...context.asset, assetAccountId: 9999 } }),
  });
  assert.equal(wrongAssetFk.ok, false);
  const missingAccumulatedFk = await buildConfirmFinanceAssetDisposalCommand(input, 7, {
    findDisposalContext: async () => ({ ...context, asset: { ...context.asset, accumulatedAccountId: null } }),
  });
  assert.equal(missingAccumulatedFk.ok, false);
  const grossWash = await buildConfirmFinanceAssetDisposalCommand(input, 7, {
    findDisposalContext: async () => ({
      ...context,
      voucher: {
        ...context.voucher,
        totalDebit: 1300,
        totalCredit: 1300,
        items: [
          { id: 601, accountCode: "1002", debit: 900, credit: 100 },
          { id: 602, accountCode: "6711", debit: 300, credit: 100 },
          { id: 603, accountCode: "1601", debit: 100, credit: 1100 },
        ],
      },
    }),
  });
  assert.equal(grossWash.ok, false);
  const oneCentShort = await buildConfirmFinanceAssetDisposalCommand(input, 7, {
    findDisposalContext: async () => ({
      ...context,
      voucher: {
        ...context.voucher,
        totalCredit: 999.99,
        items: context.voucher.items.map((item) => item.id === 603 ? { ...item, credit: 999.99 } : item),
      },
    }),
  });
  assert.equal(oneCentShort.ok, false);
  const stale = await buildConfirmFinanceAssetDisposalCommand(input, 7, { findDisposalContext: async () => ({ ...context, asset: { ...context.asset, version: 4 } }) });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.issue.field, "assetVersion");
  const closed = await buildConfirmFinanceAssetDisposalCommand(input, 7, { findDisposalContext: async () => ({ ...context, period: { id: 6, isClosed: true } }) });
  assert.equal(closed.ok, false);
  const unpostedCurrent = await buildConfirmFinanceAssetDisposalCommand(input, 7, {
    findDisposalContext: async () => ({
      ...context,
      currentEntries: [{ assetId: 1, normalAmount: 20, status: "calculated", voucher: null }],
    }),
  });
  assert.equal(unpostedCurrent.ok, false);
  if (!unpostedCurrent.ok) assert.equal(unpostedCurrent.issue.field, "assetId");
});

test("period voucher linking uses a CAS fingerprint and a dedicated posted voucher", async () => {
  const entries = [{ id: 1, assetId: 1, voucherId: null, status: "calculated", accountCode: "1602", expenseAccountCode: "6602", amount: 100, policyIssue: null }];
  const adjustments = [{ id: 2, assetId: 1, voucherId: null, status: "confirmed", accountCode: "1602", expenseAccountCode: "6602", amount: 20, policyIssue: null }];
  const expectedLinkFingerprint = assetPeriodVoucherLinkFingerprint({ entries, adjustments });
  const input = { companyCode: "ZX02", year: 2026, month: 6, voucherNo: "记-70", expectedLinkFingerprint };
  const context = {
    period: { id: 6, isClosed: false },
    voucher: { id: 70, voucherNo: "记-70", periodId: 6, companyCode: "ZX02", status: "posted", totalDebit: 120, totalCredit: 120, items: [{ accountCode: "1602", debit: 0, credit: 120 }, { accountCode: "6602", debit: 120, credit: 0 }] },
    entries,
    adjustments,
  };
  assert.equal((await buildLinkFinanceAssetPeriodVoucherCommand(input, { findPeriodVoucherLinkContext: async () => context })).ok, true);
  const wrongExpense = await buildLinkFinanceAssetPeriodVoucherCommand(input, { findPeriodVoucherLinkContext: async () => ({ ...context, voucher: { ...context.voucher, items: [{ accountCode: "1602", debit: 0, credit: 120 }, { accountCode: "6601", debit: 120, credit: 0 }] } }) });
  assert.equal(wrongExpense.ok, false);
  const staleHeader = await buildLinkFinanceAssetPeriodVoucherCommand(input, { findPeriodVoucherLinkContext: async () => ({ ...context, voucher: { ...context.voucher, items: [{ accountCode: "1602", debit: 0, credit: 120.01 }, { accountCode: "6602", debit: 120.01, credit: 0 }] } }) });
  assert.equal(staleHeader.ok, false);
  const extraRows = await buildLinkFinanceAssetPeriodVoucherCommand(input, { findPeriodVoucherLinkContext: async () => ({ ...context, voucher: { ...context.voucher, items: [...context.voucher.items, { accountCode: "9999", debit: 1, credit: 0 }, { accountCode: "9998", debit: 0, credit: 1 }] } }) });
  assert.equal(extraRows.ok, false);
  const oneCent = await buildLinkFinanceAssetPeriodVoucherCommand(input, { findPeriodVoucherLinkContext: async () => ({ ...context, voucher: { ...context.voucher, totalDebit: 120.01, totalCredit: 120.01, items: [{ accountCode: "1602", debit: 0, credit: 120.01 }, { accountCode: "6602", debit: 120.01, credit: 0 }] } }) });
  assert.equal(oneCent.ok, false);
  const concurrent = await buildLinkFinanceAssetPeriodVoucherCommand(input, { findPeriodVoucherLinkContext: async () => ({ ...context, entries: entries.map((row) => ({ ...row, voucherId: 71 })) }) });
  assert.equal(concurrent.ok, false);
  if (!concurrent.ok) assert.equal(concurrent.issue.field, "expectedLinkFingerprint");
  const amountChanged = await buildLinkFinanceAssetPeriodVoucherCommand(input, { findPeriodVoucherLinkContext: async () => ({ ...context, entries: entries.map((row) => ({ ...row, amount: 110 })) }) });
  assert.equal(amountChanged.ok, false);
  if (!amountChanged.ok) assert.equal(amountChanged.issue.field, "expectedLinkFingerprint");
  const closed = await buildLinkFinanceAssetPeriodVoucherCommand(input, { findPeriodVoucherLinkContext: async () => ({ ...context, period: { id: 6, isClosed: true } }) });
  assert.equal(closed.ok, false);
});

const policyInput: UpdateFinanceAssetCategoryPolicyInput = {
  companyCode: "ZX02",
  year: 2026,
  categoryId: 2,
  version: 0,
  assetAccountId: 1601,
  accumulatedAccountId: 1602,
  expenseAccountId: 6602,
  defaultUsefulLifeMonths: 120,
  defaultResidualRatePercent: 3,
  defaultMethod: "straight_line",
  usefulLifeMode: "required",
  minimumUsefulLifeMonths: 1,
  maximumUsefulLifeMonths: null,
  reviewRequired: false,
  classificationRule: "用于生产经营且预计使用超过一个会计年度的机器设备。",
};

const policyDependencies = {
  findPolicyCategory: async () => ({ id: 2, assetKind: "fixed_asset" as const, depreciable: true }),
  findPolicyAccounts: async () => [
    { id: 1601, code: "1601", name: "固定资产", category: "asset" },
    { id: 1602, code: "1602", name: "累计折旧", category: "asset" },
    { id: 6602, code: "6602", name: "管理费用", category: "expense" },
  ],
};

test("builds an editable annual category policy with real account FKs", async () => {
  const result = await buildUpdateFinanceAssetCategoryPolicyCommand(policyInput, 7, policyDependencies);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.accounts.asset.id, 1601);
  assert.equal(result.data.accounts.accumulated?.id, 1602);
  assert.equal(result.data.accounts.expense?.id, 6602);
});

test("builds a versioned command for removing only a company policy override", () => {
  const result = buildDeleteFinanceAssetCategoryPolicyCommand({
    companyCode: " ZX02 ",
    year: 2026,
    categoryId: 2,
    version: 3,
  }, 7);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.input.companyCode, "ZX02");
  assert.equal(result.data.input.version, 3);
});

test("keeps prepaid classifications within the twelve-month boundary", async () => {
  const result = await buildUpdateFinanceAssetCategoryPolicyCommand({
    ...policyInput,
    categoryId: 10,
    accumulatedAccountId: null,
    maximumUsefulLifeMonths: 18,
  }, 7, {
    ...policyDependencies,
    findPolicyCategory: async () => ({ id: 10, assetKind: "prepaid" as const, depreciable: true }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "maximumUsefulLifeMonths");
});
