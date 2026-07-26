import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);
const resources: string[] = [];
mock.module("@workspace/platform/server/auth", { namedExports: {
  canEnterResource: async () => false,
  evaluatePermissionAction: async (_userId: number, resourceKey: string) => { resources.push(resourceKey); return true; },
} } as never);

const { canDiscoverCapitalSecuritiesWorkspaceAnalysisSource } = await import("./workspace-analysis-source-access");
const { CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } = await import("./workspace-analysis-sources");

test("capital discovery reuses governance or investors read per source", async () => {
  resources.length = 0;
  for (const registration of CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS) {
    assert.equal(await canDiscoverCapitalSecuritiesWorkspaceAnalysisSource({ requesterId: 7, source: registration.definition }), true);
  }
  assert.equal(resources.filter((resource) => resource === "capitalSecurities.governance").length, 7);
  assert.equal(resources.filter((resource) => resource === "capitalSecurities.investors").length, 10);
});
