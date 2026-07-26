import assert from "node:assert/strict";
import test from "node:test";

import { buildConsolidationToolbarItems, buildStatementPeriodToolbarItems } from "./consolidation-toolbar";

test("单体报表复用合并报表的年季度月期间工具", () => {
  const periodKinds: string[] = [];
  const periods: Array<[number, number]> = [];
  const items = buildStatementPeriodToolbarItems({
    year: 2026,
    month: 7,
    periodKind: "month",
    loading: false,
    onPeriodKindChange: (kind) => periodKinds.push(kind),
    onPeriodChange: (year, month) => periods.push([year, month]),
  });

  assert.deepEqual(items.map((item) => item.kind), ["option-group", "period"]);
  const periodKind = items[0];
  assert.equal(periodKind.kind, "option-group");
  periodKind.onChange("year");
  assert.deepEqual(periodKinds, ["year"]);
  assert.deepEqual(periods, [[2026, 12]]);
});

test("合并四页共用周期和批次版本工具栏", () => {
  const periodKinds: string[] = [];
  const periods: Array<[number, number]> = [];
  const batchIds: number[] = [];
  let createCount = 0;

  const items = buildConsolidationToolbarItems({
    year: 2025,
    month: 12,
    periodKind: "month",
    loading: false,
    error: null,
    batchId: 2,
    batchVersions: [
      { id: 2, version: 2, revision: 1, status: "draft", baseBatchId: 1 },
      { id: 1, version: 1, revision: 8, status: "published", baseBatchId: null },
    ],
    onPeriodKindChange: (kind) => periodKinds.push(kind),
    onPeriodChange: (year, month) => periods.push([year, month]),
    onBatchChange: (batchId) => batchIds.push(batchId),
    onRefresh: () => undefined,
    createVersion: { nextVersion: 3, busy: false, onClick: () => { createCount += 1; } },
  });

  assert.deepEqual(items.map((item) => item.kind), ["option-group", "period", "select", "action-group"]);

  const periodKind = items[0];
  assert.equal(periodKind.kind, "option-group");
  periodKind.onChange("quarter");
  assert.deepEqual(periodKinds, ["quarter"]);

  const period = items[1];
  assert.equal(period.kind, "period");
  assert.equal(period.mode, "nav");
  if (period.mode === "nav") period.onPrevious();
  assert.deepEqual(periods, [[2025, 11]]);

  const version = items[2];
  assert.equal(version.kind, "select");
  assert.deepEqual(version.options.map((option) => option.label), ["2025年12月 · V2 · 草稿", "2025年12月 · V1 · 已发布"]);
  version.onChange("1");
  assert.deepEqual(batchIds, [1]);

  const actions = items[3];
  assert.equal(actions.kind, "action-group");
  assert.equal(actions.actions[0]?.label, "创建 V3");
  actions.actions[0]?.onClick?.();
  assert.equal(createCount, 1);
});

test("没有历史批次时不展示版本选择和新版本动作", () => {
  const items = buildConsolidationToolbarItems({
    year: 2025,
    month: 12,
    periodKind: "year",
    loading: false,
    error: null,
    batchId: null,
    batchVersions: [],
    onPeriodKindChange: () => undefined,
    onPeriodChange: () => undefined,
    onBatchChange: () => undefined,
    onRefresh: () => undefined,
    createVersion: null,
  });

  assert.deepEqual(items.map((item) => item.kind), ["option-group", "period"]);
});
