import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("server-only", { namedExports: {} } as never);
mock.module("./report-generator", {
  namedExports: { generateFinanceReport: async () => new Response(null, { status: 200 }) },
});
mock.module("./consolidation-source-readiness", {
  namedExports: { loadConsolidationSourceReadiness: async () => ({ byCompany: new Map() }) },
});
mock.module("@workspace/platform/server/tenant-config", {
  namedExports: {
    getTenantProfile: () => ({
      financeConsolidationPolicies: {
        openingCapitalReclassifications: [],
        retainedEarningsOpeningBalances: [{
          key: "example-opening-re",
          foreignCompanyCode: "M",
          openingDate: "2025-12-31",
          presentationCurrencyCode: "CNY",
          openingAmount: -123.45,
          evidence: "approved example",
        }],
      },
    }),
  },
});

function relation(input: {
  id: number;
  ownerId: number;
  ownerCode: string;
  issuerId: number;
  issuerCode: string;
}) {
  return {
    id: input.id,
    issuerCompanyId: input.issuerId,
    shareRatio: 1,
    isConsolidated: true,
    effectiveFrom: null,
    effectiveTo: null,
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    version: 1,
    owner: { company: { id: input.ownerId, code: input.ownerCode } },
    issuer: {
      id: input.issuerId,
      code: input.issuerCode,
      party: { name: input.issuerCode, fullName: `${input.issuerCode}公司` },
    },
  };
}

const relations = [
  relation({ id: 12, ownerId: 1, ownerCode: "P", issuerId: 2, issuerCode: "M" }),
  relation({ id: 23, ownerId: 2, ownerCode: "M", issuerId: 3, issuerCode: "C" }),
  relation({ id: 13, ownerId: 1, ownerCode: "P", issuerId: 3, issuerCode: "C" }),
];

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      company: {
        findUnique: async () => ({ id: 1, code: "P", party: { name: "P", fullName: "P公司" } }),
      },
      ownershipInterest: { findMany: async () => relations },
      financeCurrency: { findMany: async () => [] },
      financeCompanyCurrencyPolicy: { findMany: async () => [] },
    },
  },
});

const {
  loadConsolidationScopeFactsWithOverrides,
  retainedEarningsOpeningBalanceFor,
  tenantRetainedEarningsOpeningFields,
} = await import("./consolidation-snapshots");
const { assertConsecutiveOpeningPeriods } = await import("./consolidation-equity-rollforward");

test("CAD retained earnings opening baseline blocks a missing month", () => {
  assert.throws(() => assertConsecutiveOpeningPeriods(
    2026,
    3,
    [{ year: 2026, month: 1 }, { year: 2026, month: 3 }],
  ), /缺少 2026-02 月会计期间/);
});

test("retained earnings opening balance is selected from tenant policy by company and prior year end", () => {
  const balance = retainedEarningsOpeningBalanceFor([{
    key: "future-opening-re",
    foreignCompanyCode: "CA01",
    openingDate: "2030-12-31",
    presentationCurrencyCode: "CNY",
    openingAmount: -900,
    evidence: "approved future example",
  }], "CA01", "2031-06-30");
  assert.equal(balance?.openingAmount, -900);
  assert.equal(retainedEarningsOpeningBalanceFor(
    balance ? [balance] : [],
    "CA01",
    "2032-06-30",
  ), null);
});

test("existing batch refresh can rehydrate retained earnings opening fields from tenant policy", () => {
  assert.deepEqual(tenantRetainedEarningsOpeningFields("M", "2026-06-30"), {
    openingRetainedEarningsDate: "2025-12-31",
    openingRetainedEarningsCny: -123.45,
    openingRetainedEarningsEvidence: "approved example",
  });
});

test("strict Finance scope resolution still rejects multiple direct owners", async () => {
  await assert.rejects(
    loadConsolidationScopeFactsWithOverrides(
      1,
      "2026-07-31",
      new Map([[2, true], [3, true]]),
    ),
    /多个直接持股方/,
  );
});

test("excluding the duplicated candidate yields a connected Finance scope", async () => {
  const scope = await loadConsolidationScopeFactsWithOverrides(
    1,
    "2026-07-31",
    new Map([[2, true], [3, false]]),
  );
  assert.deepEqual(scope.map((item) => item.companyId), [1, 2]);
  assert.equal(scope[1]?.openingRetainedEarningsDate, "2025-12-31");
  assert.equal(scope[1]?.openingRetainedEarningsCny, -123.45);
  assert.equal(scope[1]?.openingRetainedEarningsEvidence, "approved example");
});
