import assert from "node:assert/strict";
import test from "node:test";

import { buildConsolidatedReportOutput } from "./consolidated-output";
import type { ConsolidationReplayPackage } from "./consolidation-replay";

function line(
  lineCode: string,
  amount: number,
  input: Partial<{
    section: string;
    side: "debit" | "credit";
    direction: "in" | "out" | "net";
    isTotal: boolean;
    isGrandTotal: boolean;
  }> = {},
) {
  return {
    lineCode,
    label: lineCode,
    code: lineCode,
    amount,
    previousAmount: 0,
    section: input.section ?? "operating",
    side: input.side ?? "debit",
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.isTotal ? { isTotal: true as const } : {}),
    ...(input.isGrandTotal ? { isGrandTotal: true as const } : {}),
  };
}

function entity(id: number, companyCode: string) {
  return {
    id,
    companyId: id,
    companyCode,
    companyName: `CAD实体${companyCode}`,
    role: "subsidiary" as const,
    directParentCompanyId: 1,
    directParentCode: "01",
    relationId: id,
    relationUpdatedAt: null,
    relationEffectiveFrom: null,
    relationEffectiveTo: null,
    relationVersion: 1,
    shareRatio: 1,
    isConsolidated: true,
    functionalCurrency: "CAD",
    currencyEvidence: "加拿大经营环境",
    currencyDecidedBy: 1,
  };
}

function sourcePayloads(entitySnapshotId: number, idOffset: number) {
  const common = {
    entitySnapshotId,
    sourceKind: "workpaper" as const,
    sourceStatus: "submitted" as const,
    workpaperVersion: 1,
    sourceChecksum: "checksum",
    workpaperUpdatedBy: 1,
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
    fingerprint: "fingerprint",
    evidence: "已提交",
    selectedBy: 1,
    selectedAt: "2027-01-01T00:00:00.000Z",
  };
  return [
    {
      ...common,
      id: idOffset + 1,
      reportType: "balanceSheet" as const,
      workpaperId: idOffset + 1,
      reportPayload: { httpStatus: 200, payload: {
        assets: [
          line("cash", 150, { section: "currentAssets" }),
          line("totalCurrentAssets", 150, { section: "currentAssets", isTotal: true }),
          line("totalAssets", 150, { section: "nonCurrentAssets", isGrandTotal: true }),
        ],
        liabilities: [
          line("payables", 80, { section: "currentLiabilities", side: "credit" }),
          line("totalCurrentLiabilities", 80, { section: "currentLiabilities", side: "credit", isTotal: true }),
          line("totalLiabilities", 80, { section: "liabilities", side: "credit", isGrandTotal: true }),
        ],
        equity: [
          line("paidInCapital", 70, { section: "equity", side: "credit" }),
          line("otherComprehensiveIncome", 0, { section: "equity", side: "credit" }),
          line("totalEquity", 70, { section: "equity", side: "credit", isTotal: true }),
        ],
      } },
    },
    {
      ...common,
      id: idOffset + 2,
      reportType: "incomeStatement" as const,
      workpaperId: idOffset + 2,
      reportPayload: { httpStatus: 200, payload: { lines: [
        line("revenue", 200, { side: "credit" }),
        line("netProfit", 200, { isGrandTotal: true }),
      ] } },
    },
    {
      ...common,
      id: idOffset + 3,
      reportType: "cashFlow" as const,
      workpaperId: idOffset + 3,
      reportPayload: { httpStatus: 200, payload: { lines: [
        line("salesReceipt", 100, { direction: "in" }),
        line("netIncrease", 0, { direction: "net", isGrandTotal: true }),
        line("openingCash", 0, { direction: "in" }),
        line("endingCash", 0, { direction: "net", isGrandTotal: true }),
      ] } },
    },
  ];
}

function rateApplication(
  applicationType: "closing" | "historicalInvestment",
  entitySnapshotId: number,
  voucherItemId?: number,
  periodBasis: "current" | "comparative" = "current",
): ConsolidationReplayPackage["exchangeRates"][number]["applications"][number] {
  const historical = applicationType === "historicalInvestment";
  return {
    applicationType,
    periodBasis,
    entitySnapshotId,
    voucherItemId: voucherItemId ?? null,
    targetDate: historical ? "2020-01-01" : "2026-12-31",
    evidence: historical ? "投资日凭证" : "期末折算",
    voucher: historical ? {
      companyCode: "ZX01",
      voucherNo: `投-${voucherItemId}`,
      voucherDate: "2020-01-01",
      description: "对境外子公司出资",
      accountCode: "1511",
      bookedAmountCny: 350,
      currencyCode: "CAD",
      originalAmount: 70,
    } : null,
  };
}

function frozenRate(
  exchangeRateId: number,
  rateKind: "closing" | "historicalInvestment",
  rate: number,
  entitySnapshotId: number,
): ConsolidationReplayPackage["exchangeRates"][number] {
  return {
    id: exchangeRateId + 100,
    exchangeRateId,
    exchangeRateVersion: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind,
    rateDate: rateKind === "closing" ? "2026-12-31" : "2020-01-01",
    rate,
    sourceUrl: "https://www.boc.cn/sourcedb/whpj/",
    publishedAt: null,
    recordedBy: 9,
    recordedAt: "2027-01-02T00:00:00.000Z",
    applications: [rateApplication(
      rateKind,
      entitySnapshotId,
      rateKind === "historicalInvestment" ? exchangeRateId + 1_000 : undefined,
    )],
  };
}

