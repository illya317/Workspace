import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCashScenarios,
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
