import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceCloseScope, FinanceCloseStatusCounts } from "../../types/close";
import {
  financeCloseBusinessMessage,
  financeCloseBusinessReferences,
  financeCloseOpenIdempotencyKey,
  financeCloseOwnerLabel,
  financeCloseRefreshIdempotencyKey,
  financeCloseStatusCounts,
  financeCloseStatusLabel,
  financeCloseWorkpaperReviewIdempotencyKey,
} from "./closeTabModel";

const scope: FinanceCloseScope = { companyCode: "C02", year: 2026, month: 6 };

test("open and refresh idempotency keys are stable for the same intent", () => {
  assert.equal(financeCloseOpenIdempotencyKey(scope, 7), financeCloseOpenIdempotencyKey({ ...scope }, 7));
  assert.notEqual(financeCloseOpenIdempotencyKey(scope, 7), financeCloseOpenIdempotencyKey({ ...scope, month: 7 }, 7));
  assert.equal(financeCloseRefreshIdempotencyKey(31, 4, 7), financeCloseRefreshIdempotencyKey(31, 4, 7));
  assert.notEqual(financeCloseRefreshIdempotencyKey(31, 4, 7), financeCloseRefreshIdempotencyKey(31, 5, 7));
});

test("workpaper review idempotency keys bind the global workpaper identity", () => {
  assert.equal(
    financeCloseWorkpaperReviewIdempotencyKey(41, 3, 7),
    financeCloseWorkpaperReviewIdempotencyKey(41, 3, 7),
  );
  assert.notEqual(
    financeCloseWorkpaperReviewIdempotencyKey(41, 3, 7),
    financeCloseWorkpaperReviewIdempotencyKey(42, 3, 7),
  );
});

test("only ready tasks count as completed", () => {
  const counts: FinanceCloseStatusCounts = { pending: 4, ready: 10, blocked: 8, unavailable: 5 };
  assert.deepEqual(financeCloseStatusCounts(counts), {
    total: 27,
    completed: 10,
    pending: 4,
    blocked: 8,
    unavailable: 5,
  });
  assert.equal(financeCloseStatusLabel("unavailable"), "不可用");
});

test("business labels hide implementation keys and database identifiers", () => {
  assert.equal(financeCloseOwnerLabel("finance.treasury.reconciliation"), "资金管理");
  assert.equal(financeCloseOwnerLabel("inventory.operations"), "存货管理");
  assert.equal(
    financeCloseBusinessMessage("finance.assets.manual 关账检查暂不可用"),
    "资产会计 关账检查暂不可用",
  );
  const references = financeCloseBusinessReferences([
    "finance-bank-reconciliation:42",
    "finance-bank-reconciliation:43",
    "finance-voucher-item:99",
    "2026-06-记-0008",
    "资产底稿.xlsx",
    "#51",
    "finance-tax-filing:internal-uuid",
    "finance-tax-filing:another-id",
    "finance-tax-payment:71",
    "finance-tax-payment:72",
    "finance-tax-reconciliation-snapshot:81",
  ]);
  assert.deepEqual(references, [
    "银行对账底稿（2份）",
    "总账凭证分录",
    "2026-06-记-0008",
    "资产底稿.xlsx",
    "系统业务记录",
    "纳税申报记录（2份）",
    "税款缴纳记录（2笔）",
    "税务勾稽快照",
  ]);
  assert.equal(references.some((value) => /(?:finance|inventory)\.|(?:^|:)\d+$|#\d+/u.test(value)), false);
});
