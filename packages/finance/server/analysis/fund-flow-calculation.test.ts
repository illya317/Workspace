import assert from "node:assert/strict";
import test from "node:test";

import { buildCashFlowBreakdown, classifyCashVoucherChannels } from "./fund-flow-calculation";

test("recomputes cash-flow net from directional details and flags a lost sign", () => {
  const result = buildCashFlowBreakdown([
    { lineCode: "salesReceipt", label: "销售回款", section: "operating", direction: "in", isSubtotal: false, isGrandTotal: false },
    { lineCode: "staffPayment", label: "职工支出", section: "operating", direction: "out", isSubtotal: false, isGrandTotal: false },
    { lineCode: "operatingNet", label: "经营净额", section: "operating", direction: "net", isSubtotal: true, isGrandTotal: false },
  ], [
    { lineCode: "salesReceipt", manualAmount: 0, importedAmount: 40 },
    { lineCode: "staffPayment", manualAmount: 0, importedAmount: 100 },
    { lineCode: "operatingNet", manualAmount: 0, importedAmount: 60 },
  ]);

  assert.equal(result.inflow, 40);
  assert.equal(result.outflow, 100);
  assert.equal(result.netCashChange, -60);
  assert.deepEqual(result.qualityIssues, ["经营活动系统分类净额符号与流入减流出不一致"]);
});

test("classifies borrowing, customer advances and shareholder cash receipts from counterpart accounts", () => {
  const channels = classifyCashVoucherChannels([
    voucher("2203", "合同负债", 100),
    voucher("2501", "长期借款", 200),
    voucher("4001", "实收资本", 300),
    {
      items: [
        { code: "100201", name: "银行甲", debit: 50, credit: 0 },
        { code: "100202", name: "银行乙", debit: 0, credit: 50 },
      ],
    },
  ]);

  assert.deepEqual(channels.map((row) => [row.key, row.amount]), [
    ["equityFunding", 300],
    ["borrowing", 200],
    ["customerAdvance", 100],
  ]);
});

function voucher(counterpartCode: string, counterpartName: string, amount: number) {
  return {
    items: [
      { code: "100201", name: "银行存款", debit: amount, credit: 0 },
      { code: counterpartCode, name: counterpartName, debit: 0, credit: amount },
    ],
  };
}
