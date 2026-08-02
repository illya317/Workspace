import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import { CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

test("capital securities registers governed list projections under canonical source keys", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "capital-securities.captable-positions",
    "capital-securities.captable-rounds",
    "capital-securities.companies",
    "capital-securities.financing-contributions",
    "capital-securities.financing-rounds",
    "capital-securities.governance-position-managements",
    "capital-securities.governance-positions",
    "capital-securities.investor-companies",
    "capital-securities.organization-descriptions",
    "capital-securities.organization-managers",
    "capital-securities.organizations",
    "capital-securities.ownership-interests",
    "capital-securities.ownership-structure-edges",
    "capital-securities.ownership-structure-nodes",
    "capital-securities.share-capital-events",
    "capital-securities.share-capital-transactions",
    "capital-securities.shareholders",
  ]);
  assert.equal(catalog.get("capital-securities.companies", 1)?.authorization.resourceKey, "capitalSecurities.governance");
  assert.equal(catalog.get("capital-securities.companies", 1)?.fields.some((field) => field.key === "legalFactRevision"), true);
  assert.equal(catalog.get("capital-securities.shareholders", 1)?.authorization.resourceKey, "capitalSecurities.investors");
  assert.equal(catalog.list().every((source) => source.scopeBindings.project?.mode === "workspace"), true);
});

test("capital nested composites are classified away from canonical scalar fields", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.equal(catalog.get("capital-securities.organizations", 1)?.fields.some((field) => field.key === "descriptions"), false);
  assert.equal(catalog.get("capital-securities.share-capital-events", 1)?.fields.some((field) => field.key === "transactions"), false);
  assert.equal(catalog.get("capital-securities.financing-rounds", 1)?.fields.some((field) => field.key === "contributions"), false);
  assert.ok(catalog.get("capital-securities.organization-descriptions", 1));
  assert.ok(catalog.get("capital-securities.organization-managers", 1));
  assert.ok(catalog.get("capital-securities.governance-position-managements", 1));
  assert.ok(catalog.get("capital-securities.share-capital-transactions", 1));
  assert.ok(catalog.get("capital-securities.financing-contributions", 1));
  assert.equal(catalog.get("capital-securities.ownership-interests", 1)?.fields.some((field) => field.key === "ownerIdentityNumberMasked"), false);
});
