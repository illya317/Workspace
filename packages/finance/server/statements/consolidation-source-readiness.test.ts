import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsolidationSourceReadiness,
  type ConsolidationSourcePeriodFact,
} from "./consolidation-source-readiness";

function period(input: Partial<ConsolidationSourcePeriodFact> & Pick<ConsolidationSourcePeriodFact, "companyCode" | "month">): ConsolidationSourcePeriodFact {
  return {
    companyCode: input.companyCode,
    year: input.year ?? 2026,
    month: input.month,
    isClosed: input.isClosed ?? false,
    sourceClosed: input.sourceClosed ?? false,
    counts: input.counts ?? { balances: 10, vouchers: 2, cashFlowAllocations: 1 },
    sourceStatuses: input.sourceStatuses ?? [],
  };
}

test("future carry-forward balances are not treated as complete statement sources", () => {
  const readiness = buildConsolidationSourceReadiness({
    companyCodes: ["ZX01"],
    year: 2026,
    month: 12,
    periodKind: "year",
    periods: Array.from({ length: 12 }, (_, index) => period({
      companyCode: "ZX01",
      month: index + 1,
      counts: index < 6
        ? { balances: 10, vouchers: 2, cashFlowAllocations: 1 }
        : { balances: 10, vouchers: 0, cashFlowAllocations: 0 },
    })),
    imports: [{ companyCode: "ZX01", cutoffDate: "2026-06-30" }],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.byCompany.get("ZX01")?.reports.balanceSheet.label, "未就绪");
  assert.match(readiness.byCompany.get("ZX01")?.reports.balanceSheet.detail ?? "", /ERP 数据截止 2026-06-30/);
  assert.match(readiness.blockedReasons[0] ?? "", /未覆盖 2026-12-31/);
});

test("quarter readiness uses the full quarter and all three source facts", () => {
  const readiness = buildConsolidationSourceReadiness({
    companyCodes: ["ZX01"],
    year: 2026,
    month: 6,
    periodKind: "quarter",
    periods: [
      period({ companyCode: "ZX01", month: 4 }),
      period({ companyCode: "ZX01", month: 5 }),
      period({ companyCode: "ZX01", month: 6, isClosed: true }),
    ],
    imports: [{ companyCode: "ZX01", cutoffDate: "2026-06-30" }],
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.dataCutoffDate, "2026-06-30");
  assert.equal(readiness.byCompany.get("ZX01")?.reports.incomeStatement.count, 6);
  assert.equal(readiness.byCompany.get("ZX01")?.reports.cashFlow.count, 3);
  assert.equal(readiness.byCompany.get("ZX01")?.reports.cashFlow.label, "已就绪");
});

test("a missing statement source is reported as not ready even when cutoff is current", () => {
  const readiness = buildConsolidationSourceReadiness({
    companyCodes: ["ZX01"],
    year: 2026,
    month: 6,
    periodKind: "month",
    periods: [period({
      companyCode: "ZX01",
      month: 6,
      counts: { balances: 10, vouchers: 2, cashFlowAllocations: 0 },
    })],
    imports: [{ companyCode: "ZX01", cutoffDate: "2026-06-30" }],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.byCompany.get("ZX01")?.reports.cashFlow.label, "未就绪");
  assert.match(readiness.byCompany.get("ZX01")?.reports.cashFlow.detail ?? "", /缺少该报表的来源事实/);
  assert.ok(readiness.blockedReasons.includes("ZX01 缺少现金流量表分配来源"));
});

test("a closed zero-activity period is still a valid zero income and cash-flow source", () => {
  const readiness = buildConsolidationSourceReadiness({
    companyCodes: ["ZX01"],
    year: 2026,
    month: 6,
    periodKind: "month",
    periods: [period({
      companyCode: "ZX01",
      month: 6,
      isClosed: true,
      counts: { balances: 10, vouchers: 0, cashFlowAllocations: 0 },
    })],
    imports: [{ companyCode: "ZX01", cutoffDate: "2026-06-30" }],
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.byCompany.get("ZX01")?.reports.incomeStatement.ready, true);
  assert.equal(readiness.byCompany.get("ZX01")?.reports.cashFlow.ready, true);
});
