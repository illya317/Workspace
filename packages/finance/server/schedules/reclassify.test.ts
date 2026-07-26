import assert from "node:assert/strict";
import test from "node:test";

import { buildReclassificationWorkbench, summarizeReclassificationWorkbench } from "./reclassify";

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
    ["410401", "allowed_negative", "no_process"],
    ["1602", "contra_account", "no_process"],
    ["530110", "non_balance_sheet_negative", "no_process"],
  ]);
});

test("uses persisted auxiliary adjustments as the authoritative processed result", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 120, 0)],
    [{ id: 4, periodId: 3, sourceAccountCode: "2202", targetAccountCode: "1123", amount: 100, decision: "reclassify", basis: "account_net", sourceType: "auxiliary_balance", status: "approved", note: JSON.stringify({ details: [{}, {}] }) }],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
  );
  assert.equal(entries[0]?.status, "automatic");
  assert.equal(entries[0]?.targetAccountCode, "1123");
  assert.equal(entries[0]?.targetAccountName, "预付账款");
  assert.equal(entries[0]?.detailCount, 2);
  assert.equal(entries[0]?.adjustmentId, 4);
  assert.equal(entries[0]?.amount, 100);
  assert.equal(entries[0]?.currentAbnormalAmount, 120);
  assert.equal(entries[0]?.stale, true);
  const summary = summarizeReclassificationWorkbench(entries);
  assert.equal(summary.automatic, 1);
  assert.equal(summary.pending, 0);
});

test("keeps persisted adjustments visible after the source balance becomes zero", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 0, 0)],
    [{ id: 4, periodId: 3, sourceAccountCode: "2202", targetAccountCode: "1123", amount: 100, decision: "reclassify", basis: "account_net", sourceType: "manual", status: "adjusted", note: null }],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.amount, 100);
  assert.equal(entries[0]?.currentAbnormalAmount, 0);
  assert.equal(entries[0]?.stale, true);
  assert.match(entries[0]?.reason ?? "", /本期已无反向余额/);
});

test("does not mark a persisted adjustment stale when its applied amount still matches", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 100, 0)],
    [{ id: 4, periodId: 3, sourceAccountCode: "2202", targetAccountCode: "1123", amount: 100, decision: "reclassify", basis: "account_net", sourceType: "manual", status: "adjusted", note: null }],
    [],
  );
  assert.equal(entries[0]?.currentAbnormalAmount, 100);
  assert.equal(entries[0]?.amount, 100);
  assert.equal(entries[0]?.stale, false);
});

test("removes parent balances and exposes an unapplied configured rule as pending", () => {
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
  assert.equal(entries[0]?.status, "pending");
  assert.equal(entries[0]?.ruleId, 9);
});

test("uses the longest matching prefix rule in the workbench", () => {
  const entries = buildReclassificationWorkbench(
    [balance(2, "122101", "其他应收款-单位", "debit", 0, 500)],
    [],
    [
      { id: 8, sourceAccountCode: "122", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "2241" },
      { id: 9, sourceAccountCode: "1221", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "224101" },
    ],
  );
  assert.equal(entries[0]?.status, "pending");
  assert.equal(entries[0]?.ruleId, 9);
  assert.equal(entries[0]?.targetAccountCode, "224101");
});

test("inherits a configured group rule across an intermediate account without a current balance", () => {
  const leaf = {
    closingDebit: 100,
    closingCredit: 0,
    account: {
      id: 2,
      code: "2221020303",
      name: "9%",
      balanceDirection: "credit",
      parentId: null,
      groupAccount: {
        id: 30,
        code: "222101030902",
        name: "9％",
        balanceDirection: "credit",
        parentId: 20,
      },
    },
  };
  const entries = buildReclassificationWorkbench(
    [leaf],
    [],
    [{
      id: 405,
      enabled: true,
      policyVersionId: 1,
      sourceGroupAccountId: 10,
      targetGroupAccountId: 40,
      sourceAccountCode: "2221",
      abnormalSide: "debit",
      decision: "reclassify",
      targetAccountCode: "1463",
    }],
    [],
    new Map([["1463", "其他流动资产"]]),
    3,
    new Map(),
    [],
    new Map(),
    new Map([[30, 20], [20, 10], [10, null]]),
  );

  assert.equal(entries[0]?.status, "pending");
  assert.equal(entries[0]?.ruleId, 405);
  assert.equal(entries[0]?.sourceType, "rule_unapplied");
  assert.equal(entries[0]?.targetAccountCode, "1463");
  assert.equal(entries[0]?.amount, 100);
  assert.equal(entries[0]?.adjustmentId, null);
});

