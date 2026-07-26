import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import { EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

test("external customer, supplier and visible-role sources inherit their separate read resources", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => [source.sourceKey, source.authorization.resourceKey]), [
    ["external.customer-roles", "external.customers"],
    ["external.customers", "external.customers"],
    ["external.supplier-roles", "external.suppliers"],
    ["external.suppliers", "external.suppliers"],
  ]);
  for (const source of catalog.list()) {
    assert.deepEqual(source.authorization.requiredActions, ["read"]);
    assert.equal(source.scopeBindings.personal?.mode, "workspace");
    if (source.sourceKey.endsWith("-roles")) {
      assert.equal(source.fields.some((item) => item.key === "role"), true);
    } else {
      assert.equal(source.fields.some((item) => item.key === "identityNumber"), true);
      assert.equal(source.fields.some((item) => item.key === "bankAccount"), true);
      assert.equal(source.fields.some((item) => item.key === "roles"), false);
    }
  }
  catalog.validateReferences();
});
