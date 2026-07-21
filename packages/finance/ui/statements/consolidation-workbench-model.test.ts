import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationOverview } from "@workspace/finance/types";
import {
  buildSourceFreezeInput,
  nextConsolidationLifecycleAction,
  statementLineOptions,
} from "./consolidation-workbench-model";

test("lifecycle exposes one auditable next action", () => {
  assert.equal(nextConsolidationLifecycleAction("draft"), "submit");
  assert.equal(nextConsolidationLifecycleAction("submitted"), "review");
  assert.equal(nextConsolidationLifecycleAction("reviewed"), "lock");
  assert.equal(nextConsolidationLifecycleAction("locked"), "publish");
  assert.equal(nextConsolidationLifecycleAction("published"), null);
});

test("statement line choices exclude headers and derived totals", () => {
  const batch = {
    sources: [{
      reportType: "balanceSheet",
      reportPayload: { payload: { assets: [
        { lineCode: "cash", label: "货币资金", side: "debit", section: "currentAssets" },
        { lineCode: "totalAssets", label: "资产总计", side: "debit", section: "nonCurrentAssets", isGrandTotal: true },
      ] } },
    }],
  } as unknown as NonNullable<ConsolidationOverview["batch"]>;
  assert.deepEqual(statementLineOptions(batch, "balanceSheet"), [{
    value: "cash",
    label: "货币资金 · cash",
    reportType: "balanceSheet",
    side: "debit",
  }]);
});

test("source freeze requires an explicit functional-currency decision", () => {
  const data = {
    batch: {
      entities: [{ id: 1, companyName: "母公司" }],
      sources: [
        { entitySnapshotId: 1, reportType: "balanceSheet", sourceKind: "system", workpaperId: null, evidence: null },
        { entitySnapshotId: 1, reportType: "incomeStatement", sourceKind: "system", workpaperId: null, evidence: null },
        { entitySnapshotId: 1, reportType: "cashFlow", sourceKind: "system", workpaperId: null, evidence: null },
      ],
    },
    fxPolicy: { rates: [], investmentEvidence: [], periodEndDate: "2026-12-31" },
  } as unknown as ConsolidationOverview;
  const missing = buildSourceFreezeInput(data, {}, {}, "与总账及报表映射核对一致");
  assert.equal(missing.ok, false);
  const ready = buildSourceFreezeInput(data, {
    1: { functionalCurrency: "CNY", evidence: "公司记账本位币文件" },
  }, {}, "与总账及报表映射核对一致");
  assert.equal(ready.ok, true);
});

test("source freeze maps each investment voucher to its selected CAD entity", () => {
  const entities = [
    { id: 1, companyName: "母公司", companyCode: "01", role: "parent" },
    { id: 2, companyName: "境外主体甲", companyCode: "02", role: "subsidiary" },
    { id: 3, companyName: "境外主体乙", companyCode: "03", role: "subsidiary" },
  ];
  const data = {
    batch: {
      entities,
      sources: entities.flatMap((entity) => (["balanceSheet", "incomeStatement", "cashFlow"] as const)
        .map((reportType, index) => ({
          entitySnapshotId: entity.id,
          reportType,
          sourceKind: "workpaper",
          workpaperId: entity.id * 10 + index,
          evidence: "已提交报表底稿",
        }))),
    },
    fxPolicy: {
      rates: [
        { id: 11, rateKind: "closing", rateDate: "2026-12-31" },
        { id: 12, rateKind: "historicalInvestment", rateDate: "2026-06-28" },
      ],
      investmentEvidence: [
        { id: 101, companyCode: "01", voucherNo: "投-001", voucherDate: "2026-06-30" },
        { id: 102, companyCode: "01", voucherNo: "投-002", voucherDate: "2026-06-30" },
      ],
      periodEndDate: "2026-12-31",
    },
  } as unknown as ConsolidationOverview;
  const policies = {
    1: { functionalCurrency: "CNY", evidence: "母公司本位币文件" },
    2: { functionalCurrency: "CAD", evidence: "境外主体甲本位币文件" },
    3: { functionalCurrency: "CAD", evidence: "境外主体乙本位币文件" },
  } as const;

  const missing = buildSourceFreezeInput(data, policies, { 101: 2 }, "");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /投资凭证 01 · 投-002.*选择被投资 CAD 实体/);

  const invalid = buildSourceFreezeInput(data, policies, { 101: 2, 102: 1 }, "");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.match(invalid.error, /投-002.*必须是已确认 CAD 本位币/);

  const result = buildSourceFreezeInput(data, policies, { 101: 2, 102: 3 }, "");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.input.rateApplications
      .filter((application) => application.applicationType === "historicalInvestment")
      .map((application) => ({
        voucherItemId: application.voucherItemId,
        entitySnapshotId: application.entitySnapshotId,
      })),
    [
      { voucherItemId: 101, entitySnapshotId: 2 },
      { voucherItemId: 102, entitySnapshotId: 3 },
    ],
  );
});

test("source freeze requires and emits historical capital evidence for nonzero CAD equity", () => {
  const sources = (["balanceSheet", "incomeStatement", "cashFlow"] as const).map((reportType, index) => ({
    entitySnapshotId: 2,
    reportType,
    sourceKind: "workpaper",
    workpaperId: 20 + index,
    evidence: "已提交底稿",
    reportPayload: reportType === "balanceSheet"
      ? { payload: { assets: [], liabilities: [], equity: [{ lineCode: "paidInCapital", label: "实收资本", side: "credit", section: "equity", amount: 100, previousAmount: 0 }] } }
      : { payload: { lines: [] } },
  }));
  const data = {
    batch: { entities: [{ id: 2, companyName: "境外主体", companyCode: "02", role: "subsidiary" }], sources },
    fxPolicy: {
      periodEndDate: "2026-12-31",
      rates: [
        { id: 11, rateKind: "closing", rateDate: "2026-12-31" },
        { id: 12, rateKind: "historicalInvestment", rateDate: "2025-01-01" },
      ],
      investmentEvidence: [],
    },
  } as unknown as ConsolidationOverview;
  const policies = { 2: { functionalCurrency: "CAD", evidence: "经营环境判断" } } as const;
  const missing = buildSourceFreezeInput(data, policies, {}, "");
  assert.equal(missing.ok, false);

  const ready = buildSourceFreezeInput(data, policies, {}, "", {
    2: { exchangeRateId: 12, contributionDate: "2025-01-01", originalAmount: 100, evidence: "出资协议" },
  });
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  assert.deepEqual(ready.input.rateApplications.find((item) => item.applicationType === "historicalCapital"), {
    exchangeRateId: 12,
    applicationType: "historicalCapital",
    entitySnapshotId: 2,
    capitalContributionDate: "2025-01-01",
    capitalOriginalAmount: 100,
    evidence: "出资协议",
    periodBasis: "current",
  });
});