test("hides leaf candidates already covered by an ancestor automatic result", () => {
  const parent = {
    closingDebit: 150,
    closingCredit: 0,
    account: {
      id: 1,
      code: "222102",
      name: "应交增值税",
      balanceDirection: "credit",
      parentId: null,
      groupAccount: { id: 20, code: "222101", name: "应交增值税", balanceDirection: "credit", parentId: 10 },
    },
  };
  const leaf = {
    closingDebit: 200,
    closingCredit: 0,
    account: {
      id: 2,
      code: "22210203",
      name: "进项税额",
      balanceDirection: "credit",
      parentId: 1,
      groupAccount: { id: 30, code: "22210103", name: "进项税额", balanceDirection: "credit", parentId: 20 },
    },
  };
  const rule = {
    id: 407,
    enabled: true,
    policyVersionId: 1,
    sourceGroupAccountId: 20,
    targetGroupAccountId: 40,
    sourceAccountCode: "222101",
    abnormalSide: "debit",
    decision: "reclassify",
    targetAccountCode: "1463",
  };
  const entries = buildReclassificationWorkbench(
    [parent, leaf],
    [{
      id: 500,
      periodId: 3,
      sourceAccountCode: "222102",
      targetAccountCode: "1463",
      amount: 150,
      decision: "reclassify",
      basis: "account_net",
      sourceType: "automatic_rule",
      status: "approved",
      note: null,
      ruleId: 405,
    }],
    [rule],
    [],
    new Map([["1463", "其他流动资产"]]),
    3,
    new Map(),
    [],
    new Map(),
    new Map([[30, 20], [20, 10], [10, null]]),
  );

  assert.deepEqual(entries.map((entry) => [entry.accountCode, entry.status, entry.amount]), [
    ["222102", "automatic", 150],
  ]);
});

test("exposes a persisted no-reclassification decision without a target", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 120, 0)],
    [],
    [{ id: 10, sourceAccountCode: "2202", abnormalSide: "debit", decision: "no_reclass", targetAccountCode: null }],
  );
  assert.equal(entries[0]?.status, "no_process");
  assert.equal(entries[0]?.targetAccountCode, null);
  assert.match(entries[0]?.reason ?? "", /规则已确认无需处理/);
});

test("keeps legacy voucher results as historical evidence only", () => {
  const entries = buildReclassificationWorkbench(
    [],
    [],
    [],
    [{ sourceAccount: "2202", targetAccount: "1123", amount: 80, status: "approved" }],
  );
  const summary = summarizeReclassificationWorkbench(entries);

  assert.equal(entries[0]?.status, "historical");
  assert.match(entries[0]?.reason ?? "", /当前报表不再消费/);
  assert.equal(summary.total, 0);
  assert.equal(summary.automatic, 0);
  assert.equal(summary.currentAmount, 0);
  assert.equal(summary.historical, 1);
});

test("keeps superseded manual and automatic outcomes in selected-period history", () => {
  const entries = buildReclassificationWorkbench(
    [],
    [],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
    new Map([["2202", "credit"]]),
    [
      {
        id: 21,
        periodId: 3,
        sourceAccountCode: "2202",
        targetAccountCode: null,
        amount: 100,
        decision: "no_reclass",
        sourceType: "manual",
        status: "adjusted",
        note: null,
        archivedAt: "2026-07-22T01:00:00.000Z",
        archiveReason: "manual_override",
      },
      {
        id: 20,
        periodId: 3,
        sourceAccountCode: "2202",
        targetAccountCode: "1123",
        amount: 100,
        decision: "reclassify",
        sourceType: "automatic_rule",
        status: "approved",
        note: null,
        archivedAt: "2026-07-22T00:00:00.000Z",
        archiveReason: "manual_override",
      },
    ],
  );

  assert.deepEqual(entries.map((row) => [row.status, row.historicalMethod]), [
    ["historical", "manual"],
    ["historical", "automatic"],
  ]);
});

