import assert from "node:assert/strict";
import test from "node:test";

import { decideGroupAccountMapping } from "./mapping-policy";
import { financeAccountSourceScopeKey } from "./source-accounts";

const groups = [
  { id: 1, code: "1001", name: "库存现金", category: "asset", balanceDirection: "debit" },
  { id: 2, code: "1002", name: "银行存款", category: "asset", balanceDirection: "debit" },
];

const local = (code: string, name: string, category = "asset", balanceDirection = "debit") => ({
  code, name, category, balanceDirection,
});

test("same code only maps when the name is also exactly equal", () => {
  assert.deepEqual(decideGroupAccountMapping(local("1001", "库存现金"), groups), {
    kind: "existing", groupAccountId: 1, method: "exact_code_name",
  });
  assert.deepEqual(decideGroupAccountMapping(local("1001", "其他货币资金"), groups), {
    kind: "unmatched",
  });
});

test("an exact unique name maps inside the same code family", () => {
  assert.deepEqual(decideGroupAccountMapping(local("100201", "银行存款"), groups), {
    kind: "existing", groupAccountId: 2, method: "exact_name",
  });
});

test("an unused local code remains unmatched", () => {
  assert.deepEqual(decideGroupAccountMapping(local("100201", "短期借款"), groups), {
    kind: "unmatched",
  });
});

test("ambiguous duplicate names never select an arbitrary group account", () => {
  const duplicated = [...groups, { id: 3, code: "100202", name: "银行存款", category: "asset", balanceDirection: "debit" }];
  assert.deepEqual(decideGroupAccountMapping(local("100201", "银行存款"), duplicated), {
    kind: "unmatched",
  });
});

test("a unique similar code and name becomes a pending suggestion", () => {
  assert.deepEqual(decideGroupAccountMapping(local("100201", "银行存款户"), groups), {
    kind: "existing", groupAccountId: 2, method: "suggested",
  });
});

test("system-suggested groups can be reused by normalized name across local code families", () => {
  const suggested = [{
    id: 20,
    code: "69900001",
    name: "审计费",
    category: "expense",
    balanceDirection: "debit",
    sourceKind: "suggested",
  }];
  assert.deepEqual(decideGroupAccountMapping(local("560216", "审计费", "expense"), suggested), {
    kind: "existing", groupAccountId: 20, method: "exact_name",
  });
});

test("same code or name never maps across accounting attributes", () => {
  const liabilities = [
    { id: 10, code: "1001", name: "库存现金", category: "liability", balanceDirection: "credit" },
    { id: 11, code: "2202", name: "银行存款", category: "liability", balanceDirection: "credit" },
  ];
  assert.deepEqual(decideGroupAccountMapping(local("1001", "库存现金"), liabilities), {
    kind: "unmatched",
  });
  assert.deepEqual(decideGroupAccountMapping(local("2001", "银行存款"), liabilities), {
    kind: "unmatched",
  });
});

test("source scope follows the logical ledger instead of year-specific database names", () => {
  const first = financeAccountSourceScopeKey({ sourceSystem: "T6", sourceLedger: "001", sourceDatabase: "UFDATA_001_2025" });
  const second = financeAccountSourceScopeKey({ sourceSystem: "T6", sourceLedger: "001", sourceDatabase: "UFDATA_001_2026" });
  assert.equal(first, second);
  assert.notEqual(first, financeAccountSourceScopeKey({ sourceSystem: "T6", sourceLedger: "007", sourceDatabase: "UFDATA_007_2026" }));
});
