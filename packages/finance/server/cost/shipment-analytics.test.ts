import assert from "node:assert/strict";
import test from "node:test";

import { amountLeader, salespersonAmountLeader, toMetric } from "./shipment-analytics";
import { buildShipmentWhere } from "./common";

test("shipment date ranges include only fully covered monthly facts", () => {
  const fullQuarter = buildShipmentWhere({ dateFrom: "2026-01-01", dateTo: "2026-03-31" });
  assert.deepEqual(fullQuarter.OR, [
    { date: { gte: "2026-01-01", lte: "2026-03-31" } },
    {
      date: null,
      OR: [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
        { year: 2026, month: 3 },
      ],
    },
  ]);

  const partialMonth = buildShipmentWhere({ dateFrom: "2026-03-10", dateTo: "2026-03-20" });
  assert.deepEqual(partialMonth.OR, [
    { date: { gte: "2026-03-10", lte: "2026-03-20" } },
  ]);
});

test("shipment department scope only includes linked employee sales", () => {
  assert.deepEqual(buildShipmentWhere({ employeeIds: [3, 8] }), {
    salesChannel: "employee",
    employeeId: { in: [3, 8] },
  });
  assert.deepEqual(buildShipmentWhere({ employeeIds: [] }), {
    salesChannel: "employee",
    employeeId: { in: [] },
  });
});

test("shipment metrics preserve unknown collection values", () => {
  assert.deepEqual(toMetric({ quantity: 12, amount: 100, receivedAmount: null }), {
    quantity: 12,
    amount: 100,
    receivedAmount: null,
    unreceivedAmount: null,
    collectionRate: null,
  });
  assert.deepEqual(toMetric({ quantity: 12, amount: 100, receivedAmount: 75 }), {
    quantity: 12,
    amount: 100,
    receivedAmount: 75,
    unreceivedAmount: 25,
    collectionRate: 0.75,
  });
});

test("shipment amount leader is deterministic and ignores unknown amounts", () => {
  const base = { quantity: null, receivedAmount: null, productName: null, spec: null };
  assert.deepEqual(amountLeader([
    { ...base, key: "unknown", label: "未知", amount: null },
    { ...base, key: "b", label: "乙", amount: 120 },
    { ...base, key: "a", label: "甲", amount: 120 },
    { ...base, key: "c", label: "丙", amount: 100 },
  ]), { key: "a", label: "甲", amount: 120 });
  assert.equal(amountLeader([{ ...base, key: "unknown", label: "未知", amount: null }]), null);
});

test("salesperson leader excludes factory-direct and unknown sales attribution", () => {
  const base = { quantity: null, receivedAmount: null, productName: null, spec: null };
  assert.deepEqual(salespersonAmountLeader([
    { ...base, key: "__factory_direct__", label: "厂家直销", amount: 500 },
    { ...base, key: "__unknown_sales__:", label: "未注明销售归属", amount: 400 },
    { ...base, key: "employee:18", label: "张三", amount: 300 },
  ]), { key: "employee:18", label: "张三", amount: 300 });
});