test("uses same-basis comparison so a gross adjustment matching counterparty recompute is not stale", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 120, 0)],
    [{ id: 4, periodId: 3, sourceAccountCode: "2202", targetAccountCode: "1123", amount: 100, decision: "reclassify", basis: "counterparty_gross", sourceType: "auxiliary_balance", status: "approved", note: null }],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
    new Map(),
    [],
    new Map([["2202", 100]]),
  );

  assert.equal(entries[0]?.basis, "counterparty_gross");
  assert.equal(entries[0]?.currentAbnormalAmount, 100);
  assert.equal(entries[0]?.amount, 100);
  assert.equal(entries[0]?.stale, false);
});

test("marks a gross adjustment stale when the counterparty recompute drifts", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 120, 0)],
    [{ id: 4, periodId: 3, sourceAccountCode: "2202", targetAccountCode: "1123", amount: 100, decision: "reclassify", basis: "counterparty_gross", sourceType: "auxiliary_balance", status: "approved", note: null }],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
    new Map(),
    [],
    new Map([["2202", 130]]),
  );

  assert.equal(entries[0]?.currentAbnormalAmount, 130);
  assert.equal(entries[0]?.stale, true);
  assert.match(entries[0]?.reason ?? "", /逐户毛额重算值不一致/);
});

test("exposes a null current amount with a no-facts reason when a gross row lacks auxiliary facts", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 120, 0)],
    [{ id: 4, periodId: 3, sourceAccountCode: "2202", targetAccountCode: "1123", amount: 100, decision: "reclassify", basis: "counterparty_gross", sourceType: "auxiliary_balance", status: "approved", note: null }],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
    new Map(),
    [],
    new Map([["2202", null]]),
  );

  assert.equal(entries[0]?.currentAbnormalAmount, null);
  assert.equal(entries[0]?.stale, true);
  assert.match(entries[0]?.reason ?? "", /无辅助余额事实/);
});

test("derives the row basis from the matched rule and recomputes gross rule candidates", () => {
  const entries = buildReclassificationWorkbench(
    [balance(2, "122101", "其他应收款-单位", "debit", 0, 500)],
    [],
    [{ id: 9, sourceAccountCode: "122101", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "224101", basis: "counterparty_gross" }],
    [],
    new Map(),
    0,
    new Map(),
    [],
    new Map([["122101", 618]]),
  );

  assert.equal(entries[0]?.basis, "counterparty_gross");
  assert.equal(entries[0]?.status, "pending");
  assert.equal(entries[0]?.currentAbnormalAmount, 618);
  assert.equal(entries[0]?.stale, false);
});

test("defaults rows without a rule to the account-net basis", () => {
  const entries = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 120, 0)],
    [],
    [],
  );

  assert.equal(entries[0]?.basis, "account_net");
  assert.equal(entries[0]?.currentAbnormalAmount, 120);
});

test("compares a gross adjustment-only row against the counterparty recompute", () => {
  const adjustment = { id: 4, periodId: 3, sourceAccountCode: "2202", targetAccountCode: "1123", amount: 100, decision: "reclassify", basis: "counterparty_gross", sourceType: "auxiliary_balance", status: "approved", note: null };
  const matched = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 0, 0)],
    [adjustment],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
    new Map([["2202", "credit"]]),
    [],
    new Map([["2202", 100]]),
  );
  assert.equal(matched[0]?.basis, "counterparty_gross");
  assert.equal(matched[0]?.currentAbnormalAmount, 100);
  assert.equal(matched[0]?.stale, false);

  const noFacts = buildReclassificationWorkbench(
    [balance(1, "2202", "应付账款", "credit", 0, 0)],
    [adjustment],
    [],
    [],
    new Map([["1123", "预付账款"]]),
    3,
    new Map([["2202", "credit"]]),
    [],
    new Map([["2202", null]]),
  );
  assert.equal(noFacts[0]?.currentAbnormalAmount, null);
  assert.equal(noFacts[0]?.stale, true);
  assert.match(noFacts[0]?.reason ?? "", /无辅助余额事实/);
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