function replayPackage(entityIds = [101]): ConsolidationReplayPackage {
  const entities = entityIds.map((id, index) => entity(id, String(index + 2).padStart(2, "0")));
  return {
    batch: {
      id: 1,
      parentCompanyId: 1,
      parentCompanyCode: "ZX01",
      parentCompanyName: "母公司",
      year: 2026,
      month: 12,
      periodKind: "month",
      version: 1,
      revision: 4,
      status: "locked",
      baseBatchId: null,
      scopeFingerprint: "scope",
      sourceFingerprint: "sources",
      rateFingerprint: "rates",
      createdBy: 1,
      submittedBy: 2,
      submittedAt: "2027-01-02T00:00:00.000Z",
      reviewedBy: 3,
      reviewedAt: "2027-01-03T00:00:00.000Z",
      reviewNote: "同意",
      lockedBy: 3,
      lockedAt: "2027-01-04T00:00:00.000Z",
      publishedBy: null,
      publishedAt: null,
    },
    entities,
    sources: entities.flatMap((item, index) => sourcePayloads(item.id, index * 10)),
    exchangeRates: [],
    approvedEntries: [],
    controlDecisions: [],
    events: [],
    fingerprintVerification: {
      scope: { stored: "scope", recomputed: "scope" },
      sources: { stored: "sources", recomputed: "sources" },
      rates: { stored: "rates", recomputed: "rates" },
    },
  };
}

test("CAD uses entity closing rates, historical capital, and derives CTA in OCI", () => {
  const replay = replayPackage();
  replay.exchangeRates = [
    frozenRate(5, "closing", 5.32, 101),
    frozenRate(7, "historicalInvestment", 4.8, 101),
  ];
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((item) => item.reportType === "balanceSheet")!;
  const income = result.data.statements.find((item) => item.reportType === "incomeStatement")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "cash")?.amount, 798);
  assert.equal(balance.lines.find((item) => item.lineCode === "paidInCapital")?.amount, 336);
  assert.equal(balance.lines.find((item) => item.lineCode === "otherComprehensiveIncome")?.amount, 36.4);
  assert.equal(income.lines.find((item) => item.lineCode === "revenue")?.amount, 1_064);
});

test("CAD derives liabilities from section totals when source omits totalLiabilities", () => {
  const replay = replayPackage();
  replay.exchangeRates = [
    frozenRate(5, "closing", 5.32, 101),
    frozenRate(7, "historicalInvestment", 4.8, 101),
  ];
  const payload = replay.sources[0]!.reportPayload as {
    payload: { liabilities: Array<{ lineCode: string }> };
  };
  payload.payload.liabilities = payload.payload.liabilities.filter((item) => item.lineCode !== "totalLiabilities");
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((item) => item.reportType === "balanceSheet")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "totalLiabilities")?.amount, 425.6);
});

test("two CAD entities use their own closing and historical applications", () => {
  const replay = replayPackage([101, 102]);
  replay.exchangeRates = [
    frozenRate(11, "closing", 5.32, 101),
    frozenRate(13, "historicalInvestment", 4.8, 101),
    frozenRate(21, "closing", 4.8, 102),
    frozenRate(23, "historicalInvestment", 4.5, 102),
  ];
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"], [102, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((item) => item.reportType === "balanceSheet")!;
  const income = result.data.statements.find((item) => item.reportType === "incomeStatement")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "cash")?.amount, 1_518);
  assert.equal(income.lines.find((item) => item.lineCode === "revenue")?.amount, 2_024);
});

test("CAD output blocks without an entity closing application", () => {
  const replay = replayPackage();
  replay.exchangeRates = [frozenRate(7, "historicalInvestment", 4.8, 101)];
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "rateApplications");
});

test("CAD comparative numbers block until prior-period evidence is frozen", () => {
  const replay = replayPackage();
  replay.exchangeRates = [
    frozenRate(5, "closing", 5.32, 101),
    frozenRate(7, "historicalInvestment", 4.8, 101),
  ];
  const payload = replay.sources[0]!.reportPayload as {
    payload: { assets: Array<{ lineCode: string; previousAmount: number }> };
  };
  payload.payload.assets.find((item) => item.lineCode === "cash")!.previousAmount = 10;
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "comparativeExchangeRates");
});

test("CAD retained earnings follow the user-confirmed closing-rate policy", () => {
  const replay = replayPackage();
  replay.exchangeRates = [
    frozenRate(5, "closing", 5.32, 101),
    frozenRate(7, "historicalInvestment", 4.8, 101),
  ];
  const payload = replay.sources[0]!.reportPayload as {
    payload: { equity: Array<ReturnType<typeof line>> };
  };
  payload.payload.equity.find((item) => item.lineCode === "paidInCapital")!.amount = 60;
  payload.payload.equity.splice(1, 0, line("undistributedProfit", 10, {
    section: "equity",
    side: "credit",
  }));
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((statement) => statement.reportType === "balanceSheet")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "undistributedProfit")?.amount, 53.2);
});
