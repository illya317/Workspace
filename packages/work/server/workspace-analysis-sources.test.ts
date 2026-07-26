import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
} from "./workspace-analysis-sources";
import {
  WORK_REPORT_COLLECTION_RESPONSE_FIELD_CLASSIFICATIONS,
  WORK_REPORT_COLLECTION_SPACE_FIELD_CLASSIFICATIONS,
} from "./workspace-analysis-report-sources";

test("registers the first Work public read models with inherited business authorization", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "work.assigned-items",
    "work.assigned-plan-groups",
    "work.department-collaboration-enabling-departments",
    "work.department-collaboration-executor-positions",
    "work.department-collaboration-items",
    "work.department-collaboration-plans",
    "work.department-collaboration-responsible-positions",
    "work.department-collaborations",
    "work.item-evidence",
    "work.item-participants",
    "work.items",
    "work.kpi-definition-scoring-rule-values",
    "work.kpi-definitions",
    "work.kpi-result-assignment-snapshot-values",
    "work.kpi-result-definition-snapshot-values",
    "work.kpi-result-evidence-values",
    "work.kpi-result-previews",
    "work.kpi-result-scoring-rule-values",
    "work.kpi-result-summaries",
    "work.kpi-result-work-reports",
    "work.kpi-scorecard-assignments",
    "work.kpi-scorecard-definition-scoring-rule-values",
    "work.kpi-scorecard-definition-snapshot-values",
    "work.kpi-scorecard-definitions",
    "work.kpi-scorecard-evidence-tasks",
    "work.kpi-scorecard-latest-results",
    "work.kpi-scorecard-plans",
    "work.kpi-scorecard-scoring-rule-values",
    "work.kpi-scorecard-source-assignments",
    "work.meeting-action-candidates",
    "work.meeting-agenda-items",
    "work.meeting-decisions",
    "work.meeting-detail-participants",
    "work.meeting-details",
    "work.meeting-minute-entries",
    "work.meeting-participants",
    "work.meeting-proposal-votes",
    "work.meeting-proposals",
    "work.meetings",
    "work.period-collection-cycles",
    "work.period-collection-items",
    "work.period-collection-overlaps",
    "work.period-collection-plans",
    "work.plan-approval-snapshot-values",
    "work.plans",
    "work.project-enabling-departments",
    "work.project-gantt-leaders",
    "work.project-gantt-projects",
    "work.project-members",
    "work.project-plan-baseline-items",
    "work.project-plan-baselines",
    "work.project-plan-dependencies",
    "work.project-plan-gantt-items",
    "work.project-plan-gantt-owners",
    "work.project-plan-phases",
    "work.projects",
    "work.report-items",
    "work.reports",
  ]);
  for (const source of catalog.list()) {
    assert.equal(source.ownerModuleKey, "work");
    assert.deepEqual(source.authorization.requiredActions, ["read"]);
    assert.equal(
      source.authorization.enforcement,
      source.sourceKey === "work.meetings" || source.sourceKey.startsWith("work.meeting-")
        ? "gateway"
        : "serviceDelegated",
    );
  }
});

