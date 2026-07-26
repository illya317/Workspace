import assert from "node:assert/strict";
import test, { mock } from "node:test";

const groupMappingsByAccountId = new Map<number, {
  id: number;
  code: string;
  balanceDirection: string;
  parentId: number | null;
}>();
let applicableRulesByPeriod = new Map<number, unknown[]>();

mock.module("../group-accounts/resolve", {
  namedExports: {
    loadFinanceGroupAccountMapByAccountIdsAtInTransaction: async () => ({
      policyVersion: { id: 1, code: "V1" },
      mappings: groupMappingsByAccountId,
    }),
  },
} as never);

mock.module("./applicability", {
  namedExports: {
    loadApplicableRulesByPeriod: async () => applicableRulesByPeriod,
  },
} as never);

const { buildAuxiliaryAdjustmentPlans, buildPriorYearEndAuxiliaryFallbacks, materializeAuxiliaryAdjustments } = await import("./materialize");

test("materializes auxiliary reverse balances through versioned group identities", () => {
  const plans = buildAuxiliaryAdjustmentPlans([
    auxiliaryBalance(7, 21, "122101", 12, "1221", "debit", 0, 60, "C001", "客户甲"),
    auxiliaryBalance(7, 21, "122101", 12, "1221", "debit", 0, 40, "C002", "客户乙"),
    auxiliaryBalance(7, 22, "122102", 12, "1221", "debit", 50, 0, "C003", "客户丙"),
  ], [
    rule(2, 12, "1221", "credit", 24, "2241"),
  ]);

  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.policyVersionId, 1);
  assert.equal(plans[0]?.sourceGroupAccountId, 21);
  assert.equal(plans[0]?.targetGroupAccountId, 24);
  assert.equal(plans[0]?.sourceAccountCode, "122101");
  assert.equal(plans[0]?.targetAccountCode, "2241");
  assert.equal(plans[0]?.amount, 100);
  assert.equal(plans[0]?.details.length, 2);
});

test("skips account-net rules even when auxiliary facts exist", () => {
  const plans = buildAuxiliaryAdjustmentPlans([
    auxiliaryBalance(7, 21, "122101", 12, "1221", "debit", 0, 60, "C001", "客户甲"),
  ], [
    rule(2, 12, "1221", "credit", 24, "2241", "reclassify", "account_net"),
  ]);
  assert.deepEqual(plans, []);
});

test("materializes counterparty-gross rules per counterparty", () => {
  const plans = buildAuxiliaryAdjustmentPlans([
    auxiliaryBalance(7, 21, "122101", 12, "1221", "debit", 0, 60, "C001", "客户甲"),
    auxiliaryBalance(7, 21, "122101", 12, "1221", "debit", 100, 0, "C002", "客户乙"),
  ], [
    rule(2, 12, "1221", "credit", 24, "2241", "reclassify", "counterparty_gross"),
  ]);

  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.amount, 60);
  assert.equal(plans[0]?.details.length, 1);
});

test("uses the nearest group rule through a parent absent from auxiliary rows", () => {
  const plans = buildAuxiliaryAdjustmentPlans([
    auxiliaryBalance(7, 30, "224101", null, "224101", "credit", 60, 0, "C001", "单位甲"),
  ], [
    rule(2, 10, "2241", "debit", 40, "1221"),
    rule(3, 20, "224101", "debit", 41, "122101"),
  ], new Map([[30, 20], [20, 10], [10, null]]));

  assert.equal(plans[0]?.ruleId, 3);
  assert.equal(plans[0]?.targetGroupAccountId, 41);
  assert.equal(plans[0]?.targetAccountCode, "122101");
});

