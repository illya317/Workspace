import assert from "node:assert/strict";
import test from "node:test";

import { buildReclassificationWorkbench } from "./reclassify";

test("classifies reverse balances without treating every negative as a reclassification", () => {
  const entries = buildReclassificationWorkbench([
    balance(1, "122101", "其他应收款-单位", "debit", 0, 500),
    balance(2, "1602", "累计折旧", "debit", 0, 200),
    balance(3, "410401", "未分配利润", "credit", 300, 0),
    balance(4, "222199", "其他税费", "credit", 100, 0),
    balance(5, "530110", "转出研发支出", "debit", 0, 50),
  ], [], []);

  assert.deepEqual(entries.map((row) => [row.accountCode, row.classification, row.status]), [
    ["122101", "pending_review", "pending"],
    ["222199", "pending_review", "pending"],
    ["410401", "allowed_negative", "exempt"],
    ["1602", "contra_account", "exempt"],
    ["530110", "non_balance_sheet_negative", "exempt"],
  ]);
});

test("uses persisted auxiliary adjustments as the authoritative processed result", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 120, 0)],
    [{ id: 4, periodId: 3, sourceAccountCode: "2202", targetAccountCode: "1123", amount: 100, sourceType: "auxiliary_balance", status: "approved", note: JSON.stringify({ details: [{}, {}] }) }],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
  );
  assert.equal(entries[0]?.status, "approved");
  assert.equal(entries[0]?.targetAccountCode, "1123");
  assert.equal(entries[0]?.targetAccountName, "预付账款");
  assert.equal(entries[0]?.detailCount, 2);
  assert.equal(entries[0]?.adjustmentId, 4);
});

test("removes parent balances and exposes configured rules without marking them processed", () => {
  const entries = buildReclassificationWorkbench(
    [
      balance(1, "1221", "其他应收款", "debit", 0, 900),
      balance(2, "122101", "其他应收款-单位", "debit", 0, 500, 1),
    ],
    [],
    [{ id: 9, sourceAccountCode: "122101", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "224101" }],
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.accountCode, "122101");
  assert.equal(entries[0]?.status, "configured");
  assert.equal(entries[0]?.ruleId, 9);
});

test("exposes a persisted no-reclassification decision without a target", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 120, 0)],
    [],
    [{ id: 10, sourceAccountCode: "2202", abnormalSide: "debit", decision: "no_reclass", targetAccountCode: null }],
  );
  assert.equal(entries[0]?.status, "exempt");
  assert.equal(entries[0]?.targetAccountCode, null);
  assert.match(entries[0]?.reason ?? "", /人工确认无需重分类/);
});

function balance(
  id: number,
  code: string,
  name: string,
  balanceDirection: string,
  closingDebit: number,
  closingCredit: number,
  parentId: number | null = null,
) {
  return { closingDebit, closingCredit, account: { id, code, name, balanceDirection, parentId } };
}
