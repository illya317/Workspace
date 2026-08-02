import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  HR_CONTRACTS_ANALYSIS_SOURCE,
  HR_EMPLOYMENTS_ANALYSIS_SOURCE,
  HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
} from "./sources";

test("registers stable HR public read models under their existing read contracts", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "hr.audit-changes",
    "hr.audit-entries",
    "hr.companies",
    "hr.contracts",
    "hr.department-descriptions",
    "hr.department-managers",
    "hr.departments",
    "hr.edps",
    "hr.employees",
    "hr.employments",
    "hr.performance-attendance",
    "hr.performance-contributions",
    "hr.performance-cycles",
    "hr.performance-reporting",
    "hr.performance-review-details",
    "hr.performance-review-evidence-values",
    "hr.performance-reviews",
    "hr.performance-work-plans",
    "hr.position-descriptions",
    "hr.position-report-overrides",
    "hr.positions",
  ]);
  catalog.validateReferences();
  for (const source of catalog.list()) {
    assert.equal(
      source.authorization.resourceKey,
      source.sourceKey.startsWith("hr.performance-") ? "hr.performance" : "hr.roster",
    );
    assert.deepEqual(source.authorization.requiredActions, ["read"]);
    assert.equal(source.fields.every((field) => field.capabilities.displayable), true);
  }
});

test("employment exposes every scalar list field and delegates only raw contracts JSON", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog([HR_EMPLOYMENTS_ANALYSIS_SOURCE]);
  const source = catalog.get("hr.employments", 1)!;

  assert.equal(source.scopeBindings.department?.mode, "target");
  assert.equal(source.scopeBindings.personal?.mode, "workspace");
  assert.equal(source.scopeBindings.project?.mode, "workspace");
  assert.deepEqual(source.fields.map((field) => field.key), [
    "id",
    "employeeId",
    "employeeCode",
    "employeeName",
    "positionNames",
    "isActive",
    "currentCompany",
    "joinDate",
    "leaveDate",
    "leaveReason",
    "leaveNote",
    "officeLocation",
    "personnelType",
    "rank",
    "title",
  ]);
  assert.equal(source.fields.find((field) => field.key === "leaveNote")?.sensitivity, "restricted");
  assert.equal(source.fields.some((field) => field.key === "contracts"), false);
  const registration = catalog.resolve("hr.employments", 1);
  assert.ok(registration);
  assert.equal(registration.adapter.kind, "workspaceGet");
  if (registration.adapter.kind !== "workspaceGet") assert.fail("hr.employments@1 must use workspaceGet");
  assert.deepEqual(
    registration.adapter.scopeQuery.department,
    { departmentId: "scopeId" },
  );
});

test("contracts expose lifecycle scalars and explicitly omit nested timelines", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog([HR_CONTRACTS_ANALYSIS_SOURCE]);
  const source = catalog.get("hr.contracts", 1)!;

  for (const key of [
    "agreementUid",
    "recordState",
    "temporalState",
    "version",
    "source",
    "migrationState",
    "currentRevisionUid",
  ]) {
    assert.equal(source.fields.some((field) => field.key === key), true, key);
  }
  assert.equal(source.fields.find((field) => field.key === "id")?.kind, "text");
  assert.equal(source.fields.some((field) => field.key === "terms"), false);
  assert.equal(source.fields.some((field) => field.key === "revisions"), false);
});

test("nested list payloads do not leak into canonical fields", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.equal(catalog.get("hr.employees", 1)?.fields.some((field) => field.key === "employments"), false);
  assert.equal(catalog.get("hr.employees", 1)?.fields.some((field) => field.key === "positions"), false);
  assert.equal(catalog.get("hr.departments", 1)?.fields.some((field) => field.key === "descriptions"), false);
  assert.equal(catalog.get("hr.positions", 1)?.fields.some((field) => field.key === "positionDescriptionDetails"), false);
  assert.ok(catalog.get("hr.department-descriptions", 1));
  assert.ok(catalog.get("hr.department-managers", 1));
  assert.ok(catalog.get("hr.position-descriptions", 1));
  assert.equal(catalog.get("hr.positions", 1)?.fields.some((field) => field.key === "positionDescriptionSequence"), true);
  assert.equal(catalog.get("hr.employees", 1)?.fields.some((field) => field.key === "idNumber"), true);
  assert.equal(catalog.get("hr.employees", 1)?.fields.some((field) => field.key === "phone"), true);
  for (const key of ["editedBy", "editedAt", "version", "createdAt", "updatedAt"]) {
    assert.equal(catalog.get("hr.employees", 1)?.fields.some((field) => field.key === key), true, key);
  }
});
