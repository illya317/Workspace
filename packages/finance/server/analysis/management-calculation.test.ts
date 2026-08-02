import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCashScenarios,
  buildPerformanceKpis,
  buildRiskFindings,
  buildWorkingCapital,
  summarizeProfitability,
} from "./management-calculation";

test("profitability and working-capital formulas use period facts consistently", () => {
  const profit = summarizeProfitability({
    revenue: 1_000,
    cost: 600,
    sales: 50,
    admin: 80,
    rd: 20,
    finance: 10,
    tax: 10,
    operatingProfit: 230,
    totalProfit: 220,
    netProfit: 180,
  }, { revenue: 800, netProfit: 120 });
  assert.equal(profit.grossProfit, 400);
  assert.equal(profit.grossMargin, 0.4);
  assert.equal(profit.periodExpenses, 170);
  assert.equal(profit.revenueChangeRate, 0.25);

  const working = buildWorkingCapital({
    cash: 100,
    notesReceivable: 20,
    receivable: 180,
    inventory: 200,
    prepaid: 50,
    otherReceivableNet: 30,
    notesPayable: 10,
    payables: 190,
    advanceReceipts: 40,
    otherPayables: 60,
    totalCurrentAssets: 600,
    totalCurrentLiabilities: 400,
  }, {
    cash: 80,
    notesReceivable: 10,
    receivable: 110,
    inventory: 160,
    prepaid: 40,
    otherReceivableNet: 20,
    notesPayable: 20,
    payables: 140,
    advanceReceipts: 30,
    otherPayables: 50,
  }, 1_000, 600, 365);
  assert.equal(working.netWorkingCapital, 200);
  assert.equal(working.currentRatio, 1.5);
  assert.equal(working.quickRatio, 0.875);
  assert.equal(working.components.find((row) => row.key === "receivables")?.change, 80);
  assert.equal(working.receivableTurnover, 6.25);
  assert.equal(working.inventoryTurnover, 10 / 3);
  assert.equal(working.payableTurnover, 10 / 3);
  assert.equal(working.receivableDays, 58.4);
  assert.equal(working.inventoryDays, 109.5);
  assert.equal(working.payableDays, 109.5);
  assert.ok(Math.abs((working.cashConversionCycleDays ?? 0) - 58.4) < 1e-9);
});

test("returns null instead of misleading ratios when business denominators are not positive", () => {
  const working = buildWorkingCapital({
    cash: 10, receivable: -20, inventory: -30, payables: -40,
    totalCurrentAssets: 100, totalCurrentLiabilities: -50,
  }, {
    cash: 10, receivable: -10, inventory: -20, payables: -30,
  }, 100, 60, 180);
  assert.equal(working.currentRatio, null);
  assert.equal(working.quickRatio, null);
  assert.equal(working.cashRatio, null);
  assert.equal(working.receivableTurnover, null);
  assert.equal(working.inventoryTurnover, null);
  assert.equal(working.payableTurnover, null);
  assert.equal(working.cashConversionCycleDays, null);
});

test("builds standard growth, profitability, efficiency, solvency and cash KPIs", () => {
  const rows = buildPerformanceKpis({
    revenue: 1_000, priorRevenue: 800, grossProfit: 400, priorGrossProfit: 280,
    operatingProfit: 230, priorOperatingProfit: 160, netProfit: 180, priorNetProfit: 120,
    totalAssets: 2_000, openingAssets: 1_600, totalEquity: 800, openingEquity: 600,
    totalLiabilities: 1_200, currentRatio: 1.5, quickRatio: 0.9, cashRatio: 0.25,
    receivableDays: 58.4, inventoryDays: 109.5, payableDays: 109.5, cashConversionCycleDays: 58.4,
    operatingCashFlow: 210, freeCashFlow: 150,
  });
  assert.deepEqual([...new Set(rows.map((row) => row.category))], ["growth", "profitability", "efficiency", "solvency", "cash"]);
  assert.equal(rows.find((row) => row.key === "revenue-growth")?.value, 0.25);
  assert.equal(rows.find((row) => row.key === "gross-margin")?.value, 0.4);
  assert.equal(rows.find((row) => row.key === "asset-turnover")?.value, 5 / 9);
  assert.equal(rows.find((row) => row.key === "quick-ratio")?.value, 0.9);
  assert.equal(rows.find((row) => row.key === "profit-cash-ratio")?.value, 7 / 6);
});

test("cash scenarios and risk rules remain explicit and deterministic", () => {
  const scenarios = buildCashScenarios({ endingCash: 100, inflow: 1_200, outflow: 1_300, elapsedMonths: 12 });
  assert.equal(scenarios.find((row) => row.key === "base")?.projectedCash, 75);
  assert.equal(scenarios.find((row) => row.key === "downside")?.projectedCash, 28.75);

  const risks = buildRiskFindings({
    netProfit: -10,
    operatingCashFlow: -20,
    totalEquity: -30,
    currentRatio: 0.8,
    projectedStressCash: -5,
    shipmentRevenueGap: 500_000,
    statutoryRevenue: 10_000,
    hasBudget: false,
  });
  assert.deepEqual(risks.map((row) => row.key), [
    "negative-equity",
    "liquidity",
    "loss",
    "operating-cash",
    "cash-stress",
    "revenue-reconciliation",
    "budget-missing",
  ]);
});