test("deletes stale auxiliary rows after a rule flips from gross to net basis", async () => {
  groupMappingsByAccountId.clear();
  groupMappingsByAccountId.set(21, { id: 12, code: "1221", balanceDirection: "debit", parentId: null });
  const flippedRule = rule(2, 12, "1221", "credit", 24, "2241", "reclassify", "account_net");
  applicableRulesByPeriod = new Map([[7, [flippedRule]]]);
  const deleted: number[] = [];
  const archived: string[] = [];
  const tx = {
    financeGroupAccountMapping: {
      findMany: async () => [{ companyCode: "ZX01", localAccountCode: "122101" }],
    },
    financeReclassRule: {
      findMany: async () => [flippedRule],
    },
    financeAuxiliaryBalance: {
      findMany: async () => [{
        periodId: 7,
        openingDebit: 0,
        openingCredit: 0,
        closingDebit: 0,
        closingCredit: 60,
        account: { id: 21, code: "122101" },
        period: { id: 7, companyCode: "ZX01", year: 2026, month: 6, endDate: "2026-06-30" },
        members: [{ member: { dimensionType: "customer", sourceCode: "C001", sourceName: "客户甲" } }],
      }],
    },
    financeBalanceReclassAdjustment: {
      findMany: async () => [{
        id: 55,
        policyVersionId: 1,
        sourceGroupAccountId: 12,
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
        ruleId: 2,
        adjustedBy: null,
        adjustedAt: null,
        note: null,
      }],
      delete: async (args: { where: { id: number } }) => {
        deleted.push(args.where.id);
        return {};
      },
      update: async () => ({}),
      create: async () => ({}),
    },
    financeBalanceReclassAdjustmentHistory: {
      create: async (args: { data: { archiveReason: string } }) => {
        archived.push(args.data.archiveReason);
        return {};
      },
    },
    financeGroupAccountRevision: {
      findMany: async () => [{ groupAccountId: 12, parentGroupAccountId: null }],
    },
  };

  const result = await materializeAuxiliaryAdjustments(tx as never, 1, [12], null);

  assert.deepEqual(result, { written: 0, updated: 0, deleted: 1, skippedProtected: 0 });
  assert.deepEqual(deleted, [55]);
  assert.deepEqual(archived, ["auxiliary_balance_removed"]);
});

test("does not materialize a versioned no-reclassification decision", () => {
  const plans = buildAuxiliaryAdjustmentPlans([
    auxiliaryBalance(7, 20, "2202", null, "2202", "credit", 30, 0, "S001", "供应商甲"),
  ], [rule(3, 20, "2202", "debit", null, null, "no_reclass")]);
  assert.deepEqual(plans, []);
});

test("uses next January opening auxiliary facts when prior December details are absent", () => {
  const january = {
    ...auxiliaryBalance(8, 24, "224101", 22, "2241", "credit", 0, 100, "C001", "单位甲"),
    openingDebit: 60,
    openingCredit: 0,
    period: { id: 8, companyCode: "ZX03", year: 2026, month: 1, endDate: "2026-01-31" },
  };
  const result = buildPriorYearEndAuxiliaryFallbacks(
    [january],
    [{ id: 7, companyCode: "ZX03", year: 2025, month: 12, endDate: "2025-12-31" }],
  );

  assert.equal(result[0]?.periodId, 7);
  assert.equal(Number(result[0]?.closingDebit), 60);
  assert.equal(Number(result[0]?.closingCredit), 0);
});

function rule(
  id: number,
  sourceGroupAccountId: number,
  sourceAccountCode: string,
  abnormalSide: "debit" | "credit",
  targetGroupAccountId: number | null,
  targetAccountCode: string | null,
  decision: "reclassify" | "no_reclass" = "reclassify",
  basis: "account_net" | "counterparty_gross" = "counterparty_gross",
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

function auxiliaryBalance(
  periodId: number,
  accountId: number,
  localCode: string,
  parentGroupAccountId: number | null,
  groupCode: string,
  balanceDirection: string,
  closingDebit: number,
  closingCredit: number,
  sourceCode: string,
  sourceName: string,
) {
  return {
    periodId,
    closingDebit,
    closingCredit,
    account: {
      id: accountId,
      code: localCode,
      groupAccount: {
        id: accountId,
        code: groupCode,
        balanceDirection,
        parentId: parentGroupAccountId,
      },
    },
    members: [{ member: { dimensionType: "customer", sourceCode, sourceName } }],
  };
}
