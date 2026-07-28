import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreateFinanceGroupAccountCommand,
  buildDeleteFinanceGroupAccountCommand,
  buildSaveFinanceGroupAccountMappingChangeSetCommand,
  buildUpdateFinanceGroupAccountCommand,
} from "../../domain/group-chart-validation";
import { deriveFinanceGroupAccountTranslationRateType } from "@workspace/finance/types/group-account";

const defaultConsolidationFields = {
  consolidationRole: "none" as const,
  counterpartyRequirement: "none" as const,
  movementType: "closingBalance" as const,
};

test("group-account translation policy is statutory and derived from report semantics", () => {
  assert.equal(deriveFinanceGroupAccountTranslationRateType({ code: "1001", name: "货币资金", category: "asset" }), "closing");
  assert.equal(deriveFinanceGroupAccountTranslationRateType({ code: "1511", name: "长期股权投资", category: "asset" }), "closing");
  assert.equal(deriveFinanceGroupAccountTranslationRateType({ code: "6001", name: "主营业务收入", category: "revenue" }), "average");
  assert.equal(deriveFinanceGroupAccountTranslationRateType({ code: "4001", name: "实收资本", category: "equity" }), "historical");
  assert.equal(deriveFinanceGroupAccountTranslationRateType({ code: "4101", name: "盈余公积", category: "equity" }), "historical");
  assert.equal(deriveFinanceGroupAccountTranslationRateType({ code: "4104", name: "未分配利润", category: "equity" }), "retainedEarningsRollforward");
  assert.equal(deriveFinanceGroupAccountTranslationRateType({ code: "4003", name: "其他综合收益", category: "equity" }), "translationDifference");
});

test("group-account creation enforces Chinese category code prefixes", () => {
  const valid = buildCreateFinanceGroupAccountCommand({
    ...defaultConsolidationFields,
    userId: 1,
    code: "5301",
    name: "研发支出",
    category: "cost",
    balanceDirection: "debit",
    mnemonicCode: null,
    currency: null,
    parentGroupAccountId: null,
  });
  assert.equal(valid.ok, true);

  const invalid = buildCreateFinanceGroupAccountCommand({
    ...defaultConsolidationFields,
    userId: 1,
    code: "4301",
    name: "研发支出",
    category: "cost",
    balanceDirection: "debit",
    mnemonicCode: null,
    currency: null,
    parentGroupAccountId: null,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.match(invalid.issue.message, /成本类集团科目编码必须以 5 开头/);
});

test("group-account mapping change set accepts optimistic batch edits", () => {
  const result = buildSaveFinanceGroupAccountMappingChangeSetCommand({
    userId: 1,
    changes: [{
      mappingId: 12,
      targetGroupAccountId: 34,
      expectedUpdatedAt: "2026-07-23T12:00:00.000Z",
    }],
  });

  assert.equal(result.ok, true);
});

test("group-account mapping change set rejects duplicate mappings", () => {
  const result = buildSaveFinanceGroupAccountMappingChangeSetCommand({
    userId: 1,
    changes: [
      { mappingId: 12, targetGroupAccountId: 34, expectedUpdatedAt: "2026-07-23T12:00:00.000Z" },
      { mappingId: 12, targetGroupAccountId: 35, expectedUpdatedAt: "2026-07-23T12:00:00.000Z" },
    ],
  });

  assert.equal(result.ok, false);
});

test("group-account mapping change set requires a canonical timestamp", () => {
  const result = buildSaveFinanceGroupAccountMappingChangeSetCommand({
    userId: 1,
    changes: [{ mappingId: 12, targetGroupAccountId: 34, expectedUpdatedAt: "2026-07-23" }],
  });

  assert.equal(result.ok, false);
});

test("group-account deletion requires positive identity fields", () => {
  assert.equal(buildDeleteFinanceGroupAccountCommand({ userId: 1, groupAccountId: 8 }).ok, true);
  assert.equal(buildDeleteFinanceGroupAccountCommand({ userId: 1, groupAccountId: 0 }).ok, false);
});

test("group-account update no longer accepts review status changes", () => {
  const result = buildUpdateFinanceGroupAccountCommand({
    ...defaultConsolidationFields,
    userId: 1,
    groupAccountId: 8,
    code: "660201",
    name: "工资",
    category: "expense",
    balanceDirection: "debit",
    mnemonicCode: "GZ",
    currency: null,
    parentGroupAccountId: null,
    expectedUpdatedAt: "2026-07-24T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
});
