import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceApiFilter, WorkspaceApiMetric } from "@workspace/finance/types";

import {
  aggregateWorkspaceApiMetric,
  applyWorkspaceApiFilters,
  extractWorkspaceApiRows,
  groupWorkspaceApiRows,
  previousWorkspaceApiDimensionKey,
} from "./workspace-api-analysis-runtime";

const rows = [
  { employeeName: "甲", joinDate: "2025-01-10", isActive: true },
  { employeeName: "乙", joinDate: "2026-01-11", isActive: true },
  { employeeName: "丙", joinDate: "2026-02-01", isActive: false },
];

test("extracts, filters and aggregates generic Workspace API rows", () => {
  assert.deepEqual(extractWorkspaceApiRows({ data: { items: rows } }, "data.items"), rows);
  const filters: WorkspaceApiFilter[] = [
    { key: "year", label: "年份", source: "employees", field: "joinDate", kind: "year" },
    { key: "active", label: "在职", source: "employees", field: "isActive", kind: "select", options: [{ label: "是", value: "true" }] },
  ];
  const filtered = applyWorkspaceApiFilters(rows, filters, { year: "2026", active: "true" }, "employees");
  assert.deepEqual(filtered.map((row) => row.employeeName), ["乙"]);
  const count: WorkspaceApiMetric = { key: "count", label: "人数", operation: "count", field: "joinDate" };
  assert.equal(aggregateWorkspaceApiMetric(filtered, count), 1);
});

test("date buckets expose period-over-period and year-over-year lookup keys", () => {
  const groups = groupWorkspaceApiRows(rows, "joinDate", "month");
  assert.deepEqual([...groups.keys()], ["2025-01", "2026-01", "2026-02"]);
  assert.equal(previousWorkspaceApiDimensionKey("2026-01", "month", "period"), "2025-12");
  assert.equal(previousWorkspaceApiDimensionKey("2026-01", "month", "year"), "2025-01");
});
