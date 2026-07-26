import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import { ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

test("administration contracts inherit the business GET and classify the complete list DTO", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  catalog.validateReferences();
  const source = catalog.get("administration.contracts", 1)!;

  assert.equal(source.authorization.resourceKey, "administration.contracts");
  assert.deepEqual(source.authorization.requiredActions, ["read"]);
  assert.equal(source.scopeBindings.department?.mode, "target");
  assert.equal(source.fields.some((item) => item.key === "content" && item.sensitivity === "restricted"), true);
  assert.equal(source.fields.some((item) => item.key === "amount"), true);
  assert.equal(source.fields.some((item) => item.key === "handlerEmployeeName"), true);
  for (const key of ["editedBy", "editedAt", "version", "createdAt", "updatedAt"]) {
    assert.equal(source.fields.some((item) => item.key === key), true, key);
  }
  assert.deepEqual(catalog.list().map((item) => item.sourceKey), [
    "administration.contracts",
    "administration.erp-diligence.answers",
    "administration.erp-diligence.evidence-attachments",
    "administration.erp-diligence.evidence-items",
    "administration.erp-diligence.process-step-pain-points",
    "administration.erp-diligence.process-steps",
    "administration.erp-diligence.submissions",
  ]);
  assert.equal(catalog.get("administration.erp-diligence.submissions", 1)?.scopeBindings.department?.mode, "viewer");
  assert.equal(catalog.get("administration.erp-diligence.evidence-attachments", 1)?.fields.some((item) => (
    item.key === "checksumSha256" && item.sensitivity === "restricted" && item.exportPolicy === "forbidden"
  )), true);
});
