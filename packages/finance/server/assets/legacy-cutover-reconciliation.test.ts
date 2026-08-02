import assert from "node:assert/strict";
import test from "node:test";

import {
  validateFinanceAssetLedgerCutoverResult,
  type FinanceAssetLedgerCutoverResult,
} from "./legacy-cutover-reconciliation";

const balance = { id: 41, accountId: 1601, periodId: 6, companyCode: "ZX02" };
const accumulatedBalance = { id: 42, accountId: 1602, periodId: 6, companyCode: "ZX02" };
const authoritativeContext = {
  period: { id: 6, companyCode: "ZX02", companyId: 2, year: 2026, month: 6, endDate: "2026-06-30", isClosed: true },
  balances: [
    { ...balance, companyId: 2, accountCode: "1601", balanceDirection: "debit" as const, closingDebit: 1_000, closingCredit: 0 },
    { ...accumulatedBalance, companyId: 2, accountCode: "1602", balanceDirection: "credit" as const, closingDebit: 0, closingCredit: 900 },
  ],
};
const result: FinanceAssetLedgerCutoverResult = {
  cutoverDate: "2026-06-30",
  period: { id: 6, companyCode: "ZX02", companyId: 2, year: 2026, month: 6, endDate: "2026-06-30", isClosed: true },
  fingerprint: "a".repeat(64),
  status: "rounding_allocated",
  ledgerNetBookValue: 100,
  importedNetBookValue: 100,
  unallocatedNetBookValue: 0,
  warnings: ["来源台账与总账存在 0.09 尾差，已归入最大净值卡片"],
  accountControls: [
    { key: "asset", role: "asset", sourceKeys: ["9&10-1:4"], accountId: 1601, accountCode: "1601", balanceId: 41, selection: "full_account", allocationMode: "standard", approvalReason: null, approvedSelectedAmount: null, expectedDirection: "debit", workspaceClosingDebit: 1_000, workspaceClosingCredit: 0, sourceClosingDebit: 1_000, sourceClosingCredit: 0, sourceSelectedAmount: 1_000, allocatedAmount: 1_000, difference: 0 },
    { key: "accumulated", role: "accumulated", sourceKeys: ["9&10-1:4"], accountId: 1602, accountCode: "1602", balanceId: 42, selection: "full_account", allocationMode: "standard", approvalReason: null, approvedSelectedAmount: null, expectedDirection: "credit", workspaceClosingDebit: 0, workspaceClosingCredit: 900, sourceClosingDebit: 0, sourceClosingCredit: 900, sourceSelectedAmount: 900, allocatedAmount: 900, difference: 0 },
  ],
  allocations: [{
    sourceKey: "9&10-1:4",
    openingAccumulatedAmount: 900,
    openingImpairmentAmount: 0,
    openingNetBookValue: 100,
    cutoverResidualValue: 40,
    remainingUsefulLifeMonthsAtCutover: 2,
    allocationStatus: "allocated",
    roundingAdjustment: -0.09,
    ledgerControlAdjustment: 0,
    ledgerControlAllocationMode: null,
    ledgerControlApprovalReason: null,
    assetBalance: balance,
    accumulatedBalance,
    impairmentBalance: null,
  }],
};

const input = {
  companyCode: "ZX02", companyId: 2, year: 2026, month: 6, cutoverDate: "2026-06-30", periodId: 6,
  authoritativeContext,
  cards: [{
    sourceKey: "9&10-1:4",
    originalCost: 1_000,
    workbookNetBookValue: 100.09,
    workbookAccumulatedAmount: 899.91,
    fullUsefulLifeMonths: 10,
    remainingUsefulLifeMonthsAtCutover: 2,
    cutoverResidualValue: 40,
    assetAccountId: 1601,
    accumulatedAccountId: 1602,
    impairmentAllowanceAccountId: null,
  }],
};

test("accepts a closed-ledger cutover and preserves the exact balance FKs", () => {
  const allocations = validateFinanceAssetLedgerCutoverResult({ ...input, result });
  assert.equal(allocations.get("9&10-1:4")?.assetBalance.id, 41);
  assert.equal(allocations.get("9&10-1:4")?.roundingAdjustment, -0.09);
});

test("rejects a self-reported balance snapshot that differs from the authoritative transaction read", () => {
  const changed = { ...result, accountControls: result.accountControls.map((row) => row.role === "asset" ? { ...row, workspaceClosingDebit: 999 } : row) };
  assert.throws(() => validateFinanceAssetLedgerCutoverResult({ ...input, result: changed }), /权威总账余额/);
});

test("rejects a card whose accumulated account is omitted from per-account controls", () => {
  const changed = { ...result, accountControls: result.accountControls.filter((row) => row.role !== "accumulated") };
  assert.throws(() => validateFinanceAssetLedgerCutoverResult({ ...input, result: changed }), /缺少逐科目控制/);
});

test("rejects an unbalanced GL reconciliation result", () => {
  assert.throws(
    () => validateFinanceAssetLedgerCutoverResult({ ...input, result: { ...result, ledgerNetBookValue: 101 } }),
    /总账、已归卡和未分配金额不闭合/,
  );
});