test("declares target and viewer scope semantics without faking department or project attribution", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);

  for (const sourceKey of [
    "work.items",
    "work.item-evidence",
    "work.item-participants",
    "work.plans",
    "work.plan-approval-snapshot-values",
    "work.kpi-definitions",
    "work.kpi-definition-scoring-rule-values",
    "work.period-collection-cycles",
    "work.period-collection-plans",
    "work.period-collection-items",
    "work.period-collection-overlaps",
  ]) {
    const source = catalog.get(sourceKey, 1);
    assert.equal(source?.scopeBindings.personal?.mode, "target");
    assert.equal(source?.scopeBindings.department?.mode, "target");
    assert.equal(source?.scopeBindings.project?.mode, "target");
  }
  for (const sourceKey of [
    "work.assigned-items",
    "work.assigned-plan-groups",
    "work.projects",
    "work.project-enabling-departments",
    "work.project-gantt-projects",
    "work.project-gantt-leaders",
    "work.meetings",
    "work.meeting-participants",
    "work.meeting-details",
    "work.meeting-detail-participants",
    "work.meeting-agenda-items",
    "work.meeting-minute-entries",
    "work.meeting-proposals",
    "work.meeting-proposal-votes",
    "work.meeting-decisions",
    "work.meeting-action-candidates",
    "work.project-plan-phases",
    "work.project-plan-baselines",
    "work.project-plan-gantt-items",
    "work.project-plan-gantt-owners",
    "work.project-plan-dependencies",
    "work.project-plan-baseline-items",
    "work.kpi-scorecard-plans",
    "work.kpi-scorecard-assignments",
    "work.kpi-scorecard-definitions",
    "work.kpi-scorecard-source-assignments",
    "work.kpi-scorecard-definition-snapshot-values",
    "work.kpi-scorecard-scoring-rule-values",
    "work.kpi-scorecard-definition-scoring-rule-values",
    "work.kpi-scorecard-evidence-tasks",
    "work.kpi-scorecard-latest-results",
    "work.kpi-result-summaries",
    "work.kpi-result-previews",
    "work.kpi-result-work-reports",
    "work.kpi-result-definition-snapshot-values",
    "work.kpi-result-assignment-snapshot-values",
    "work.kpi-result-scoring-rule-values",
    "work.kpi-result-evidence-values",
  ]) {
    const source = catalog.get(sourceKey, 1);
    assert.equal(source?.scopeBindings.personal?.mode, "viewer");
    assert.equal(source?.scopeBindings.department?.mode, "viewer");
    assert.equal(source?.scopeBindings.project?.mode, "viewer");
  }
  for (const sourceKey of ["work.reports", "work.report-items"]) {
    const source = catalog.get(sourceKey, 1);
    assert.equal(source?.scopeBindings.personal?.mode, "viewer");
    assert.equal(source?.scopeBindings.department?.mode, "viewer");
    assert.equal(source?.scopeBindings.project?.mode, "viewer");
    const registration = catalog.resolve(sourceKey, 1);
    assert.ok(registration?.adapter.kind === "workspaceGet");
    assert.deepEqual(registration.adapter.scopeQuery.department, { requesterId: "requesterId" });
  }
  const members = catalog.get("work.project-members", 1);
  assert.equal(members?.scopeBindings.project?.mode, "target");
  assert.equal(members?.scopeBindings.personal, undefined);
  const memberRegistration = catalog.resolve("work.project-members", 1);
  assert.ok(memberRegistration?.adapter.kind === "workspaceGet");
  assert.deepEqual(memberRegistration.adapter.scopeQuery.project, { projectId: "scopeId" });
  for (const sourceKey of [
    "work.department-collaborations",
    "work.department-collaboration-enabling-departments",
    "work.department-collaboration-responsible-positions",
    "work.department-collaboration-executor-positions",
    "work.department-collaboration-plans",
    "work.department-collaboration-items",
  ]) {
    const source = catalog.get(sourceKey, 1);
    assert.equal(source?.scopeBindings.department?.mode, "target");
    assert.equal(source?.scopeBindings.personal, undefined);
    const registration = catalog.resolve(sourceKey, 1);
    assert.ok(registration?.adapter.kind === "workspaceGet");
    assert.deepEqual(registration.adapter.scopeQuery.department, { departmentId: "scopeId" });
  }
});

