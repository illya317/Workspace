import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { PreviewAuxiliaryBalance } from "../../import/shared";

const groupMappingsByAccountId = new Map<number, {
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  parentId: number | null;
}>();
let applicableRulesByPeriod = new Map<number, unknown[]>();
const adjustmentDeletes: number[] = [];
const adjustmentCreates: Array<{ basis: string; sourceAccountCode: string }> = [];
let existingAdjustments: Array<Record<string, unknown>> = [];

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financePeriod: {
        findUnique: async () => ({
          id: 7,
          companyCode: "ZX01",
          year: 2026,
          month: 6,
          startDate: "2026-06-01",
          endDate: "2026-06-30",
        }),
        create: async () => {
          throw new Error("unexpected period creation");
        },
      },
      financeAccount: {
        findMany: async () => [{ id: 100, code: "2202" }],
      },
      financeReclassRule: {
        findMany: async () => applicableRulesByPeriod.get(7) ?? [],
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        financeBalanceReclassAdjustment: {
          findMany: async () => existingAdjustments,
          create: async (args: { data: { basis: string; sourceAccountCode: string } }) => {
            adjustmentCreates.push(args.data);
            return {};
          },
          update: async () => ({}),
          delete: async (args: { where: { id: number } }) => {
            adjustmentDeletes.push(args.where.id);
            return {};
          },
        },
        financeBalanceReclassAdjustmentHistory: {
          create: async () => ({}),
        },
        reclassResult: {
          deleteMany: async () => ({ count: 0 }),
        },
      }),
    },
  },
} as never);

mock.module("../group-accounts", {
  namedExports: {
    loadFinanceGroupAccountMapByAccountIdsAt: async () => ({
      policyVersion: { id: 1, code: "V1" },
      mappings: groupMappingsByAccountId,
    }),
  },
} as never);

mock.module("../reclass-rules/applicability", {
  namedExports: {
    loadApplicableRulesByPeriod: async () => applicableRulesByPeriod,
  },
} as never);

mock.module("./automatic", {
  namedExports: {
    materializeAutomaticRuleAdjustments: async () => ({ written: 0, updated: 0, deleted: 0, skippedProtected: 0 }),
  },
} as never);

const { buildAuxiliaryReclassEntries, importAuxiliaryReclassAdjustments } = await import("./auxiliary");

test("does not reclassify auxiliary balances before a manual decision is stored", () => {
  const rows = [
    row("2202", "supplier", "0048", "供应商A", 2060, 0),
    row("2202", "supplier", "0080", "供应商B", 5460, 0),
    row("2202", "supplier", "0084", "供应商C", 5000, 0),
    row("224101", "supplier", "0006", "单位A", 45581.2, 0),
    row("224101", "supplier", "0024", "单位B", 5500, 0),
    row("122101", "customer", "0007", "单位C", 0, 58913072.19),
    row("1123", "supplier", "0001", "正常预付", 100, 0),
    row("2221", "supplier", "tax", "应交税费", 192617.25, 0),
  ];

  const result = buildAuxiliaryReclassEntries(rows);
  assert.deepEqual(result.coveredAccountCodes, []);
  assert.deepEqual(result.entries, []);
});

test("applies a manually confirmed rule to child accounts", () => {
  const result = buildAuxiliaryReclassEntries([
    row("220299", "supplier", "1", "供应商", 100, 0),
    row("22410199", "supplier", "2", "单位", 80, 0),
  ], [rule(1, 20, "2202", "debit", 30, "1123")], groupMap([
    ["220299", 21, 20, "credit"],
    ["22410199", 41, 40, "credit"],
  ]));
  assert.deepEqual(result.entries.map((entry) => [entry.sourceAccount, entry.targetAccount]), [["220299", "1123"]]);
});

test("nets debit and credit before deciding the closing side", () => {
  const result = buildAuxiliaryReclassEntries([
    { ...row("2202", "supplier", "1", "供应商", 120, 20) },
    { ...row("122101", "customer", "2", "客户", 30, 80) },
  ], [rule(1, 20, "2202", "debit", 30, "1123"), rule(2, 12, "122101", "credit", 40, "224101")], groupMap([
    ["2202", 20, null, "credit"],
    ["122101", 12, null, "debit"],
  ]));
  assert.deepEqual(result.entries.map((entry) => entry.amount), [100, 50]);
});

test("manual rules use closing net balance rather than current movements", () => {
  const result = buildAuxiliaryReclassEntries([
    { ...row("2202", "supplier", "1", "供应商", 120, 20), currentDebit: 9999 },
  ], [rule(7, 20, "2202", "debit", 14, "1463")], groupMap([["2202", 20, null, "credit"]]));
  assert.deepEqual(result.entries.map((entry) => ({ target: entry.targetAccount, amount: entry.amount, ruleId: entry.ruleId })), [
    { target: "1463", amount: 100, ruleId: 7 },
  ]);
});

