import assert from "node:assert/strict";
import { mock, test } from "node:test";

let reportGenerations = 0;

mock.module("server-only", { namedExports: {} } as never);
mock.module("./report-generator", {
  namedExports: {
    generateFinanceReport: async () => {
      reportGenerations += 1;
      return Response.json({ lines: [] });
    },
  },
});
mock.module("./consolidation-source-readiness", {
  namedExports: {
    loadConsolidationSourceReadiness: async () => ({
      byCompany: new Map([["C01", {
        companyCode: "C01",
        cutoffDate: "2026-06-30",
        periodClosed: true,
        periodCoverageComplete: true,
        reports: {
          balanceSheet: { ready: true, count: 1, label: "已就绪", detail: "已关账" },
          incomeStatement: { ready: true, count: 1, label: "已就绪", detail: "已关账" },
          cashFlow: { ready: true, count: 1, label: "已就绪", detail: "已关账" },
        },
      }]]),
    }),
  },
});
mock.module("@workspace/platform/server/prisma", {
  namedExports: { Prisma: {}, prisma: {} },
} as never);
mock.module("@workspace/platform/server/tenant-config", {
  namedExports: {
    getTenantProfile: () => ({
      financeConsolidationPolicies: {
        retainedEarningsOpeningBalances: [],
        cutoverBaselines: [{
          key: "canada-2025-12-opening",
          foreignCompanyCode: "C01",
          baselineDate: "2025-12-31",
          parentCompanyCode: "P01",
          parentLongTermInvestmentAmount: 100,
          presentationCurrencyCode: "CNY",
          equityComponents: [{ lineCode: "capitalReserve", amount: 100 }],
          amountExplanationQueries: [],
          historicalDifferenceLineCode: "capitalReserve",
          evidence: "fixture",
        }],
      },
    }),
  },
} as never);
mock.module("./consolidation-cutover-amount-explanations", {
  namedExports: { certifyCutoverAmountExplanations: async () => [] },
} as never);

const { loadSelectedSourceFacts } = await import("./consolidation-snapshots");

const scope = {
  companyId: 1,
  companyCode: "C01",
  companyName: "测试公司",
  role: "parent" as const,
  directParentCompanyId: null,
  directParentCode: null,
  relationId: null,
  relationUpdatedAt: null,
  relationEffectiveFrom: null,
  relationEffectiveTo: null,
  relationVersion: null,
  shareRatio: 1,
  isConsolidated: true,
  functionalCurrency: "CNY",
  currencyEvidence: "公司本位币",
  currencyDecidedBy: null,
};

function source(reportType: "balanceSheet" | "incomeStatement" | "cashFlow") {
  return {
    companyId: 1,
    reportType,
    sourceKind: "system" as const,
    sourceStatus: "available" as const,
    workpaperId: null,
    workpaperVersion: null,
    sourceChecksum: null,
    workpaperUpdatedBy: null,
    sourcePackageId: null,
    sourcePackageRevision: null,
    sourcePackageStatus: null,
    sourcePackageChecksum: null,
    sourcePackageUploadedBy: null,
    sourcePackageSubmittedBy: null,
    lineCount: 1,
    sourcedLineCount: 1,
    importedLineCount: 0,
    manualLineCount: 0,
    formulaLineCount: 0,
    reportPayload: { httpStatus: 200, payload: { lines: [] } },
    fingerprint: reportType,
    evidence: "已冻结",
  };
}

test("closed periods reuse complete frozen statement sources without regeneration", async () => {
  const existing = [source("balanceSheet"), source("incomeStatement"), source("cashFlow")];
  const result = await loadSelectedSourceFacts(
    new Map([[1, scope]]),
    2026,
    6,
    "month",
    existing,
  );

  assert.deepEqual(result, existing);
  assert.equal(reportGenerations, 0);
});

test("a newly configured prior-year cutover baseline refreshes only the CAD balance source", async () => {
  reportGenerations = 0;
  const existing = [source("balanceSheet"), source("incomeStatement"), source("cashFlow")];
  const result = await loadSelectedSourceFacts(
    new Map([[1, { ...scope, functionalCurrency: "CAD" }]]),
    2026,
    6,
    "month",
    existing,
  );

  assert.equal(reportGenerations, 1);
  const balance = result.find((item) => item.reportType === "balanceSheet");
  assert.equal(
    (balance?.reportPayload as { translationFacts?: { consolidationCutoverBaseline?: { key?: string } } })
      .translationFacts?.consolidationCutoverBaseline?.key,
    "canada-2025-12-opening",
  );
});
