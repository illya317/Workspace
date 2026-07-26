import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  WORK_KPI_SCORECARD_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS,
  WORK_KPI_SCORECARD_DEFINITION_FIELD_CLASSIFICATIONS,
  WORK_KPI_SCORECARD_RESPONSE_FIELD_CLASSIFICATIONS,
  iterateWorkKpiScorecardAssignmentRows,
  iterateWorkKpiScorecardDefinitionRows,
  iterateWorkKpiScorecardDefinitionScoringRuleValueRows,
  iterateWorkKpiScorecardDefinitionSnapshotValueRows,
  iterateWorkKpiScorecardEvidenceTaskRows,
  iterateWorkKpiScorecardLatestResultRows,
  iterateWorkKpiScorecardPlanRows,
  iterateWorkKpiScorecardScoringRuleValueRows,
  iterateWorkKpiScorecardSourceAssignmentRows,
  type WorkKpiScorecardData,
} from "./workspace-analysis-kpi-scorecard-sources";

test("KPI scorecard sources require planId and inherit the protected Work read contract", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_KPI_SCORECARD_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "work.kpi-scorecard-assignments",
    "work.kpi-scorecard-definition-scoring-rule-values",
    "work.kpi-scorecard-definition-snapshot-values",
    "work.kpi-scorecard-definitions",
    "work.kpi-scorecard-evidence-tasks",
    "work.kpi-scorecard-latest-results",
    "work.kpi-scorecard-plans",
    "work.kpi-scorecard-scoring-rule-values",
    "work.kpi-scorecard-source-assignments",
  ]);
  for (const source of catalog.list()) {
    assert.deepEqual(source.authorization, {
      resourceKey: "work.tasks",
      requiredActions: ["read"],
      projection: "default",
      enforcement: "serviceDelegated",
    });
    assert.deepEqual(source.parameters, [{
      key: "planId",
      label: "工作计划",
      description: "必选计划稳定标识；执行时由原 KPI 计分卡服务复核当前查看人的计划对象可见性。",
      kind: "integer",
      required: true,
    }]);
    assert.equal(source.scopeBindings.personal?.mode, "viewer");
    assert.equal(source.scopeBindings.department?.mode, "viewer");
    assert.equal(source.scopeBindings.project?.mode, "viewer");
    const registration = catalog.resolve(source.sourceKey, 1);
    assert.ok(registration?.adapter.kind === "workspaceGet");
    assert.equal(registration.adapter.path, "/api/modules/work/tasks/plans/[id]/kpi-scorecard");
    assert.deepEqual(registration.adapter.parameterQuery, { planId: "planId" });
  }
  assert.equal(catalog.get("work.kpi-scorecard-plans", 1)?.limits.maxRows, 1);
  assert.equal(catalog.get("work.kpi-scorecard-evidence-tasks", 1)?.limits.maxRows, 10_000);
  catalog.validateReferences();
});

test("KPI scorecard public response accounts for every nested fact through child sources", () => {
  assert.equal(WORK_KPI_SCORECARD_RESPONSE_FIELD_CLASSIFICATIONS.plan.sourceKey, "work.kpi-scorecard-plans");
  assert.equal(WORK_KPI_SCORECARD_RESPONSE_FIELD_CLASSIFICATIONS.assignments.sourceKey, "work.kpi-scorecard-assignments");
  assert.equal(WORK_KPI_SCORECARD_RESPONSE_FIELD_CLASSIFICATIONS.totalWeight.sourceKey, "work.kpi-scorecard-plans");
  assert.equal(WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS.definition.sourceKey, "work.kpi-scorecard-definitions");
  assert.equal(WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS.sourceAssignment.sourceKey, "work.kpi-scorecard-source-assignments");
  assert.equal(WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS.definitionSnapshot.sourceKey, "work.kpi-scorecard-definition-snapshot-values");
  assert.equal(WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS.scoringRule.sourceKey, "work.kpi-scorecard-scoring-rule-values");
  assert.equal(WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS.evidence.sourceKey, "work.kpi-scorecard-evidence-tasks");
  assert.equal(WORK_KPI_SCORECARD_ASSIGNMENT_FIELD_CLASSIFICATIONS.latestResult.sourceKey, "work.kpi-scorecard-latest-results");
  assert.equal(WORK_KPI_SCORECARD_DEFINITION_FIELD_CLASSIFICATIONS.scoringRule.sourceKey, "work.kpi-scorecard-definition-scoring-rule-values");
});