test("a manual no-reclassification decision covers the account without creating an adjustment", () => {
  const result = buildAuxiliaryReclassEntries([
    row("2202", "supplier", "1", "供应商", 100, 0),
  ], [{
    id: 8,
    policyVersionId: 1,
    sourceGroupAccountId: 20,
    targetGroupAccountId: null,
    sourceAccountCode: "2202",
    abnormalSide: "debit",
    decision: "no_reclass",
    basis: "counterparty_gross",
    targetAccountCode: null,
    enabled: true,
  }], groupMap([["2202", 20, null, "credit"]]));
  assert.deepEqual(result.coveredAccountCodes, ["2202"]);
  assert.deepEqual(result.entries, []);
});

test("an account-net rule produces no auxiliary entry and does not cover the account", () => {
  const netBasisRule = { ...rule(1, 20, "2202", "debit", 30, "1123"), basis: "account_net" };
  const result = buildAuxiliaryReclassEntries([
    row("2202", "supplier", "1", "供应商", 100, 0),
  ], [netBasisRule], groupMap([["2202", 20, null, "credit"]]));

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.coveredAccountCodes, []);
});

test("import keeps automatic rows of account-net rules while removing stale auxiliary rows", async () => {
  groupMappingsByAccountId.clear();
  groupMappingsByAccountId.set(100, {
    id: 20,
    code: "2202",
    name: "应付账款",
    category: "liability",
    balanceDirection: "credit",
    parentId: null,
  });
  const netBasisRule = {
    id: 8,
    policyVersionId: 1,
    sourceGroupAccountId: 20,
    targetGroupAccountId: 30,
    sourceAccountCode: "2202",
    abnormalSide: "debit",
    decision: "reclassify",
    basis: "account_net",
    targetAccountCode: "1123",
    enabled: true,
  };
  applicableRulesByPeriod = new Map([[7, [netBasisRule]]]);
  adjustmentDeletes.length = 0;
  adjustmentCreates.length = 0;
  existingAdjustments = [
    {
      id: 41,
      policyVersionId: 1,
      sourceGroupAccountId: 20,
      targetGroupAccountId: 30,
      periodId: 7,
      companyCode: "ZX01",
      year: 2026,
      sourceAccountCode: "2202",
      targetAccountCode: "1123",
      amount: 100,
      decision: "reclassify",
      basis: "account_net",
      sourceType: "automatic_rule",
      status: "approved",
      ruleId: 8,
      adjustedBy: null,
      adjustedAt: null,
      note: null,
    },
    {
      id: 42,
      policyVersionId: 1,
      sourceGroupAccountId: 20,
      targetGroupAccountId: 30,
      periodId: 7,
      companyCode: "ZX01",
      year: 2026,
      sourceAccountCode: "224101",
      targetAccountCode: "1123",
      amount: 50,
      decision: "reclassify",
      basis: "counterparty_gross",
      sourceType: "auxiliary_balance",
      status: "approved",
      ruleId: 8,
      adjustedBy: null,
      adjustedAt: null,
      note: null,
    },
  ];

  const result = await importAuxiliaryReclassAdjustments({
    companyCode: "ZX01",
    year: 2026,
    month: 6,
    rows: [row("2202", "supplier", "1", "供应商", 100, 0)],
  });

  assert.deepEqual(result.entries, []);
  assert.equal(result.written, 0);
  assert.equal(result.deleted, 1);
  assert.deepEqual(adjustmentDeletes, [42]);
  assert.deepEqual(adjustmentCreates, []);
});

function rule(
  id: number,
  sourceGroupAccountId: number,
  sourceAccountCode: string,
  abnormalSide: string,
  targetGroupAccountId: number,
  targetAccountCode: string,
) {
  return {
    id,
    policyVersionId: 1,
    sourceGroupAccountId,
    targetGroupAccountId,
    sourceAccountCode,
    abnormalSide,
    decision: "reclassify",
    basis: "counterparty_gross",
    targetAccountCode,
    enabled: true,
  };
}

function groupMap(entries: Array<[string, number, number | null, string]>) {
  return new Map(entries.map(([localCode, id, parentId, balanceDirection]) => [localCode, {
    id,
    code: localCode,
    name: localCode,
    category: "asset",
    balanceDirection,
    parentId,
  }]));
}

function row(
  accountCode: string,
  dimensionType: PreviewAuxiliaryBalance["dimensionType"],
  dimensionCode: string,
  dimensionName: string,
  closingDebit: number,
  closingCredit: number,
): PreviewAuxiliaryBalance {
  return {
    accountCode,
    accountName: accountCode,
    dimensionType,
    dimensionCode,
    dimensionName,
    openingDebit: 0,
    openingCredit: 0,
    currentDebit: 0,
    currentCredit: 0,
    closingDebit,
    closingCredit,
  };
}
