import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationPriorReferences } from "@workspace/finance/types";
import { buildConsolidatedReportOutput } from "./consolidated-output";
import type { ConsolidationReplayPackage } from "./consolidation-replay";

const MONTH_ENDS_2026_H1 = ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"];

function line(
  lineCode: string,
  amount: number,
  previousAmount: number,
  input: Partial<{
    section: string;
    side: "debit" | "credit";
    direction: "in" | "out" | "net";
    isTotal: boolean;
    isGrandTotal: boolean;
    currentMonthAmount: number;
  }> = {},
) {
  return {
    lineCode,
    label: lineCode,
    code: lineCode,
    amount,
    previousAmount,
    section: input.section ?? "operating",
    side: input.side ?? "debit",
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.isTotal ? { isTotal: true as const } : {}),
    ...(input.isGrandTotal ? { isGrandTotal: true as const } : {}),
    ...(input.currentMonthAmount === undefined ? {} : { currentMonthAmount: input.currentMonthAmount }),
  };
}

function cadEntity() {
  return {
    id: 2,
    companyId: 2,
    companyCode: "02",
    companyName: "加拿大子公司",
    role: "subsidiary" as const,
    directParentCompanyId: 1,
    directParentCode: "01",
    relationId: 2,
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

function parentEntity() {
  return {
    ...cadEntity(),
    id: 1,
    companyId: 1,
    companyCode: "01",
    companyName: "母公司",
    role: "parent" as const,
    directParentCompanyId: null,
    directParentCode: null,
    relationId: null,
    relationVersion: null,
    functionalCurrency: "CNY",
    currencyEvidence: "母公司本位币",
  };
}

function monthlyFlows(amountsByMonth: Record<string, number[]>, lineCodes: string[]) {
  return MONTH_ENDS_2026_H1.map((periodEnd, index) => ({
    periodEnd,
    lines: lineCodes.map((lineCode) => ({
      lineCode,
      amount: amountsByMonth[lineCode]?.[index] ?? 0,
    })),
  }));
}

const CF_FLOW_LINE_CODES = [
  "salesReceipt",
  "operatingInSubtotal",
  "purchasePayment",
  "operatingOutSubtotal",
  "operatingNet",
  "investingNet",
  "financingNet",
  "fxEffect",
  "netIncrease",
];
const IS_FLOW_LINE_CODES = ["revenue", "netProfit"];

function sourcePayloads(input: { comparativeFlows?: boolean; zeroPrevious?: boolean }) {
  const zeroPrevious = input.zeroPrevious === true;
  const bsPrevious = (amount: number) => zeroPrevious ? 0 : amount;
  const common = {
    entitySnapshotId: 2,
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
  const flowFacts = (lineCodes: string[], amountsByMonth: Record<string, number[]>) => ({
    monthlyFlows: {
      current: monthlyFlows(amountsByMonth, lineCodes),
      ...(input.comparativeFlows
        ? { comparative: monthlyFlows(Object.fromEntries(lineCodes.map((code) => [code, [30, 0, 0, 0, 0, 0]])), lineCodes) }
        : {}),
    },
  });
  return [
    {
      ...common,
      id: 11,
      reportType: "balanceSheet" as const,
      workpaperId: 11,
      reportPayload: { httpStatus: 200, payload: {
        assets: [
          line("cash", 150, bsPrevious(50), { section: "currentAssets" }),
          line("totalCurrentAssets", 150, bsPrevious(50), { section: "currentAssets", isTotal: true }),
          line("totalAssets", 150, bsPrevious(50), { section: "nonCurrentAssets", isGrandTotal: true }),
        ],
        liabilities: [
          line("payables", 80, bsPrevious(20), { section: "currentLiabilities", side: "credit" }),
          line("totalCurrentLiabilities", 80, bsPrevious(20), { section: "currentLiabilities", side: "credit", isTotal: true }),
          line("totalLiabilities", 80, bsPrevious(20), { section: "liabilities", side: "credit", isGrandTotal: true }),
        ],
        equity: [
          line("paidInCapital", 70, bsPrevious(30), { section: "equity", side: "credit" }),
          line("otherComprehensiveIncome", 0, 0, { section: "equity", side: "credit" }),
          line("totalEquity", 70, bsPrevious(30), { section: "equity", side: "credit", isTotal: true }),
        ],
      } },
    },
    {
      ...common,
      id: 12,
      reportType: "incomeStatement" as const,
      workpaperId: 12,
      reportPayload: {
        httpStatus: 200,
        payload: { lines: [
          line("revenue", 200, bsPrevious(30), { side: "credit", currentMonthAmount: 50 }),
          line("netProfit", 200, bsPrevious(30), { isGrandTotal: true, currentMonthAmount: 50 }),
        ] },
        translationFacts: flowFacts(IS_FLOW_LINE_CODES, {
          revenue: [150, 0, 0, 0, 0, 50],
          netProfit: [150, 0, 0, 0, 0, 50],
        }),
      },
    },
    {
      ...common,
      id: 13,
      reportType: "cashFlow" as const,
      workpaperId: 13,
      reportPayload: {
        httpStatus: 200,
        payload: { lines: [
          line("salesReceipt", 200, bsPrevious(30), { direction: "in", currentMonthAmount: 50 }),
          line("operatingInSubtotal", 200, bsPrevious(30), { direction: "in", isTotal: true, currentMonthAmount: 50 }),
          line("purchasePayment", 0, 0, { direction: "out", currentMonthAmount: 0 }),
          line("operatingOutSubtotal", 0, 0, { direction: "out", isTotal: true, currentMonthAmount: 0 }),
          line("operatingNet", 200, bsPrevious(30), { direction: "net", isTotal: true, currentMonthAmount: 50 }),
          line("investingNet", 0, 0, { direction: "net", isTotal: true, currentMonthAmount: 0 }),
          line("financingNet", 0, 0, { direction: "net", isTotal: true, currentMonthAmount: 0 }),
          line("fxEffect", 0, 0, { direction: "in", currentMonthAmount: 0 }),
          line("netIncrease", 200, bsPrevious(30), { direction: "net", isGrandTotal: true, currentMonthAmount: 50 }),
          line("openingCash", 100, bsPrevious(90), { direction: "in", currentMonthAmount: 110 }),
          line("endingCash", 300, bsPrevious(120), { direction: "net", isGrandTotal: true, currentMonthAmount: 160 }),
        ] },
        translationFacts: flowFacts(CF_FLOW_LINE_CODES, {
          salesReceipt: [150, 0, 0, 0, 0, 50],
          operatingInSubtotal: [150, 0, 0, 0, 0, 50],
          purchasePayment: [0, 0, 0, 0, 0, 0],
          operatingOutSubtotal: [0, 0, 0, 0, 0, 0],
          operatingNet: [150, 0, 0, 0, 0, 50],
          investingNet: [0, 0, 0, 0, 0, 0],
          financingNet: [0, 0, 0, 0, 0, 0],
          fxEffect: [0, 0, 0, 0, 0, 0],
          netIncrease: [150, 0, 0, 0, 0, 50],
        }),
      },
    },
  ];
}

function appliedRate(
  exchangeRateId: number,
  rateKind: "centralParity" | "monthlyAverage",
  rate: number,
  applicationType: "closing" | "flowAverage" | "cashPoint",
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
    applications: [{
      applicationType,
      periodBasis: "current",
      entitySnapshotId: 2,
      voucherItemId: null,
      targetDate,
      evidence: "折算证据",
      voucher: null,
    }],
  };
}

function historicalCapitalRate(): ConsolidationReplayPackage["exchangeRates"][number] {
  return {
    id: 707,
    exchangeRateId: 7,
    exchangeRateVersion: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind: "historicalInvestment",
    rateDate: "2020-01-01",
    rate: 4.5,
    sourceUrl: "https://www.boc.cn/sourcedb/whpj/",
    publishedAt: null,
    recordedBy: 9,
    recordedAt: "2027-01-02T00:00:00.000Z",
    applications: [{
      applicationType: "historicalInvestment",
      periodBasis: "current",
      entitySnapshotId: 2,
      voucherItemId: 1_007,
      targetDate: "2020-01-01",
      evidence: "投资日凭证",
      voucher: {
        companyCode: "01",
        voucherNo: "投-1007",
        voucherDate: "2020-01-01",
        description: "对境外子公司出资",
        accountCode: "1511",
        bookedAmountCny: 315,
        currencyCode: "CAD",
        originalAmount: 70,
        matchingLineCode: "paidInCapital",
      },
    }],
  };
}

function currentRates(input: { withCashPoint?: boolean } = {}) {
  return [
    appliedRate(101, "centralParity", 5, "closing", "2026-06-30"),
    ...MONTH_ENDS_2026_H1.map((targetDate, index) => appliedRate(200 + index, "monthlyAverage", 5, "flowAverage", targetDate)),
    ...(input.withCashPoint
      ? [
        appliedRate(301, "centralParity", 5, "cashPoint", "2025-12-31"),
        appliedRate(302, "centralParity", 5, "cashPoint", "2026-05-31"),
      ]
      : []),
    historicalCapitalRate(),
  ];
}

function replayPackage(input: {
  priorReferences?: ConsolidationPriorReferences;
  comparativeFlows?: boolean;
  zeroPrevious?: boolean;
  withCashPoint?: boolean;
} = {}): ConsolidationReplayPackage {
  return {
    batch: {
      id: 1,
      parentCompanyId: 1,
      parentCompanyCode: "01",
      parentCompanyName: "母公司",
      year: 2026,
      month: 6,
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
    entities: [parentEntity(), cadEntity()],
    sources: sourcePayloads({ comparativeFlows: input.comparativeFlows, zeroPrevious: input.zeroPrevious }),
    exchangeRates: currentRates({ withCashPoint: input.withCashPoint }),
    approvedEntries: [],
    controlDecisions: [],
    events: [],
    ...(input.priorReferences ? { priorReferences: input.priorReferences } : {}),
    fingerprintVerification: {
      scope: { stored: "scope", recomputed: "scope" },
      sources: { stored: "sources", recomputed: "sources" },
      rates: { stored: "rates", recomputed: "rates" },
    },
  };
}

function priorReferencesFixture(): ConsolidationPriorReferences {
  return {
    yearOpening: {
      batchId: 11,
      year: 2025,
      month: 12,
      companies: { 2: {
        balanceSheet: [
          { lineCode: "cash", cnyAmount: 260, sourceAmount: 50 },
          { lineCode: "totalCurrentAssets", cnyAmount: 260, sourceAmount: 50 },
          { lineCode: "totalAssets", cnyAmount: 260, sourceAmount: 50 },
          { lineCode: "payables", cnyAmount: 104, sourceAmount: 20 },
          { lineCode: "totalCurrentLiabilities", cnyAmount: 104, sourceAmount: 20 },
          { lineCode: "totalLiabilities", cnyAmount: 104, sourceAmount: 20 },
          { lineCode: "paidInCapital", cnyAmount: 144, sourceAmount: 30 },
          { lineCode: "otherComprehensiveIncome", cnyAmount: 12, sourceAmount: 0 },
          { lineCode: "totalEquity", cnyAmount: 156, sourceAmount: 30 },
        ],
        cashFlow: [{ lineCode: "endingCash", cnyAmount: 500, sourceAmount: 100 }],
      } },
    },
    comparativePeriod: {
      batchId: 12,
      year: 2025,
      month: 6,
      companies: { 2: {
        incomeStatement: [
          { lineCode: "revenue", cnyAmount: 150, sourceAmount: 30 },
          { lineCode: "netProfit", cnyAmount: 150, sourceAmount: 30 },
        ],
        cashFlow: [
          { lineCode: "salesReceipt", cnyAmount: 150, sourceAmount: 30 },
          { lineCode: "operatingInSubtotal", cnyAmount: 150, sourceAmount: 30 },
          { lineCode: "purchasePayment", cnyAmount: 0, sourceAmount: 0 },
          { lineCode: "operatingOutSubtotal", cnyAmount: 0, sourceAmount: 0 },
          { lineCode: "operatingNet", cnyAmount: 150, sourceAmount: 30 },
          { lineCode: "investingNet", cnyAmount: 0, sourceAmount: 0 },
          { lineCode: "financingNet", cnyAmount: 0, sourceAmount: 0 },
          { lineCode: "fxEffect", cnyAmount: 0, sourceAmount: 0 },
          { lineCode: "netIncrease", cnyAmount: 150, sourceAmount: 30 },
          { lineCode: "openingCash", cnyAmount: 450, sourceAmount: 90 },
          { lineCode: "endingCash", cnyAmount: 600, sourceAmount: 120 },
        ],
      } },
    },
    monthOpening: {
      batchId: 13,
      year: 2026,
      month: 5,
      companies: { 2: {
        cashFlow: [{ lineCode: "endingCash", cnyAmount: 550, sourceAmount: 110 }],
      } },
    },
  };
}

const FUNCTIONAL_CURRENCIES = new Map([[1, "CNY"], [2, "CAD"]]);

// 输出含每次构建生成的时间戳与折算依据 trace;比较"数值结果一致"时剔除。
function normalizeOutput(data: unknown) {
  return JSON.parse(JSON.stringify(data, (key, value) => (
    key === "generatedAt" || key === "translationTrace" ? undefined : value
  )));
}

function buildWith(priorReferences?: ConsolidationPriorReferences, input: { zeroPrevious?: boolean; withCashPoint?: boolean } = {}) {
  return buildConsolidatedReportOutput(
    replayPackage({ priorReferences, zeroPrevious: input.zeroPrevious, withCashPoint: input.withCashPoint }),
    FUNCTIONAL_CURRENCIES,
  );
}

function statementLine(
  result: ReturnType<typeof buildConsolidatedReportOutput> & { ok: true },
  reportType: "balanceSheet" | "incomeStatement" | "cashFlow",
  lineCode: string,
) {
  const statement = result.data.statements.find((item) => item.reportType === reportType)!;
  return statement.lines.find((item) => item.lineCode === lineCode)!;
}

test("资产负债表比较期列引用上年年末批次输出(含权益历史汇率行)", () => {
  const result = buildWith(priorReferencesFixture());
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  assert.equal(statementLine(result, "balanceSheet", "cash").previousAmount, 260);
  assert.equal(statementLine(result, "balanceSheet", "payables").previousAmount, 104);
  assert.equal(statementLine(result, "balanceSheet", "paidInCapital").previousAmount, 144);
  assert.equal(statementLine(result, "balanceSheet", "totalAssets").previousAmount, 260);
  assert.equal(statementLine(result, "balanceSheet", "totalEquity").previousAmount, 156);
  const cash = statementLine(result, "balanceSheet", "cash");
  const trace = cash.entityAmounts?.find((entity) => entity.entitySnapshotId === 2)?.translationTrace;
  assert.equal(trace?.comparative.basis, "priorReference");
});

test("利润表与现金流量表比较期列引用上年同月批次输出", () => {
  const result = buildWith(priorReferencesFixture());
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  assert.equal(statementLine(result, "incomeStatement", "revenue").previousAmount, 150);
  assert.equal(statementLine(result, "incomeStatement", "netProfit").previousAmount, 150);
  assert.equal(statementLine(result, "cashFlow", "salesReceipt").previousAmount, 150);
  assert.equal(statementLine(result, "cashFlow", "openingCash").previousAmount, 450);
  assert.equal(statementLine(result, "cashFlow", "endingCash").previousAmount, 600);
  assert.equal(statementLine(result, "cashFlow", "netIncrease").previousAmount, 150);
  const trace = statementLine(result, "cashFlow", "openingCash")
    .entityAmounts?.find((entity) => entity.entitySnapshotId === 2)?.translationTrace;
  assert.equal(trace?.comparative.basis, "priorReference");
});

test("现金流量表期初现金引用上年年末与上月批次的期末现金", () => {
  const result = buildWith(priorReferencesFixture());
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const opening = statementLine(result, "cashFlow", "openingCash");
  assert.equal(opening.amount, 500);
  assert.equal(opening.currentMonthAmount, 550);
  const trace = opening.entityAmounts?.find((entity) => entity.entitySnapshotId === 2)?.translationTrace;
  assert.equal(trace?.current.basis, "priorReference");
  assert.equal(trace?.currentMonth?.basis, "priorReference");
  // 期末现金本期列仍走期末汇率。
  const endingTrace = statementLine(result, "cashFlow", "endingCash")
    .entityAmounts?.find((entity) => entity.entitySnapshotId === 2)?.translationTrace;
  assert.equal(endingTrace?.current.basis, "closing");
  assert.equal(statementLine(result, "cashFlow", "endingCash").amount, 1_500);
});

test("引用行原币与本期比较期原币不一致时返回 409", () => {
  const references = priorReferencesFixture();
  references.yearOpening!.companies[2]!.balanceSheet = references.yearOpening!.companies[2]!.balanceSheet!
    .map((reference) => reference.lineCode === "cash" ? { ...reference, sourceAmount: 999 } : reference);
  const result = buildWith(references);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issue.status, 409);
    assert.equal(result.issue.field, "priorReference");
  }
});

test("引用覆盖实体但缺少非零原币行时返回 409", () => {
  const references = priorReferencesFixture();
  references.yearOpening!.companies[2]!.balanceSheet = references.yearOpening!.companies[2]!.balanceSheet!
    .filter((reference) => reference.lineCode !== "paidInCapital");
  const result = buildWith(references);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "priorReference");
});

