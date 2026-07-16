import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenAuxiliaryAdjustmentPlans, materializeOpenAuxiliaryAdjustments } from "./materialize";

test("materializes auxiliary reverse balances with the longest prefix rule", () => {
  const plans = buildOpenAuxiliaryAdjustmentPlans([
    auxiliaryBalance(7, "122101", "debit", 0, 60, "C001", "客户甲"),
    auxiliaryBalance(7, "122101", "debit", 0, 40, "C002", "客户乙"),
    auxiliaryBalance(7, "122102", "debit", 50, 0, "C003", "客户丙"),
  ], [
    { id: 1, sourceAccountCode: "122", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "2201" },
    { id: 2, sourceAccountCode: "1221", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "2241" },
  ]);

  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.sourceAccountCode, "122101");
  assert.equal(plans[0]?.targetAccountCode, "2241");
  assert.equal(plans[0]?.ruleId, 2);
  assert.equal(plans[0]?.amount, 100);
  assert.equal(plans[0]?.details.length, 2);
});

test("does not materialize no-reclassification decisions", () => {
  const plans = buildOpenAuxiliaryAdjustmentPlans([
    auxiliaryBalance(7, "220201", "credit", 30, 0, "S001", "供应商甲"),
  ], [
    { id: 3, sourceAccountCode: "2202", abnormalSide: "debit", decision: "no_reclass", targetAccountCode: null },
  ]);
  assert.deepEqual(plans, []);
});

test("rejects blank source prefixes before querying or writing", async () => {
  await assert.rejects(
    materializeOpenAuxiliaryAdjustments({} as never, ["   "]),
    /sourcePrefix is required/,
  );
});

test("materialization scopes reads and writes to open periods", async () => {
  const created: unknown[] = [];
  const tx = {
    financePeriod: {
      findMany: async (args: { where: { isClosed: boolean } }) => {
        assert.deepEqual(args.where, { isClosed: false });
        return [{ id: 7, companyCode: "02", year: 2026 }];
      },
    },
    financeReclassRule: {
      findMany: async () => [
        { id: 2, sourceAccountCode: "1221", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "2241", enabled: true },
      ],
    },
    financeAuxiliaryBalance: {
      findMany: async (args: { where: { periodId: { in: number[] } } }) => {
        assert.deepEqual(args.where.periodId.in, [7]);
        return [auxiliaryBalance(7, "122101", "debit", 0, 60, "C001", "客户甲")];
      },
    },
    financeBalanceReclassAdjustment: {
      findMany: async (args: { where: { periodId: { in: number[] } } }) => {
        assert.deepEqual(args.where.periodId.in, [7]);
        return [];
      },
      create: async (args: unknown) => { created.push(args); },
    },
    financeAccount: {
      findMany: async () => [{ companyCode: "02", year: 2026, code: "2241" }],
    },
  };

  const result = await materializeOpenAuxiliaryAdjustments(tx as never, ["1221"]);
  assert.equal(result.written, 1);
  assert.equal(created.length, 1);
});

test("materialization never overwrites a manual human adjustment", async () => {
  let mutated = false;
  const tx = {
    financePeriod: {
      findMany: async () => [{ id: 7, companyCode: "02", year: 2026 }],
    },
    financeReclassRule: {
      findMany: async () => [
        { id: 2, sourceAccountCode: "1221", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "2241", enabled: true },
      ],
    },
    financeAuxiliaryBalance: {
      findMany: async () => [auxiliaryBalance(7, "122101", "debit", 0, 60, "C001", "客户甲")],
    },
    financeBalanceReclassAdjustment: {
      findMany: async () => [{ id: 9, periodId: 7, sourceAccountCode: "122101", sourceType: "manual", status: "adjusted" }],
      update: async () => { mutated = true; },
      delete: async () => { mutated = true; },
      create: async () => { mutated = true; },
    },
    financeAccount: {
      findMany: async () => [{ companyCode: "02", year: 2026, code: "2241" }],
    },
  };

  const result = await materializeOpenAuxiliaryAdjustments(tx as never, ["1221"]);
  assert.equal(mutated, false);
  assert.equal(result.skippedProtected, 1);
});

test("rejects a missing scoped target before leaving an old automatic adjustment active", async () => {
  let mutated = false;
  const tx = {
    financePeriod: {
      findMany: async () => [{ id: 7, companyCode: "02", year: 2026 }],
    },
    financeReclassRule: {
      findMany: async () => [
        { id: 2, sourceAccountCode: "1221", abnormalSide: "credit", decision: "reclassify", targetAccountCode: "2241", enabled: true },
      ],
    },
    financeAuxiliaryBalance: {
      findMany: async () => [auxiliaryBalance(7, "122101", "debit", 0, 60, "C001", "客户甲")],
    },
    financeBalanceReclassAdjustment: {
      findMany: async () => [{ id: 9, periodId: 7, sourceAccountCode: "122101", sourceType: "auxiliary_balance", status: "approved" }],
      update: async () => { mutated = true; },
      delete: async () => { mutated = true; },
      create: async () => { mutated = true; },
    },
    financeAccount: {
      findMany: async () => [],
    },
  };

  await assert.rejects(
    materializeOpenAuxiliaryAdjustments(tx as never, ["1221"]),
    /02\/2026\/2241/,
  );
  assert.equal(mutated, false);
});

function auxiliaryBalance(
  periodId: number,
  code: string,
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
    account: { code, balanceDirection },
    members: [{ member: { dimensionType: "customer", sourceCode, sourceName } }],
  };
}
