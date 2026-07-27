import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("server-only", { namedExports: {} } as never);
mock.module("./report-generator", {
  namedExports: { generateFinanceReport: async () => new Response(null, { status: 200 }) },
});
mock.module("./consolidation-source-readiness", {
  namedExports: { loadConsolidationSourceReadiness: async () => ({ byCompany: new Map() }) },
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

const { loadConsolidationScopeFactsWithOverrides } = await import("./consolidation-snapshots");

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
});
