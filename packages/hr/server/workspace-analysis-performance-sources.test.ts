import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  HR_PERFORMANCE_DASHBOARD_FIELD_COVERAGE,
  HR_WORKSPACE_ANALYSIS_PERFORMANCE_SOURCE_REGISTRATIONS,
} from "./workspace-analysis-performance-sources";

test("registers HR performance business rows under the inherited dashboard read contract", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(HR_WORKSPACE_ANALYSIS_PERFORMANCE_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "hr.performance-attendance",
    "hr.performance-contributions",
    "hr.performance-cycles",
    "hr.performance-reporting",
    "hr.performance-review-details",
    "hr.performance-review-evidence-values",
    "hr.performance-reviews",
    "hr.performance-work-plans",
  ]);
  for (const source of catalog.list()) {
    const adapter = workspaceGetAdapter(catalog, source.sourceKey);
    assert.equal(source.authorization.resourceKey, "hr.performance");
    assert.deepEqual(source.authorization.requiredActions, ["read"]);
    assert.equal(source.authorization.enforcement, "serviceDelegated");
    assert.equal(source.scopeBindings.personal?.mode, "viewer");
    assert.deepEqual(adapter.scopeQuery.personal, { requesterId: "requesterId" });
    if (source.sourceKey === "hr.performance-cycles") {
      assert.equal(source.scopeBindings.department?.mode, "viewer");
      assert.equal(source.scopeBindings.project?.mode, "viewer");
      assert.deepEqual(adapter.scopeQuery.department, { requesterId: "requesterId" });
    } else {
      assert.equal(source.scopeBindings.department?.mode, "target");
      assert.equal(source.scopeBindings.project?.mode, "target");
      assert.deepEqual(adapter.scopeQuery.department, {
        audienceType: "scopeType",
        audienceId: "scopeId",
      });
    }
  }
});

function workspaceGetAdapter(
  catalog: ReturnType<typeof createWorkspaceAnalysisSourceCatalog>,
  sourceKey: string,
) {
  const registration = catalog.resolve(sourceKey, 1);
  assert.ok(registration, `${sourceKey}@1 must be registered`);
  assert.equal(registration.adapter.kind, "workspaceGet");
  if (registration.adapter.kind !== "workspaceGet") assert.fail(`${sourceKey}@1 must use workspaceGet`);
  return registration.adapter;
}

test("accounts for every public dashboard field and keeps workflow submissions out of fact sources", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(HR_WORKSPACE_ANALYSIS_PERFORMANCE_SOURCE_REGISTRATIONS);

  assert.deepEqual(Object.keys(HR_PERFORMANCE_DASHBOARD_FIELD_COVERAGE), [
    "createRuntime",
    "currentEmployee",
    "cycleOptions",
    "activeCycleId",
    "audienceOptions",
    "contributionDirectories",
    "reportingSummary",
    "attendanceRows",
    "workRows",
    "contributionRows",
    "reviewRows",
    "submissionRows",
    "metrics",
  ]);
  assert.deepEqual(HR_PERFORMANCE_DASHBOARD_FIELD_COVERAGE.submissionRows, {
    classification: "omit",
    reason: "controlPlane",
    description: "绩效 submission 是待办流程及可执行动作记录，不作为经营事实源长期分析。",
  });
  const childSourceKeys = Object.values(HR_PERFORMANCE_DASHBOARD_FIELD_COVERAGE).flatMap((item) => (
    item.classification === "childSource" ? [item.sourceKey] : []
  ));
  for (const sourceKey of childSourceKeys) {
    assert.ok(catalog.get(sourceKey, 1), `${sourceKey} must be executable`);
  }
  assert.equal(HR_PERFORMANCE_DASHBOARD_FIELD_COVERAGE.contributionDirectories.classification, "childSource");
  assert.equal(HR_PERFORMANCE_DASHBOARD_FIELD_COVERAGE.reportingSummary.reason, "derivedDuplicate");
});

test("normalizes reporting and exposes all stable scalar review and work-plan fields", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(HR_WORKSPACE_ANALYSIS_PERFORMANCE_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.get("hr.performance-reporting", 1)?.fields.map((field) => field.key), [
    "audienceType",
    "audienceId",
    "audienceCode",
    "audienceName",
    "reportingApplicable",
    "reportingStatus",
    "deadline",
    "submittedAt",
  ]);
  assert.deepEqual(catalog.get("hr.performance-work-plans", 1)?.fields.map((field) => field.key), [
    "id",
    "employeeId",
    "employeeName",
    "planTitle",
    "kind",
    "okrCycleId",
    "stage",
    "status",
    "objectiveCount",
    "keyResultCount",
    "completionRate",
  ]);
  assert.deepEqual(catalog.get("hr.performance-reviews", 1)?.fields.map((field) => field.key), [
    "id",
    "employeeId",
    "employeeCode",
    "employeeName",
    "okrCycleId",
    "approvalRequestId",
    "selfScore",
    "managerScore",
    "finalScore",
    "finalGrade",
    "archivedAt",
    "version",
  ]);
  assert.deepEqual(catalog.get("hr.performance-review-details", 1)?.fields.map((field) => field.key), [
    "id",
    "employeeId",
    "employeeCode",
    "employeeName",
    "okrCycleId",
    "approvalRequestId",
    "selfScore",
    "managerScore",
    "finalScore",
    "finalGrade",
    "archivedAt",
    "version",
    "selfComment",
    "managerComment",
    "hrComment",
    "createdAt",
    "updatedAt",
  ]);
  assert.deepEqual(catalog.resolve("hr.performance-review-details", 1)?.fieldCoverage?.find((item) => (
    item.fieldKey === "workEvidenceSnapshot"
  )), {
    fieldKey: "workEvidenceSnapshot",
    disposition: "childSource",
    sourceKey: "hr.performance-review-evidence-values",
    description: "归档证据快照拆为确定性 JSON 路径和值行，不暴露原始嵌套对象。",
  });
  assert.deepEqual(catalog.get("hr.performance-review-evidence-values", 1)?.fields.map((field) => field.key), [
    "rowKey",
    "reviewId",
    "employeeId",
    "employeeCode",
    "employeeName",
    "okrCycleId",
    "path",
    "valueKind",
    "textValue",
    "numberValue",
    "booleanValue",
  ]);
  assert.equal(catalog.get("hr.performance-review-details", 1)?.fields.find((field) => (
    field.key === "managerComment"
  ))?.exportPolicy, "forbidden");
  catalog.validateReferences();
});
