import assert from "node:assert/strict";
import test from "node:test";

import { buildConsolidatedReportOutput } from "./consolidated-output";
import type { ConsolidationReplayPackage } from "./consolidation-replay";
import { buildTranslatedStandaloneStatementsFromReplay } from "./statement-page-data";
import { frozenPayloadLines, translateFrozenSourceLines } from "./consolidated-output-translation";

type RateApplication = ConsolidationReplayPackage["exchangeRates"][number]["applications"][number];

function line(
  lineCode: string,
  amount: number,
  input: Partial<{
    previousAmount: number;
    currentMonthAmount: number;
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
    previousAmount: input.previousAmount ?? 0,
    ...(input.currentMonthAmount === undefined ? {} : { currentMonthAmount: input.currentMonthAmount }),
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

function monthlyPeriods(linesByMonth: Array<Array<ReturnType<typeof line>>>, year: number) {
  return linesByMonth.map((lines, index) => ({
    year,
    month: index + 1,
    lines: lines.map((item) => ({ lineCode: item.lineCode, label: item.label, amount: item.currentMonthAmount ?? item.amount })),
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
    selectedAt: "2026-03-01T00:00:00.000Z",
  };
  const incomeLines = [
    line("revenue", 200, { side: "credit", currentMonthAmount: 100 }),
    line("netProfit", 200, { currentMonthAmount: 100, isGrandTotal: true }),
  ];
  const incomeMonth = (amount: number) => [
    line("revenue", amount, { side: "credit", currentMonthAmount: amount }),
    line("netProfit", amount, { currentMonthAmount: amount, isGrandTotal: true }),
  ];
  const cashLines = [
    line("salesReceipt", 0, { direction: "in", currentMonthAmount: 0 }),
    line("operatingInSubtotal", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("operatingOutSubtotal", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("operatingNet", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("investingInSubtotal", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("investingOutSubtotal", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("investingNet", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("financingInSubtotal", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("financingOutSubtotal", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("financingNet", 0, { direction: "net", currentMonthAmount: 0, isTotal: true }),
    line("fxEffect", 0, { direction: "net", currentMonthAmount: 0 }),
    line("netIncrease", 0, { direction: "net", currentMonthAmount: 0, isGrandTotal: true }),
    line("openingCash", 0, { direction: "in", currentMonthAmount: 0 }),
    line("endingCash", 0, { direction: "net", currentMonthAmount: 0, isGrandTotal: true }),
  ];
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
        payload: { lines: incomeLines },
        monthlyPeriods: {
          current: monthlyPeriods([incomeMonth(100), incomeMonth(100)], 2026),
          comparative: monthlyPeriods([incomeMonth(0), incomeMonth(0)], 2025),
        },
      },
    },
    {
      ...common,
      id: idOffset + 3,
      reportType: "cashFlow" as const,
      workpaperId: idOffset + 3,
      reportPayload: {
        httpStatus: 200,
        payload: { lines: cashLines },
        monthlyPeriods: {
          current: monthlyPeriods([cashLines, cashLines], 2026),
          comparative: monthlyPeriods([cashLines, cashLines], 2025),
        },
      },
    },
  ];
}

function application(input: Partial<RateApplication> & Pick<RateApplication, "applicationType" | "entitySnapshotId" | "targetDate">): RateApplication {
  return {
    periodBasis: "current",
    voucherItemId: null,
    evidence: "冻结汇率证据",
    voucher: null,
    ...input,
  };
}

function frozenRate(
  exchangeRateId: number,
  rateKind: ConsolidationReplayPackage["exchangeRates"][number]["rateKind"],
  rateDate: string,
  rate: number,
  applications: RateApplication[],
): ConsolidationReplayPackage["exchangeRates"][number] {
  return {
    id: exchangeRateId + 100,
    exchangeRateId,
    exchangeRateVersion: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind,
    rateDate,
    rate,
    sourceUrl: "https://www.chinamoney.com.cn/",
    publishedAt: null,
    recordedBy: 9,
    recordedAt: "2026-03-01T00:00:00.000Z",
    applications,
  };
}

function entityRates(entitySnapshotId: number, januaryAverage = 5, februaryAverage = 6, closing = 5.32) {
  return [
    frozenRate(10 + entitySnapshotId, "centralParity", "2026-02-28", closing, [application({ applicationType: "closing", entitySnapshotId, targetDate: "2026-02-28" })]),
    frozenRate(20 + entitySnapshotId, "monthlyAverage", "2026-01-31", januaryAverage, [application({ applicationType: "monthlyAverage", entitySnapshotId, targetDate: "2026-01-31" })]),
    frozenRate(30 + entitySnapshotId, "monthlyAverage", "2026-02-28", februaryAverage, [application({ applicationType: "monthlyAverage", entitySnapshotId, targetDate: "2026-02-28" })]),
    frozenRate(40 + entitySnapshotId, "centralParity", "2020-01-01", 4.8, [application({
      applicationType: "historicalCapital",
      entitySnapshotId,
      targetDate: "2020-01-01",
      capitalOriginalAmount: 70,
      equityLineCode: "paidInCapital",
    })]),
  ];
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
      month: 2,
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
      submittedAt: "2026-03-02T00:00:00.000Z",
      reviewedBy: 3,
      reviewedAt: "2026-03-03T00:00:00.000Z",
      reviewNote: "同意",
      lockedBy: 3,
      lockedAt: "2026-03-04T00:00:00.000Z",
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

test("CAD uses closing rates, historical equity, and monthly accumulated income", () => {
  const replay = replayPackage();
  replay.exchangeRates = entityRates(101);
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((item) => item.reportType === "balanceSheet")!;
  const income = result.data.statements.find((item) => item.reportType === "incomeStatement")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "cash")?.amount, 798);
  assert.equal(balance.lines.find((item) => item.lineCode === "paidInCapital")?.amount, 336);
  assert.equal(balance.lines.find((item) => item.lineCode === "otherComprehensiveIncome")?.amount, 36.4);
  assert.equal(income.lines.find((item) => item.lineCode === "revenue")?.amount, 1_100);
});

test("CAD derives liabilities from section totals when source omits totalLiabilities", () => {
  const replay = replayPackage();
  replay.exchangeRates = entityRates(101);
  const payload = replay.sources[0]!.reportPayload as { payload: { liabilities: Array<{ lineCode: string }> } };
  payload.payload.liabilities = payload.payload.liabilities.filter((item) => item.lineCode !== "totalLiabilities");
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((item) => item.reportType === "balanceSheet")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "totalLiabilities")?.amount, 425.6);
});

test("two CAD entities use their own closing, monthly, and historical rates", () => {
  const replay = replayPackage([101, 102]);
  replay.exchangeRates = [...entityRates(101), ...entityRates(102, 4, 5, 4.8)];
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"], [102, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((item) => item.reportType === "balanceSheet")!;
  const income = result.data.statements.find((item) => item.reportType === "incomeStatement")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "cash")?.amount, 1_518);
  assert.equal(income.lines.find((item) => item.lineCode === "revenue")?.amount, 2_000);
});

test("CAD output blocks without an entity closing application", () => {
  const replay = replayPackage();
  replay.exchangeRates = entityRates(101).filter((rate) => rate.rateKind !== "centralParity" || rate.rateDate !== "2026-02-28");
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "rateApplications");
});

test("CAD retained earnings roll forward in CNY instead of using the closing rate", () => {
  const replay = replayPackage();
  const balancePayload = replay.sources[0]!.reportPayload as {
    payload: { equity: Array<ReturnType<typeof line>> };
    equityRollforward?: unknown;
  };
  balancePayload.payload.equity.find((item) => item.lineCode === "paidInCapital")!.amount = 60;
  balancePayload.payload.equity.splice(1, 0, line("undistributedProfit", 30, {
    previousAmount: 10,
    section: "equity",
    side: "credit",
  }));
  const rates = entityRates(101);
  const historicalCapital = rates.find((rate) => rate.rateDate === "2020-01-01")!;
  historicalCapital.applications[0]!.capitalOriginalAmount = 60;
  balancePayload.equityRollforward = {
    seed: {
      openingDate: "2025-12-31",
      originalAmount: 10,
      openingRetainedEarningsCny: 42,
      evidence: "经财务负责人批准的2025年末人民币未分配利润",
    },
    periods: [
      { year: 2026, month: 1, targetDate: "2026-01-31", closingOriginalAmount: 15, netProfitOriginalAmount: 5, otherAdjustmentOriginalAmount: 0 },
      { year: 2026, month: 2, targetDate: "2026-02-28", closingOriginalAmount: 30, netProfitOriginalAmount: 15, otherAdjustmentOriginalAmount: 0 },
    ],
  };
  rates.find((rate) => rate.rateDate === "2026-01-31")!.applications.push(application({
    applicationType: "historicalEquity",
    entitySnapshotId: 101,
    targetDate: "2026-01-31",
    capitalOriginalAmount: 5,
    equityLineCode: "undistributedProfit",
  }));
  rates.find((rate) => rate.rateDate === "2026-02-28" && rate.rateKind === "monthlyAverage")!.applications.push(application({
    applicationType: "historicalEquity",
    entitySnapshotId: 101,
    targetDate: "2026-02-28",
    capitalOriginalAmount: 15,
    equityLineCode: "undistributedProfit",
  }));
  replay.exchangeRates = rates;
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const balance = result.data.statements.find((statement) => statement.reportType === "balanceSheet")!;
  assert.equal(balance.lines.find((item) => item.lineCode === "undistributedProfit")?.amount, 157);
  assert.equal(balance.lines.find((item) => item.lineCode === "undistributedProfit")?.previousAmount, 42);
});

test("CAD uses the approved prior-year-end opening as its comparative amount", () => {
  const replay = replayPackage();
  replay.batch.month = 6;
  const source = replay.sources[0]!;
  const balancePayload = source.reportPayload as {
    payload: { equity: Array<ReturnType<typeof line>> };
    equityRollforward?: unknown;
  };
  balancePayload.payload.equity.find((item) => item.lineCode === "paidInCapital")!.amount = 60;
  balancePayload.payload.equity.splice(1, 0, line("undistributedProfit", 80, {
    previousAmount: 20,
    section: "equity",
    side: "credit",
  }));
  balancePayload.equityRollforward = {
    seed: {
      openingDate: "2025-12-31",
      originalAmount: 20,
      openingRetainedEarningsCny: 100,
      evidence: "经批准的2025年末人民币基准",
    },
    periods: ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]
      .map((targetDate, index) => ({
        year: 2026,
        month: index + 1,
        targetDate,
        closingOriginalAmount: 30 + index * 10,
        netProfitOriginalAmount: 10,
        otherAdjustmentOriginalAmount: 0,
      })),
  };
  replay.exchangeRates = [
    frozenRate(701, "centralParity", "2026-06-30", 5.4, [application({
      applicationType: "closing",
      entitySnapshotId: 101,
      targetDate: "2026-06-30",
    })]),
    ...["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]
      .map((targetDate, index) => frozenRate(702 + index, "monthlyAverage", targetDate, index + 1, [
        application({ applicationType: "monthlyAverage", entitySnapshotId: 101, targetDate }),
        application({
          applicationType: "historicalEquity",
          entitySnapshotId: 101,
          targetDate,
          capitalOriginalAmount: 10,
          equityLineCode: "undistributedProfit",
        }),
      ])),
    frozenRate(799, "centralParity", "2020-01-01", 4.8, [application({
      applicationType: "historicalCapital",
      entitySnapshotId: 101,
      targetDate: "2020-01-01",
      capitalOriginalAmount: 60,
      equityLineCode: "paidInCapital",
    })]),
  ];
  const rows = frozenPayloadLines("balanceSheet", source.reportPayload)!;
  const result = translateFrozenSourceLines(replay, 101, "CAD", "balanceSheet", rows, source.reportPayload);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const retained = result.data.find((item) => item.lineCode === "undistributedProfit")!;
  assert.equal(retained.amount, 310);
  assert.equal(retained.previousAmount, 100);
});

test("CAD standalone and consolidated entity contribution share the same translated read model", () => {
  const replay = replayPackage();
  replay.exchangeRates = entityRates(101);
  const standalone = buildTranslatedStandaloneStatementsFromReplay(replay, 101, "CAD");
  const consolidated = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(standalone.ok, true);
  assert.equal(consolidated.ok, true);
  if (!standalone.ok || !consolidated.ok) return;
  for (const statement of standalone.data) {
    const consolidatedStatement = consolidated.data.statements.find((item) => item.reportType === statement.reportType)!;
    for (const standaloneLine of statement.lines) {
      const entityAmount = consolidatedStatement.lines
        .find((line) => line.lineCode === standaloneLine.lineCode)
        ?.entityAmounts?.find((item) => item.entitySnapshotId === 101);
      assert.equal(entityAmount?.amount, standaloneLine.amount, `${statement.reportType}:${standaloneLine.lineCode}`);
    }
  }
});

test("CAD cash flow uses monthly averages, closing cash balances, and a reconciling FX effect", () => {
  const replay = replayPackage();
  const cashSource = replay.sources.find((source) => source.reportType === "cashFlow")!;
  const payload = cashSource.reportPayload as {
    payload: { lines: Array<ReturnType<typeof line>> };
    monthlyPeriods: { current: Array<{ lines: Array<{ lineCode: string; label: string; amount: number }> }> };
  };
  const amountsByMonth = [
    { salesReceipt: 10, openingCash: 20, endingCash: 31 },
    { salesReceipt: 20, openingCash: 31, endingCash: 53 },
  ];
  payload.monthlyPeriods.current.forEach((period, index) => {
    for (const item of period.lines) item.amount = amountsByMonth[index]![item.lineCode as keyof typeof amountsByMonth[number]] ?? 0;
  });
  const currentLines = payload.payload.lines;
  currentLines.find((item) => item.lineCode === "salesReceipt")!.amount = 30;
  currentLines.find((item) => item.lineCode === "salesReceipt")!.currentMonthAmount = 20;
  currentLines.find((item) => item.lineCode === "openingCash")!.amount = 20;
  currentLines.find((item) => item.lineCode === "openingCash")!.currentMonthAmount = 31;
  currentLines.find((item) => item.lineCode === "endingCash")!.amount = 53;
  currentLines.find((item) => item.lineCode === "endingCash")!.currentMonthAmount = 53;
  replay.exchangeRates = [
    ...entityRates(101, 4.5, 5.5, 6),
    frozenRate(601, "centralParity", "2025-12-31", 4, [application({ applicationType: "closing", entitySnapshotId: 101, targetDate: "2025-12-31" })]),
    frozenRate(602, "centralParity", "2026-01-31", 5, [application({ applicationType: "closing", entitySnapshotId: 101, targetDate: "2026-01-31" })]),
  ];
  const result = buildConsolidatedReportOutput(replay, new Map([[101, "CAD"]]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const cash = result.data.statements.find((statement) => statement.reportType === "cashFlow")!;
  assert.equal(cash.lines.find((item) => item.lineCode === "operatingNet")?.amount, 155);
  assert.equal(cash.lines.find((item) => item.lineCode === "openingCash")?.amount, 80);
  assert.equal(cash.lines.find((item) => item.lineCode === "endingCash")?.amount, 318);
  assert.equal(cash.lines.find((item) => item.lineCode === "fxEffect")?.amount, 83);
  assert.equal(cash.lines.find((item) => item.lineCode === "netIncrease")?.amount, 238);
  assert.equal(cash.lines.find((item) => item.lineCode === "fxEffect")?.currentMonthAmount, 53);
});