test("引用缺失或部分缺失时回退汇率路径且结果与无引用一致", () => {
  const options = { zeroPrevious: true, withCashPoint: true } as const;
  const baseline = buildWith(undefined, options);
  assert.equal(baseline.ok, true, baseline.ok ? undefined : JSON.stringify(baseline.issue));
  const allNull = buildWith({ yearOpening: null, comparativePeriod: null, monthOpening: null }, options);
  assert.equal(allNull.ok, true, allNull.ok ? undefined : JSON.stringify(allNull.issue));
  const entityNotCovered = buildWith({
    yearOpening: { batchId: 11, year: 2025, month: 12, companies: {} },
    comparativePeriod: { batchId: 12, year: 2025, month: 6, companies: {} },
    monthOpening: { batchId: 13, year: 2026, month: 5, companies: {} },
  }, options);
  assert.equal(entityNotCovered.ok, true, entityNotCovered.ok ? undefined : JSON.stringify(entityNotCovered.issue));
  // 覆盖实体但行缺失且原币为零 → 按零处理;期初现金引用与汇率路径数值一致(时点汇率同为 5)。
  const coveredEmptyLines = buildWith({
    yearOpening: { batchId: 11, year: 2025, month: 12, companies: { 2: {
      balanceSheet: [],
      cashFlow: [{ lineCode: "endingCash", cnyAmount: 500, sourceAmount: 100 }],
    } } },
    comparativePeriod: { batchId: 12, year: 2025, month: 6, companies: { 2: { incomeStatement: [], cashFlow: [] } } },
    monthOpening: { batchId: 13, year: 2026, month: 5, companies: { 2: {
      cashFlow: [{ lineCode: "endingCash", cnyAmount: 550, sourceAmount: 110 }],
    } } },
  }, options);
  assert.equal(coveredEmptyLines.ok, true, coveredEmptyLines.ok ? undefined : JSON.stringify(coveredEmptyLines.issue));
  if (!baseline.ok || !allNull.ok || !entityNotCovered.ok || !coveredEmptyLines.ok) return;
  assert.deepEqual(normalizeOutput(allNull.data), normalizeOutput(baseline.data));
  assert.deepEqual(normalizeOutput(entityNotCovered.data), normalizeOutput(baseline.data));
  assert.deepEqual(normalizeOutput(coveredEmptyLines.data), normalizeOutput(baseline.data));
});
