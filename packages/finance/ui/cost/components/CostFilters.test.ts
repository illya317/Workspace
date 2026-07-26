import assert from "node:assert/strict";
import test from "node:test";
import type { ShipmentWorkspaceState } from "../types";
import { shipmentDateRange, shipmentTrendGrain } from "./CostFilters";

const baseView: ShipmentWorkspaceState = {
  periodMode: "year",
  periodValue: "2026",
  groupBy: "productSpec",
  sortBy: "amount",
  sortOrder: "desc",
  detailSortBy: "date",
  detailSortOrder: "desc",
  pageSize: 50,
};

test("maps an ISO week to its Monday-through-Sunday date range", () => {
  const view = { ...baseView, periodMode: "week", periodValue: "2026-W01" } as const;
  assert.deepEqual(shipmentDateRange(view), {
    dateFrom: "2025-12-29",
    dateTo: "2026-01-04",
  });
  assert.equal(shipmentTrendGrain(view), "day");
});

test("keeps month, quarter, and year ranges available", () => {
  assert.deepEqual(shipmentDateRange({ ...baseView, periodMode: "month", periodValue: "2024-02" }), {
    dateFrom: "2024-02-01",
    dateTo: "2024-02-29",
  });
  assert.deepEqual(shipmentDateRange({ ...baseView, periodMode: "quarter", periodValue: "2026-Q2" }), {
    dateFrom: "2026-04-01",
    dateTo: "2026-06-30",
  });
  assert.deepEqual(shipmentDateRange(baseView), {
    dateFrom: "2026-01-01",
    dateTo: "2026-12-31",
  });
});
