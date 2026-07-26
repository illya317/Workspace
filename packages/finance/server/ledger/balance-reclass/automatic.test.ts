import assert from "node:assert/strict";
import test, { mock } from "node:test";

const groupMappingsByAccountId = new Map<number, {
  id: number;
  code: string;
  balanceDirection: string;
  parentId: number | null;
}>();
let applicableRulesByPeriod = new Map<number, unknown[]>();
let groupMapLoadCount = 0;

mock.module("../group-accounts/resolve", {
  namedExports: {
    loadFinanceGroupAccountMapByAccountIdsAtInTransaction: async () => {
      groupMapLoadCount += 1;
      return {
        policyVersion: { id: 1, code: "V1" },
        mappings: groupMappingsByAccountId,
      };
    },
  },
} as never);

mock.module("../reclass-rules/applicability", {
  namedExports: {
    loadApplicableRulesByPeriod: async () => applicableRulesByPeriod,
  },
} as never);

const { buildAutomaticRuleAdjustmentPlans, materializeAutomaticRuleAdjustments } = await import("./automatic");

const period = [{ id: 7, companyCode: "ZX01", year: 2026, endDate: "2026-06-30" }];

test("materializes a versioned rule at the highest local account with the same group outcome", () => {
  const plans = buildAutomaticRuleAdjustmentPlans(period, [
    balance(1, "1221", "debit", 0, 900),
    balance(2, "122101", "debit", 0, 500, 1),
    balance(3, "2202", "credit", 300, 0),
  ], [
    rule(10, 1, "1221", "credit", 90, "2241"),
    rule(11, 3, "2202", "debit", null, null, "no_reclass"),
  ]);

  assert.deepEqual(plans.map((plan) => ({
    source: plan.sourceAccountCode,
    sourceGroupAccountId: plan.sourceGroupAccountId,
    target: plan.targetAccountCode,
    decision: plan.decision,
    amount: plan.amount,
  })), [
    { source: "1221", sourceGroupAccountId: 1, target: "2241", decision: "reclassify", amount: 900 },
    { source: "2202", sourceGroupAccountId: 3, target: null, decision: "no_reclass", amount: 300 },
  ]);
});

test("nets tax children at a versioned group-rule boundary", () => {
  const plans = buildAutomaticRuleAdjustmentPlans(period, [
    balance(1, "2221", "credit", 13_893_373.04, 0),
    balance(2, "222101", "credit", 14_064_843.64, 0, 1),
    balance(3, "22210101", "credit", 0, 716_501.35, 2),
    balance(4, "22210102", "credit", 0, 1_111_437.13, 2),
    balance(5, "22210103", "credit", 15_508_473.13, 0, 2),
    balance(6, "2221010303", "credit", 12_682_001.74, 0, 5),
    balance(7, "22210104", "credit", 384_308.99, 0, 2),
    balance(8, "222102", "credit", 0, 139_859.6, 1),
    balance(9, "222108", "credit", 0, 31_611, 1),
  ], [
    rule(10, 1, "2221", "debit", null, null, "no_reclass"),
    rule(11, 2, "222101", "debit", 90, "1463"),
  ]);

  assert.deepEqual(plans.map((plan) => ({
    source: plan.sourceAccountCode,
    target: plan.targetAccountCode,
    amount: plan.amount,
  })), [{ source: "222101", target: "1463", amount: 14_064_843.64 }]);
});

test("inherits the nearest ancestor rule by stable group-account identity", () => {
  const plans = buildAutomaticRuleAdjustmentPlans(period, [
    balance(3, "12210199", "debit", 0, 500, null, 2),
  ], [
    rule(10, 1, "122", "credit", 90, "2241"),
    rule(11, 2, "1221", "credit", 91, "224101"),
  ]);

  assert.equal(plans[0]?.ruleId, 11);
  assert.equal(plans[0]?.targetGroupAccountId, 91);
  assert.equal(plans[0]?.targetAccountCode, "224101");
});

test("inherits through a group parent that has no local balance row", () => {
  const plans = buildAutomaticRuleAdjustmentPlans(period, [
    balance(3, "2221020303", "credit", 100, 0, null, null),
  ], [
    rule(10, 1, "2221", "debit", null, null, "no_reclass"),
    rule(11, 2, "222101", "debit", 90, "1463"),
  ], new Map([[3, 2], [2, 1], [1, null]]));

  assert.equal(plans[0]?.ruleId, 11);
  assert.equal(plans[0]?.sourceAccountCode, "2221020303");
  assert.equal(plans[0]?.targetAccountCode, "1463");
});

test("always plans the account-net basis, including the gross-rule fallback", () => {
  const plans = buildAutomaticRuleAdjustmentPlans(period, [
    balance(1, "2202", "credit", 300, 0),
  ], [
    rule(10, 1, "2202", "debit", 90, "1123", "reclassify", "counterparty_gross"),
  ]);

  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.basis, "account_net");
  assert.equal(plans[0]?.amount, 300);
});

