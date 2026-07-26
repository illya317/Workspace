import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  WORK_PERIOD_COLLECTION_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_PERIOD_COLLECTION_ITEM_FIELD_CLASSIFICATIONS,
  WORK_PERIOD_COLLECTION_PLAN_FIELD_CLASSIFICATIONS,
  WORK_PERIOD_COLLECTION_RESPONSE_FIELD_CLASSIFICATIONS,
  iterateWorkPeriodCollectionCycleRows,
  iterateWorkPeriodCollectionItemRows,
  iterateWorkPeriodCollectionOverlapRows,
  iterateWorkPeriodCollectionPlanRows,
  type WorkPeriodCollectionData,
} from "./workspace-analysis-period-collection-sources";

mock.module("server-only", { namedExports: {} } as never);

test("registers four target-scoped period collection fact sources", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_PERIOD_COLLECTION_ANALYSIS_SOURCE_REGISTRATIONS);
  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "work.period-collection-cycles",
    "work.period-collection-items",
    "work.period-collection-overlaps",
    "work.period-collection-plans",
  ]);
  for (const source of catalog.list()) {
    assert.deepEqual(source.authorization.requiredActions, ["read"]);
    assert.equal(source.authorization.enforcement, "serviceDelegated");
    assert.equal(source.scopeBindings.personal?.mode, "target");
    assert.equal(source.scopeBindings.department?.mode, "target");
    assert.equal(source.scopeBindings.project?.mode, "target");
    assert.equal(source.parameters.find((parameter) => parameter.key === "cycleId")?.required, true);
  }
});

test("accounts exhaustively for the nested collection DTO", () => {
  assert.deepEqual(Object.keys(WORK_PERIOD_COLLECTION_RESPONSE_FIELD_CLASSIFICATIONS), [
    "rootCycle",
    "displayPeriodType",
    "cycles",
    "plans",
    "items",
  ]);
  assert.deepEqual(Object.keys(WORK_PERIOD_COLLECTION_PLAN_FIELD_CLASSIFICATIONS), ["plan", "overlapCycleIds"]);
  assert.deepEqual(Object.keys(WORK_PERIOD_COLLECTION_ITEM_FIELD_CLASSIFICATIONS), [
    "item",
    "planId",
    "planTitle",
    "planCycleId",
    "planCycleLabel",
    "overlapCycleIds",
  ]);
  assert.equal(WORK_PERIOD_COLLECTION_PLAN_FIELD_CLASSIFICATIONS.plan.classification, "childSource");
  assert.equal(WORK_PERIOD_COLLECTION_ITEM_FIELD_CLASSIFICATIONS.item.classification, "childSource");
});

test("normalizes root/overlap cycles, membership rows and overlap arrays", () => {
  const data = fixture();
  assert.deepEqual([...iterateWorkPeriodCollectionCycleRows(data)].map((row) => ({
    rowKey: row.rowKey,
    cycleRole: row.cycleRole,
    id: row.id,
    rootCycleId: row.rootCycleId,
    displayPeriodType: row.displayPeriodType,
  })), [
    { rowKey: "10:root:10", cycleRole: "root", id: 10, rootCycleId: 10, displayPeriodType: "monthly" },
    { rowKey: "10:overlap:11", cycleRole: "overlap", id: 11, rootCycleId: 10, displayPeriodType: "monthly" },
  ]);
  assert.deepEqual([...iterateWorkPeriodCollectionPlanRows(data)].map((row) => ({
    rootCycleId: row.rootCycleId,
    planId: row.planId,
    planTitle: row.planTitle,
    overlapCycleIds: row.overlapCycleIds,
  })), [{ rootCycleId: 10, planId: 20, planTitle: "年度销售目标", overlapCycleIds: [11] }]);
  assert.deepEqual([...iterateWorkPeriodCollectionItemRows(data)].map((row) => ({
    rootCycleId: row.rootCycleId,
    itemId: row.itemId,
    planCycleId: row.planCycleId,
    overlapCycleIds: row.overlapCycleIds,
  })), [{ rootCycleId: 10, itemId: 30, planCycleId: 10, overlapCycleIds: [11] }]);
  assert.deepEqual([...iterateWorkPeriodCollectionOverlapRows(data)].map((row) => ({
    rowKey: row.rowKey,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    cycleId: row.cycleId,
  })), [
    { rowKey: "10:plan:20:11", subjectKind: "plan", subjectId: 20, cycleId: 11 },
    { rowKey: "10:item:30:11", subjectKind: "item", subjectId: 30, cycleId: 11 },
  ]);
});

function fixture(): WorkPeriodCollectionData {
  return {
    rootCycle: cycle(10, "Y2026", "2026 年", "yearly", "2026-01-01", "2026-12-31", 250),
    displayPeriodType: "monthly",
    cycles: [cycle(11, "M202607", "2026 年 7 月", "monthly", "2026-07-01", "2026-07-31", 23)],
    plans: [{
      plan: {
        id: 20,
        targetType: "department",
        targetId: 12,
        kind: "okr",
        title: "年度销售目标",
        status: "active",
        okrCycleId: 10,
        okrCycleCode: "Y2026",
        okrCycleLabel: "2026 年",
        plannedStartDate: "2026-01-01",
        plannedEndDate: "2026-12-31",
      },
      overlapCycleIds: [11],
    }],
    items: [{
      item: {
        id: 30,
        targetType: "department",
        targetId: 12,
        itemType: "key_result",
        content: "七月回款 100 万",
        status: "active",
        plannedStartDate: "2026-07-01",
        plannedEndDate: "2026-07-31",
      },
      planId: 20,
      planTitle: "年度销售目标",
      planCycleId: 10,
      planCycleLabel: "2026 年",
      overlapCycleIds: [11],
    }],
  } as unknown as WorkPeriodCollectionData;
}

function cycle(
  id: number,
  code: string,
  label: string,
  periodType: string,
  startDate: string,
  endDate: string,
  workdayOverlapCount: number,
) {
  return { id, code, label, periodType, startDate, endDate, workdayOverlapCount };
}