test("classifies nested and control-plane DTO fields instead of leaking them as scalars", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  const items = catalog.resolve("work.items", 1);
  const plans = catalog.resolve("work.plans", 1);
  const projects = catalog.resolve("work.projects", 1);
  const meetings = catalog.resolve("work.meetings", 1);
  const collaborations = catalog.resolve("work.department-collaborations", 1);
  const kpiDefinitions = catalog.resolve("work.kpi-definitions", 1);
  const reports = catalog.resolve("work.reports", 1);

  assert.equal(items?.definition.fields.some((field) => field.key === "participants"), false);
  assert.deepEqual(coverage(items, "participants"), {
    fieldKey: "participants",
    disposition: "childSource",
    sourceKey: "work.item-participants",
    description: "参与人为一对多关系，需拆成稳定子读模型。",
  });
  assert.equal(plans?.definition.fields.some((field) => field.key === "governance"), false);
  assert.equal(coverage(plans, "governance")?.disposition, "omit");
  assert.deepEqual(coverage(plans, "objectiveApprovalSnapshotJson"), {
    fieldKey: "objectiveApprovalSnapshotJson",
    disposition: "childSource",
    sourceKey: "work.plan-approval-snapshot-values",
    description: "目标审批快照由规范化路径和值子读模型表达。",
  });
  assert.deepEqual(coverage(plans, "krApprovalSnapshotJson"), {
    fieldKey: "krApprovalSnapshotJson",
    disposition: "childSource",
    sourceKey: "work.plan-approval-snapshot-values",
    description: "结果审批快照由规范化路径和值子读模型表达。",
  });
  assert.deepEqual(
    catalog.get("work.plan-approval-snapshot-values", 1)?.fields.map((field) => field.key),
    [
      "rowKey",
      "planId",
      "planTitle",
      "targetType",
      "targetId",
      "snapshotKind",
      "parseStatus",
      "path",
      "valueKind",
      "textValue",
      "numberValue",
      "booleanValue",
    ],
  );
  assert.equal(coverage(reports, "items")?.disposition, "childSource");
  assert.equal(coverage(reports, "groups")?.disposition, "omit");
  assert.equal(coverage(reports, "spaceStatus")?.disposition, "omit");
  assert.deepEqual(Object.keys(WORK_REPORT_COLLECTION_RESPONSE_FIELD_CLASSIFICATIONS), ["period", "spaces"]);
  assert.equal(WORK_REPORT_COLLECTION_RESPONSE_FIELD_CLASSIFICATIONS.period.classification, "omit");
  assert.equal(WORK_REPORT_COLLECTION_RESPONSE_FIELD_CLASSIFICATIONS.spaces.classification, "childSource");
  assert.deepEqual(
    Object.keys(WORK_REPORT_COLLECTION_SPACE_FIELD_CLASSIFICATIONS),
    ["targetType", "targetId", "name", "subtitle", "status", "reports"],
  );
  assert.equal(WORK_REPORT_COLLECTION_SPACE_FIELD_CLASSIFICATIONS.status.classification, "omit");
  assert.equal(WORK_REPORT_COLLECTION_SPACE_FIELD_CLASSIFICATIONS.reports.classification, "childSource");
  for (const fieldKey of [
    "okrControlScopeType",
    "okrControlScopeId",
    "governanceMode",
    "governanceRevision",
    "governanceActionKey",
    "governanceWorkflowPolicyId",
    "governanceWorkflowVersion",
    "governanceActionContractVersion",
    "governanceOkrControlVersion",
    "governanceBindingSource",
    "governanceBoundAt",
  ]) {
    assert.equal(coverage(plans, fieldKey)?.disposition, "analytical", `${fieldKey} should remain readable`);
  }
  assert.equal(projects?.definition.fields.some((field) => field.key === "permissions"), false);
  assert.equal(coverage(projects, "permissions")?.disposition, "omit");
  assert.equal(coverage(projects, "version")?.disposition, "analytical");
  assert.equal(coverage(catalog.resolve("work.project-members", 1), "version")?.disposition, "analytical");
  assert.equal(meetings?.definition.fields.some((field) => field.key === "participants"), false);
  assert.equal(coverage(meetings, "participants")?.disposition, "childSource");
  assert.equal(coverage(collaborations, "responsibleDepartment")?.disposition, "omit");
  assert.equal(coverage(collaborations, "responsibleDepartment")?.reason, "derivedDuplicate");
  for (const fieldKey of ["responsibleDepartmentId", "responsibleDepartmentCode", "responsibleDepartmentName"]) {
    assert.equal(coverage(collaborations, fieldKey)?.disposition, "analytical");
  }
  assert.equal(collaborations?.adapter.fieldPaths.responsibleDepartmentId, "responsibleDepartment.id");
  assert.equal(collaborations?.adapter.fieldPaths.responsibleDepartmentCode, "responsibleDepartment.code");
  assert.equal(collaborations?.adapter.fieldPaths.responsibleDepartmentName, "responsibleDepartment.name");
  assert.deepEqual(
    ["enablingDepartments", "responsiblePositions", "executorPositions", "workPlans", "workItems"].map((fieldKey) => (
      coverage(collaborations, fieldKey)?.disposition
    )),
    ["childSource", "childSource", "childSource", "childSource", "childSource"],
  );
  assert.deepEqual(coverage(kpiDefinitions, "scoringRule"), {
    fieldKey: "scoringRule",
    disposition: "childSource",
    sourceKey: "work.kpi-definition-scoring-rule-values",
    description: "评分规则是嵌套值，拆为确定性路径和值子读模型。",
  });
  assert.deepEqual(
    catalog.get("work.kpi-definition-scoring-rule-values", 1)?.fields.map((field) => field.key),
    [
      "rowKey",
      "definitionId",
      "definitionCode",
      "definitionVersion",
      "definitionName",
      "path",
      "valueKind",
      "textValue",
      "numberValue",
      "booleanValue",
    ],
  );

  const childSourceKeys = catalog.list().flatMap((source) => (
    catalog.resolve(source.sourceKey, source.version)?.fieldCoverage
      ?.filter((item) => item.disposition === "childSource")
      .map((item) => item.sourceKey) ?? []
  ));
  assert.deepEqual(childSourceKeys.sort(), [
    "work.department-collaboration-enabling-departments",
    "work.department-collaboration-executor-positions",
    "work.department-collaboration-items",
    "work.department-collaboration-plans",
    "work.department-collaboration-responsible-positions",
    "work.item-evidence",
    "work.item-evidence",
    "work.item-participants",
    "work.item-participants",
    "work.items",
    "work.kpi-definition-scoring-rule-values",
    "work.kpi-result-assignment-snapshot-values",
    "work.kpi-result-definition-snapshot-values",
    "work.kpi-result-evidence-values",
    "work.kpi-result-scoring-rule-values",
    "work.kpi-scorecard-definition-scoring-rule-values",
    "work.kpi-scorecard-definition-snapshot-values",
    "work.kpi-scorecard-definitions",
    "work.kpi-scorecard-evidence-tasks",
    "work.kpi-scorecard-latest-results",
    "work.kpi-scorecard-scoring-rule-values",
    "work.kpi-scorecard-source-assignments",
    "work.meeting-action-candidates",
    "work.meeting-agenda-items",
    "work.meeting-decisions",
    "work.meeting-detail-participants",
    "work.meeting-minute-entries",
    "work.meeting-participants",
    "work.meeting-proposal-votes",
    "work.meeting-proposals",
    "work.period-collection-overlaps",
    "work.period-collection-overlaps",
    "work.plan-approval-snapshot-values",
    "work.plan-approval-snapshot-values",
    "work.plan-approval-snapshot-values",
    "work.plan-approval-snapshot-values",
    "work.plans",
    "work.project-enabling-departments",
    "work.project-gantt-leaders",
    "work.project-plan-gantt-owners",
    "work.report-items",
  ]);
  for (const sourceKey of childSourceKeys) assert.ok(catalog.resolve(sourceKey!, 1), `${sourceKey} must be executable`);
  catalog.validateReferences();
});

function coverage(
  registration: { readonly fieldCoverage?: readonly { readonly fieldKey: string; readonly disposition: string; readonly [key: string]: unknown }[] } | null,
  fieldKey: string,
) {
  return registration?.fieldCoverage?.find((item) => item.fieldKey === fieldKey);
}