test("keeps gross auxiliary rows protected while writing account-net automatic adjustments", async () => {
  groupMappingsByAccountId.clear();
  groupMappingsByAccountId.set(2, { id: 21, code: "122101", balanceDirection: "debit", parentId: null });
  const grossRule = rule(11, 21, "122101", "credit", 24, "2241", "reclassify", "counterparty_gross");
  applicableRulesByPeriod = new Map([[7, [grossRule]]]);
  const created: Array<{ basis: string; sourceAccountCode: string; amount: number }> = [];
  const tx = {
    financePeriod: {
      findMany: async () => [{ id: 7, companyCode: "ZX01", year: 2026, endDate: "2026-06-30" }],
    },
    financeReclassRule: {
      findMany: async () => [grossRule],
    },
    financeAccountBalance: {
      findMany: async () => [
        { periodId: 7, closingDebit: 0, closingCredit: 500, account: { id: 2, code: "122101", parentId: null } },
      ],
    },
    financeBalanceReclassAdjustment: {
      findMany: async () => [],
      create: async (args: { data: { basis: string; sourceAccountCode: string; amount: number } }) => {
        created.push(args.data);
        return {};
      },
      update: async () => ({}),
      delete: async () => ({}),
    },
    financeBalanceReclassAdjustmentHistory: {
      create: async () => ({}),
    },
    financeGroupAccountRevision: {
      findMany: async () => [{ policyVersionId: 1, groupAccountId: 21, parentGroupAccountId: null }],
    },
  };

  const written = await materializeAutomaticRuleAdjustments(tx as never, { periodIds: [7] });
  assert.deepEqual(written, { written: 1, updated: 0, deleted: 0, skippedProtected: 0 });
  assert.deepEqual(created.map((row) => [row.sourceAccountCode, row.basis, row.amount]), [["122101", "account_net", 500]]);

  const protectedTx = {
    ...tx,
    financeBalanceReclassAdjustment: {
      ...tx.financeBalanceReclassAdjustment,
      findMany: async () => [{
        id: 55,
        policyVersionId: 1,
        sourceGroupAccountId: 21,
        targetGroupAccountId: 24,
        periodId: 7,
        companyCode: "ZX01",
        year: 2026,
        sourceAccountCode: "122101",
        targetAccountCode: "2241",
        amount: 60,
        decision: "reclassify",
        basis: "counterparty_gross",
        sourceType: "auxiliary_balance",
        status: "approved",
        ruleId: 11,
        adjustedBy: null,
        adjustedAt: null,
        note: null,
      }],
    },
  };
  created.length = 0;
  const protectedResult = await materializeAutomaticRuleAdjustments(protectedTx as never, { periodIds: [7] });
  assert.deepEqual(protectedResult, { written: 0, updated: 0, deleted: 0, skippedProtected: 1 });
  assert.deepEqual(created, []);
});

test("loads one group mapping batch for all periods in a policy-scoped rebuild", async () => {
  groupMappingsByAccountId.clear();
  groupMappingsByAccountId.set(2, { id: 21, code: "122101", balanceDirection: "debit", parentId: null });
  const activeRule = rule(11, 21, "122101", "credit", null, null, "no_reclass", "account_net");
  const created: Array<{ periodId: number }> = [];
  const tx = {
    financePeriod: {
      findMany: async () => [
        { id: 7, companyCode: "ZX01", year: 2026, endDate: "2026-06-30" },
        { id: 8, companyCode: "ZX01", year: 2026, endDate: "2026-07-31" },
      ],
    },
    financeAccountingPolicyVersion: {
      findUnique: async () => ({ id: 1, effectiveFrom: null, effectiveTo: null }),
    },
    financeReclassRule: {
      findMany: async () => [activeRule],
    },
    financeAccountBalance: {
      findMany: async () => [
        { periodId: 7, closingDebit: 0, closingCredit: 500, account: { id: 2, code: "122101", parentId: null } },
        { periodId: 8, closingDebit: 0, closingCredit: 600, account: { id: 2, code: "122101", parentId: null } },
      ],
    },
    financeBalanceReclassAdjustment: {
      findMany: async () => [],
      create: async (args: { data: { periodId: number } }) => {
        created.push(args.data);
        return {};
      },
      update: async () => ({}),
      delete: async () => ({}),
    },
    financeBalanceReclassAdjustmentHistory: {
      create: async () => ({}),
    },
    financeGroupAccountRevision: {
      findMany: async () => [{ policyVersionId: 1, groupAccountId: 21, parentGroupAccountId: null }],
    },
  };
  const before = groupMapLoadCount;

  const result = await materializeAutomaticRuleAdjustments(tx as never, {
    policyVersionId: 1,
    sourceGroupAccountIds: [21],
  });

  assert.equal(groupMapLoadCount - before, 1);
  assert.equal(result.written, 2);
  assert.deepEqual(created.map((row) => row.periodId), [7, 8]);
});

function rule(
  id: number,
  sourceGroupAccountId: number,
  sourceAccountCode: string,
  abnormalSide: "debit" | "credit",
  targetGroupAccountId: number | null,
  targetAccountCode: string | null,
  decision: "reclassify" | "no_reclass" = "reclassify",
  basis?: "account_net" | "counterparty_gross",
) {
  return {
    id,
    policyVersionId: 1,
    sourceGroupAccountId,
    targetGroupAccountId,
    sourceAccountCode,
    abnormalSide,
    decision,
    basis,
    targetAccountCode,
    enabled: true,
  };
}

function balance(
  id: number,
  code: string,
  balanceDirection: string,
  closingDebit: number,
  closingCredit: number,
  parentId: number | null = null,
  groupParentId: number | null = parentId,
) {
  return {
    periodId: 7,
    closingDebit,
    closingCredit,
    account: {
      id,
      code,
      parentId,
      groupAccount: { id, code, balanceDirection, parentId: groupParentId },
    },
  };
}
