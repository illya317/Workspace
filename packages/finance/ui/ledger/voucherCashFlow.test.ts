import assert from "node:assert/strict";
import test from "node:test";

import type { VoucherCashFlowAllocation } from "@workspace/finance/types";

import { cashFlowAllocationsForItem, formatVoucherCashFlowDetail } from "./voucherCashFlow";

const allocation: VoucherCashFlowAllocation = {
  id: 1,
  ownerVoucherItemId: 10,
  counterpartItemId: 11,
  direction: "outflow",
  amount: 7.2,
  cashFlowItem: { sourceCode: "07", sourceName: "支付的与其他经营活动有关的现金" },
};

test("shows an allocation only on its owner voucher item", () => {
  assert.deepEqual(cashFlowAllocationsForItem(10, [allocation]), [allocation]);
  assert.deepEqual(cashFlowAllocationsForItem(11, [allocation]), []);
});

test("falls back to the counterpart when an allocation has no owner item", () => {
  const withoutOwner = { ...allocation, ownerVoucherItemId: null };
  assert.deepEqual(cashFlowAllocationsForItem(11, [withoutOwner]), [withoutOwner]);
});

test("formats the cash-flow item, direction, and amount for display", () => {
  assert.equal(
    formatVoucherCashFlowDetail([allocation]),
    "支付的与其他经营活动有关的现金 · 流出 7.20",
  );
  assert.equal(formatVoucherCashFlowDetail([]), "-");
});
