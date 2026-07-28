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

function monthlyFlowFacts(year: number, amounts: Record<string, number>) {
  return Array.from({ length: 12 }, (_, index) => ({
    periodEnd: new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10),
    lines: Object.entries(amounts).map(([lineCode, amount]) => ({
      lineCode,
      amount: index === 11 ? amount : 0,
    })),
  }));
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
      reportPayload: {
        httpStatus: 200,
        payload: { lines: [
          line("revenue", 200, { side: "credit" }),
          line("netProfit", 200, { isGrandTotal: true }),
        ] },
        translationFacts: { monthlyFlows: {
          current: monthlyFlowFacts(2026, { revenue: 200, netProfit: 200 }),
          comparative: monthlyFlowFacts(2025, { revenue: 0, netProfit: 0 }),
        } },
      },
    },
    {
      ...common,
      id: idOffset + 3,
      reportType: "cashFlow" as const,
      workpaperId: idOffset + 3,
      reportPayload: {
        httpStatus: 200,
        payload: { lines: [
          line("salesReceipt", 100, { direction: "in" }),
          line("operatingNet", 100, { direction: "net", isTotal: true }),
          line("investingNet", 0, { direction: "net", isTotal: true }),
          line("financingNet", 0, { direction: "net", isTotal: true }),
          line("fxEffect", 0, { direction: "in" }),
          line("netIncrease", 100, { direction: "net", isGrandTotal: true }),
          line("openingCash", 0, { direction: "in" }),
          line("endingCash", 100, { direction: "net", isGrandTotal: true }),
        ] },
        translationFacts: { monthlyFlows: {
          current: monthlyFlowFacts(2026, { salesReceipt: 100, operatingNet: 100, investingNet: 0, financingNet: 0, fxEffect: 0, netIncrease: 100, openingCash: 0, endingCash: 100 }),
          comparative: monthlyFlowFacts(2025, { salesReceipt: 0, operatingNet: 0, investingNet: 0, financingNet: 0, fxEffect: 0, netIncrease: 0, openingCash: 0, endingCash: 0 }),
        } },
      },
    },
  ];
}

function rateApplication(
  applicationType: "closing" | "flowAverage" | "cashPoint" | "historicalInvestment",
  entitySnapshotId: number,
  voucherItemId?: number,
  periodBasis: "current" | "comparative" = "current",
  targetDate?: string,
): ConsolidationReplayPackage["exchangeRates"][number]["applications"][number] {
  const historical = applicationType === "historicalInvestment";
  return {
    applicationType,
    periodBasis,
    entitySnapshotId,
    voucherItemId: voucherItemId ?? null,
    targetDate: targetDate ?? (historical ? "2020-01-01" : "2026-12-31"),
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

function appliedRate(
  exchangeRateId: number,
  rateKind: "centralParity" | "monthlyAverage",
  rate: number,
  entitySnapshotId: number,
  applicationType: "closing" | "flowAverage" | "cashPoint",
  periodBasis: "current" | "comparative",
  targetDate: string,
): ConsolidationReplayPackage["exchangeRates"][number] {
  return {
    id: exchangeRateId + 100,
    exchangeRateId,
    exchangeRateVersion: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind,
    rateDate: targetDate,
    rate,
    sourceUrl: "https://www.chinamoney.com.cn/chinese/bkccpr/",
    publishedAt: null,
    recordedBy: 9,
    recordedAt: "2027-01-02T00:00:00.000Z",
    applications: [rateApplication(applicationType, entitySnapshotId, undefined, periodBasis, targetDate)],
  };
}

function translationRates(entitySnapshotId: number, rate: number) {
  let exchangeRateId = entitySnapshotId * 100;
  const rates = [
    appliedRate(exchangeRateId++, "centralParity", rate, entitySnapshotId, "closing", "current", "2026-12-31"),
    appliedRate(exchangeRateId++, "centralParity", rate, entitySnapshotId, "closing", "comparative", "2025-12-31"),
  ];
  for (const [periodBasis, year] of [["current", 2026], ["comparative", 2025]] as const) {
    for (let month = 1; month <= 12; month += 1) {
      const targetDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      rates.push(appliedRate(exchangeRateId++, "monthlyAverage", rate, entitySnapshotId, "flowAverage", periodBasis, targetDate));
    }
  }
  for (const [periodBasis, dates] of [
    ["current", ["2025-12-31", "2026-11-30"]],
    ["comparative", ["2024-12-31", "2025-11-30"]],
  ] as const) {
    for (const targetDate of dates) {
      rates.push(appliedRate(exchangeRateId++, "centralParity", rate, entitySnapshotId, "cashPoint", periodBasis, targetDate));
    }
  }
  return rates;
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

function flowRate(
  exchangeRateId: number,
  rateDate: string,
  rate: number,
  entitySnapshotId: number,
  periodBasis: "current" | "comparative",
): ConsolidationReplayPackage["exchangeRates"][number] {
  return {
    id: exchangeRateId + 100,
    exchangeRateId,
    exchangeRateVersion: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind: "monthlyAverage",
    rateDate,
    rate,
    sourceUrl: "https://www.chinamoney.com.cn/",
    publishedAt: null,
    recordedBy: 9,
    recordedAt: "2027-01-02T00:00:00.000Z",
    applications: [{
      applicationType: "flowAverage",
      periodBasis,
      entitySnapshotId,
      voucherItemId: null,
      targetDate: rateDate,
      evidence: "月平均汇率",
      voucher: null,
    }],
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
    ...translationRates(101, 5.32),
    frozenRate(7, "historicalInvestment", 4.8, 101),
  ];
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
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
    ...translationRates(101, 5.32),
    frozenRate(7, "historicalInvestment", 4.8, 101),
  ];
  const payload = replay.sources[0]!.reportPayload as {
    payload: { liabilities: Array<{ lineCode: string }> };
  };
  payload.payload.liabilities = payload.payload.liabilities.filter((item) => item.lineCode !== "totalLiabilities");
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const balance = result.data.statements.find((item) => item.reportType === "balanceSheet")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "totalLiabilities")?.amount, 425.6);
});