test("rejects a balance FK from a different account or period", () => {
  const changed = { ...result, allocations: [{ ...result.allocations[0]!, assetBalance: { ...balance, periodId: 5 } }] };
  assert.throws(() => validateFinanceAssetLedgerCutoverResult({ ...input, result: changed }), /总账余额 FK/);
});

test("rejects a forged balance id even when the allocation claims the expected account fields", () => {
  const changed = {
    ...result,
    allocations: [{ ...result.allocations[0]!, assetBalance: { ...balance, id: 42 } }],
  };
  assert.throws(() => validateFinanceAssetLedgerCutoverResult({ ...input, result: changed }), /总账余额 FK/);
});

test("rejects arbitrary transfers between accumulated amount and net book value", () => {
  const changed: FinanceAssetLedgerCutoverResult = {
    ...result,
    status: "matched",
    importedNetBookValue: 99,
    ledgerNetBookValue: 99,
    allocations: [{
      ...result.allocations[0]!,
      openingAccumulatedAmount: 901,
      openingNetBookValue: 99,
      roundingAdjustment: 0,
    }],
    accountControls: result.accountControls.map((row) => row.role === "accumulated"
      ? { ...row, allocatedAmount: 901, sourceSelectedAmount: 901, sourceClosingCredit: 901, workspaceClosingCredit: 901 }
      : row),
  };
  const changedContext = {
    ...authoritativeContext,
    balances: authoritativeContext.balances.map((row) => row.id === 42 ? { ...row, closingCredit: 901 } : row),
  };
  assert.throws(
    () => validateFinanceAssetLedgerCutoverResult({ ...input, authoritativeContext: changedContext, result: changed }),
    /重大差异被擅自分配/,
  );
});

test("rejects a provider that tampers with remaining life or residual value", () => {
  assert.throws(() => validateFinanceAssetLedgerCutoverResult({
    ...input,
    result: { ...result, allocations: [{ ...result.allocations[0]!, remainingUsefulLifeMonthsAtCutover: 3 }] },
  }), /剩余寿命/);
  assert.throws(() => validateFinanceAssetLedgerCutoverResult({
    ...input,
    result: { ...result, allocations: [{ ...result.allocations[0]!, cutoverResidualValue: 41 }] },
  }), /剩余残值/);
});

test("allows a material unallocated pool only as pending allocation", () => {
  const pending: FinanceAssetLedgerCutoverResult = {
    ...result,
    status: "pending_allocation",
    ledgerNetBookValue: 133,
    unallocatedNetBookValue: 33,
    accountControls: result.accountControls.map((row) => row.role === "asset" ? {
      ...row,
      workspaceClosingDebit: 1_033,
      sourceClosingDebit: 1_033,
      sourceSelectedAmount: 1_033,
      difference: 33,
    } : row),
    allocations: [{ ...result.allocations[0]!, allocationStatus: "pending" }],
  };
  const pendingContext = {
    ...authoritativeContext,
    balances: authoritativeContext.balances.map((row) => row.id === 41 ? { ...row, closingDebit: 1_033 } : row),
  };
  const allocations = validateFinanceAssetLedgerCutoverResult({ ...input, authoritativeContext: pendingContext, result: pending });
  assert.equal(allocations.get("9&10-1:4")?.allocationStatus, "pending");
});

test("accepts an explicitly approved material single-card GL replacement without treating it as rounding", () => {
  const pureContext = {
    ...authoritativeContext,
    balances: [{ ...authoritativeContext.balances[0]!, closingDebit: 100 }],
  };
  const pureInput = {
    ...input,
    authoritativeContext: pureContext,
    cards: [{ ...input.cards[0]!, workbookNetBookValue: 200, workbookAccumulatedAmount: 800, accumulatedAccountId: null }],
  };
  const adjusted: FinanceAssetLedgerCutoverResult = {
    ...result,
    status: "ledger_control_adjusted",
    accountControls: [{
      ...result.accountControls[0]!,
      selection: "gl_replacement",
      allocationMode: "replace_single_card_from_gl",
      approvalReason: "用户批准以已关账总账承接",
      approvedSelectedAmount: null,
      workspaceClosingDebit: 100,
      sourceClosingDebit: 100,
      sourceSelectedAmount: 100,
      allocatedAmount: 100,
    }],
    allocations: [{
      ...result.allocations[0]!,
      openingNetBookValue: 100,
      openingAccumulatedAmount: 900,
      roundingAdjustment: 0,
      ledgerControlAdjustment: -100,
      ledgerControlAllocationMode: "replace_single_card_from_gl",
      ledgerControlApprovalReason: "用户批准以已关账总账承接",
      accumulatedBalance: null,
    }],
  };
  const allocations = validateFinanceAssetLedgerCutoverResult({ ...pureInput, result: adjusted });
  assert.equal(allocations.get("9&10-1:4")?.ledgerControlAdjustment, -100);
  assert.equal(allocations.get("9&10-1:4")?.roundingAdjustment, 0);
});
