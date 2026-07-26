import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  WORK_KPI_RESULT_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_KPI_RESULT_PREVIEW_FIELD_CLASSIFICATIONS,
  WORK_KPI_RESULTS_RESPONSE_FIELD_CLASSIFICATIONS,
  iterateWorkKpiResultAssignmentSnapshotValueRows,
  iterateWorkKpiResultDefinitionSnapshotValueRows,
  iterateWorkKpiResultEvidenceValueRows,
  iterateWorkKpiResultPreviewRows,
  iterateWorkKpiResultScoringRuleValueRows,
  iterateWorkKpiResultSummaryRows,
  iterateWorkKpiResultWorkReportRows,
  type WorkKpiResultsData,
} from "./workspace-analysis-kpi-result-sources";

test("KPI result sources require planId and inherit the protected Work read contract", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_KPI_RESULT_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "work.kpi-result-assignment-snapshot-values",
    "work.kpi-result-definition-snapshot-values",
    "work.kpi-result-evidence-values",
    "work.kpi-result-previews",
    "work.kpi-result-scoring-rule-values",
    "work.kpi-result-summaries",
    "work.kpi-result-work-reports",
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
      description: "必选计划稳定标识；执行时由原 KPI 结果服务复核当前查看人的计划对象可见性和结果可计算状态。",
      kind: "integer",
      required: true,
    }]);
    assert.equal(source.scopeBindings.personal?.mode, "viewer");
    assert.equal(source.scopeBindings.department?.mode, "viewer");
    assert.equal(source.scopeBindings.project?.mode, "viewer");
    const registration = catalog.resolve(source.sourceKey, 1);
    assert.ok(registration?.adapter.kind === "workspaceGet");
    assert.equal(registration.adapter.path, "/api/modules/work/tasks/plans/[id]/kpi-results");
    assert.deepEqual(registration.adapter.parameterQuery, { planId: "planId" });
  }
  assert.equal(catalog.get("work.kpi-result-summaries", 1)?.limits.maxRows, 1);
  assert.equal(catalog.get("work.kpi-result-evidence-values", 1)?.limits.maxRows, 10_000);
  catalog.validateReferences();
});

test("KPI result public response accounts for every nested fact through child sources", () => {
  assert.equal(WORK_KPI_RESULTS_RESPONSE_FIELD_CLASSIFICATIONS.results.sourceKey, "work.kpi-result-previews");
  assert.equal(WORK_KPI_RESULTS_RESPONSE_FIELD_CLASSIFICATIONS.weightedScore.sourceKey, "work.kpi-result-summaries");
  assert.equal(WORK_KPI_RESULTS_RESPONSE_FIELD_CLASSIFICATIONS.workReport.sourceKey, "work.kpi-result-work-reports");
  assert.equal(WORK_KPI_RESULT_PREVIEW_FIELD_CLASSIFICATIONS.definitionSnapshot.sourceKey, "work.kpi-result-definition-snapshot-values");
  assert.equal(WORK_KPI_RESULT_PREVIEW_FIELD_CLASSIFICATIONS.assignmentSnapshot.sourceKey, "work.kpi-result-assignment-snapshot-values");
  assert.equal(WORK_KPI_RESULT_PREVIEW_FIELD_CLASSIFICATIONS.scoringRule.sourceKey, "work.kpi-result-scoring-rule-values");
  assert.equal(WORK_KPI_RESULT_PREVIEW_FIELD_CLASSIFICATIONS.evidence.sourceKey, "work.kpi-result-evidence-values");
});

test("KPI result iterators preserve every public scalar and nested result fact", () => {
  const data = resultFixture();

  assert.deepEqual([...iterateWorkKpiResultSummaryRows(data, 7)], [{ planId: 7, weightedScore: 105 }]);
  assert.deepEqual([...iterateWorkKpiResultPreviewRows(data)].map((row) => ({
    assignmentId: row.assignmentId,
    actualValue: row.actualValue,
    calculatedScore: row.calculatedScore,
  })), [{ assignmentId: 11, actualValue: 99, calculatedScore: 105 }]);
  assert.deepEqual([...iterateWorkKpiResultWorkReportRows(data, 7)], [{
    planId: 7,
    id: 61,
    periodType: "year",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-12-31T00:00:00.000Z",
    submittedAt: "2026-07-02T00:00:00.000Z",
  }]);
  assert.ok([...iterateWorkKpiResultDefinitionSnapshotValueRows(data, 7)].some((row) => (
    row.path === "$.name" && row.textValue === "回款率"
  )));
  assert.ok([...iterateWorkKpiResultAssignmentSnapshotValueRows(data, 7)].some((row) => (
    row.path === "$.ownerEmployeeId" && row.numberValue === 41
  )));
  assert.ok([...iterateWorkKpiResultScoringRuleValueRows(data, 7)].some((row) => (
    row.path === "$.targetScore" && row.numberValue === 100
  )));
  const evidenceRows = [...iterateWorkKpiResultEvidenceValueRows(data, 7)];
  assert.ok(evidenceRows.some((row) => row.path === "$.schemaVersion" && row.numberValue === 1));
  assert.ok(evidenceRows.some((row) => row.path === "$.tasks[0].content" && row.textValue === "核对银行回单"));
  assert.ok(evidenceRows.every((row) => row.planId === 7 && row.assignmentId === 11));

  assert.deepEqual([...iterateWorkKpiResultWorkReportRows({ ...data, workReport: null }, 7)], []);
});

function resultFixture(): WorkKpiResultsData {
  return {
    results: [{
      assignmentId: 11,
      weight: 100,
      actualValue: 99,
      calculatedScore: 105,
      definitionSnapshot: { schemaVersion: 1, name: "回款率" },
      assignmentSnapshot: { schemaVersion: 1, assignmentId: 11, ownerEmployeeId: 41 },
      scoringRule: { kind: "linear", targetScore: 100, floorScore: 0, capScore: 120 },
      evidence: {
        schemaVersion: 1,
        tasks: [{
          taskId: 91,
          content: "核对银行回单",
          status: "done",
          completedAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z",
          note: "银行回单",
        }],
      },
    }],
    weightedScore: 105,
    workReport: {
      id: 61,
      periodType: "year",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-12-31T00:00:00.000Z",
      submittedAt: "2026-07-02T00:00:00.000Z",
    },
  } as WorkKpiResultsData;
}