test("two CAD entities use their own closing and historical applications", () => {
  const replay = replayPackage([101, 102]);
  replay.exchangeRates = [
    ...translationRates(101, 5.32),
    frozenRate(13, "historicalInvestment", 4.8, 101),
    ...translationRates(102, 4.8),
    frozenRate(23, "historicalInvestment", 4.5, 102),
  ];
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"], [102, "CAD"]]));
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
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
    ...translationRates(101, 5.32).filter((rate) => !rate.applications.some((application) => (
      application.applicationType === "closing" && application.periodBasis === "comparative"
    ))),
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

test("CAD retained earnings use the approved opening and monthly translated profit", () => {
  const replay = replayPackage();
  replay.exchangeRates = [
    ...translationRates(101, 5.32),
    frozenRate(7, "historicalInvestment", 4.8, 101),
  ];
  const payload = replay.sources[0]!.reportPayload as {
    translationFacts?: { retainedEarningsOpening?: unknown };
    payload: { equity: Array<ReturnType<typeof line>> };
  };
  payload.payload.equity.find((item) => item.lineCode === "paidInCapital")!.amount = 60;
  payload.payload.equity.splice(1, 0, line("undistributedProfit", 200, {
    section: "equity",
    side: "credit",
  }));
  payload.translationFacts = { retainedEarningsOpening: {
    openingDate: "2025-12-31",
    presentationCurrencyCode: "CNY",
    openingAmount: 0,
    evidence: "批准底稿",
  } };
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const balance = result.data.statements.find((statement) => statement.reportType === "balanceSheet")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "undistributedProfit")?.amount, 1_064);
});