test("KPI scorecard iterators preserve all public scalar and nested DTO facts", () => {
  const data = scorecardFixture();

  assert.deepEqual([...iterateWorkKpiScorecardPlanRows(data)], [{ ...data.plan, totalWeight: 100 }]);
  assert.equal([...iterateWorkKpiScorecardAssignmentRows(data)][0]?.workItemContent, "回款率");
  assert.deepEqual([...iterateWorkKpiScorecardDefinitionRows(data)].map((row) => ({
    assignmentId: row.assignmentId,
    workPlanId: row.workPlanId,
    code: row.code,
  })), [{ assignmentId: 11, workPlanId: 7, code: "FIN-001" }]);
  assert.deepEqual([...iterateWorkKpiScorecardSourceAssignmentRows(data)].map((row) => ({
    assignmentId: row.assignmentId,
    id: row.id,
    planTitle: row.planTitle,
  })), [{ assignmentId: 11, id: 9, planTitle: "上年目标" }]);
  assert.ok([...iterateWorkKpiScorecardDefinitionSnapshotValueRows(data)].some((row) => (
    row.assignmentId === 11 && row.path === "$.name" && row.textValue === "回款率"
  )));
  assert.ok([...iterateWorkKpiScorecardScoringRuleValueRows(data)].some((row) => (
    row.path === "$.targetScore" && row.numberValue === 100
  )));
  assert.ok([...iterateWorkKpiScorecardDefinitionScoringRuleValueRows(data)].some((row) => (
    row.path === "$.capScore" && row.numberValue === 120
  )));
  assert.deepEqual([...iterateWorkKpiScorecardEvidenceTaskRows(data)].map((row) => ({
    assignmentId: row.assignmentId,
    taskId: row.taskId,
    note: row.note,
  })), [{ assignmentId: 11, taskId: 91, note: "银行回单" }]);
  assert.deepEqual([...iterateWorkKpiScorecardLatestResultRows(data)].map((row) => ({
    assignmentId: row.assignmentId,
    id: row.id,
    confirmedScore: row.confirmedScore,
  })), [{ assignmentId: 11, id: 81, confirmedScore: 105 }]);
});

function scorecardFixture(): WorkKpiScorecardData {
  return {
    plan: {
      id: 7,
      title: "年度经营目标",
      targetType: "department",
      targetId: 3,
      okrCycleId: 2026,
      okrStage: "kr_approved",
      status: "active",
      governanceRevision: 4,
    },
    assignments: [{
      id: 11,
      version: 3,
      workPlanId: 7,
      definitionId: 21,
      definition: {
        id: 21,
        code: "FIN-001",
        version: 2,
        status: "active",
        name: "回款率",
        description: "已回款占应回款比例",
        valueType: "number",
        displayType: "percent",
        unit: "%",
        direction: "higher_is_better",
        scoringRule: { kind: "linear", targetScore: 100, floorScore: 0, capScore: 120 },
        measurementMode: "manual",
        ownerDepartmentId: 3,
        ownerDepartmentCode: "FIN",
        ownerDepartmentName: "财务部",
        referenceCount: 2,
        createdByUserId: 5,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      workItemId: 31,
      workItemContent: "回款率",
      objectiveWorkItemId: 30,
      workItemStatus: "active",
      ownerEmployeeId: 41,
      ownerEmployeeNumber: "E041",
      ownerEmployeeName: "张三",
      sourceAssignmentId: 9,
      sourceAssignment: {
        id: 9,
        workPlanId: 6,
        definitionId: 21,
        title: "回款率",
        planTitle: "上年目标",
        targetType: "department",
        targetId: 3,
      },
      relationKind: "decompose",
      weight: 100,
      baselineValue: 90,
      targetValue: 98,
      targetLowerBound: null,
      targetUpperBound: null,
      currentValue: 99,
      definitionSnapshot: { schemaVersion: 1, name: "回款率" },
      scoringRule: { kind: "linear", targetScore: 100, floorScore: 0, capScore: 120 },
      evidence: [{
        taskId: 91,
        content: "核对银行回单",
        status: "done",
        completedAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        note: "银行回单",
      }],
      latestResult: {
        id: 81,
        version: 2,
        actualValue: 99,
        scoreBeforeAdjustment: 101,
        confirmedScore: 105,
        adjustmentReason: "重大回款提前",
        approvedAt: "2026-07-03T00:00:00.000Z",
      },
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    }],
    totalWeight: 100,
  } as unknown as WorkKpiScorecardData;
}