test("CAD flow statements use monthly averages and retained earnings roll from the approved CNY opening", () => {
  const replay = replayPackage();
  replay.batch.month = 2;
  replay.exchangeRates = [
    frozenRate(5, "closing", 4.8, 101),
    frozenRate(7, "historicalInvestment", 4.8, 101),
    flowRate(31, "2026-01-31", 5, 101, "current"),
    flowRate(32, "2026-02-28", 4, 101, "current"),
    flowRate(41, "2025-01-31", 5.2, 101, "comparative"),
    flowRate(42, "2025-02-28", 5.1, 101, "comparative"),
  ];
  const income = replay.sources.find((source) => source.reportType === "incomeStatement")!;
  income.reportPayload = {
    ...(income.reportPayload as object),
    translationFacts: {
      monthlyFlows: {
        current: [
          { periodEnd: "2026-01-31", lines: [{ lineCode: "revenue", amount: 100 }, { lineCode: "netProfit", amount: 100 }] },
          { periodEnd: "2026-02-28", lines: [{ lineCode: "revenue", amount: 100 }, { lineCode: "netProfit", amount: 100 }] },
        ],
        comparative: [
          { periodEnd: "2025-01-31", lines: [{ lineCode: "revenue", amount: 0 }, { lineCode: "netProfit", amount: 0 }] },
          { periodEnd: "2025-02-28", lines: [{ lineCode: "revenue", amount: 0 }, { lineCode: "netProfit", amount: 0 }] },
        ],
      },
    },
  };
  const cashFlow = replay.sources.find((source) => source.reportType === "cashFlow")!;
  delete (cashFlow.reportPayload as { translationFacts?: unknown }).translationFacts;
  const balance = replay.sources.find((source) => source.reportType === "balanceSheet")!;
  const balancePayload = balance.reportPayload as { payload: { equity: Array<ReturnType<typeof line>> } };
  const retained = line("undistributedProfit", 100, { section: "equity", side: "credit" });
  retained.previousAmount = -100;
  balancePayload.payload.equity.splice(1, 0, retained);
  balance.reportPayload = {
    ...balancePayload,
    translationFacts: {
      retainedEarningsOpening: {
        key: "approved-opening",
        foreignCompanyCode: "02",
        openingDate: "2025-12-31",
        presentationCurrencyCode: "CNY",
        openingAmount: -500,
        evidence: "财务负责人批准",
      },
    },
  };
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const outputIncome = result.data.statements.find((statement) => statement.reportType === "incomeStatement")!;
  const outputBalance = result.data.statements.find((statement) => statement.reportType === "balanceSheet")!;
  assert.equal(outputIncome.lines.find((item) => item.lineCode === "revenue")?.amount, 900);
  assert.equal(outputBalance.lines.find((item) => item.lineCode === "undistributedProfit")?.amount, 400);
  assert.equal(outputBalance.lines.find((item) => item.lineCode === "undistributedProfit")?.previousAmount, -500);
});

function roundingCashFlowReplay() {
  const replay = replayPackage();
  replay.exchangeRates = [
    ...translationRates(101, 1.5),
    frozenRate(7, "historicalInvestment", 1.5, 101),
  ];
  const cashFlow = replay.sources.find((source) => source.reportType === "cashFlow")!;
  const currentAmounts = {
    salesReceipt: 0,
    taxRefund: 0,
    otherOpIn: 0,
    operatingInSubtotal: 0,
    purchasePayment: 3.33,
    staffPayment: 3.33,
    taxPayment: 0,
    otherOpOut: 0,
    operatingOutSubtotal: 6.66,
    operatingNet: -6.66,
    investingNet: 0,
    financingNet: 0,
    fxEffect: 0,
    netIncrease: -6.66,
    openingCash: 10,
    endingCash: 3.34,
  };
  const cashLines = Object.entries(currentAmounts).map(([lineCode, amount]) => line(lineCode, amount, {
    direction: lineCode.includes("Out") || lineCode.endsWith("Payment") ? "out" : lineCode.includes("Net") ? "net" : "in",
    isTotal: lineCode.endsWith("Subtotal") || ["operatingNet", "investingNet", "financingNet"].includes(lineCode),
    isGrandTotal: ["netIncrease", "endingCash"].includes(lineCode),
  }));
  cashFlow.reportPayload = {
    httpStatus: 200,
    payload: { lines: cashLines },
    translationFacts: { monthlyFlows: {
      current: monthlyFlowFacts(2026, currentAmounts),
      comparative: monthlyFlowFacts(2025, Object.fromEntries(Object.keys(currentAmounts).map((code) => [code, 0]))),
    } },
  };
  return replay;
}

test("CAD cash flow rejects a cent missing between monthly source facts and the cumulative source report", () => {
  const replay = roundingCashFlowReplay();
  const cashFlow = replay.sources.find((source) => source.reportType === "cashFlow")!;
  const payload = cashFlow.reportPayload as {
    payload: { lines: Array<{ lineCode: string; amount: number }> };
  };
  payload.payload.lines.find((item) => item.lineCode === "purchasePayment")!.amount = 3.32;
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "cashFlowSourceReconciliation");
});
