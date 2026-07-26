import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);
const resources: string[] = [];
mock.module("@workspace/platform/server/auth", { namedExports: {
  canEnterResource: async () => false,
  evaluatePermissionAction: async (_userId: number, resourceKey: string) => { resources.push(resourceKey); return true; },
} } as never);

const { canDiscoverExternalWorkspaceAnalysisSource } = await import("./workspace-analysis-source-access");
const { EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } = await import("./workspace-analysis-sources");

test("external discovery keeps customer and supplier permissions separate for parent and role sources", async () => {
  resources.length = 0;
  for (const registration of EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS) {
    assert.equal(await canDiscoverExternalWorkspaceAnalysisSource({ requesterId: 7, source: registration.definition }), true);
  }
  assert.deepEqual(resources, [
    "external.customers",
    "external.customers",
    "external.suppliers",
    "external.suppliers",
  ]);
});
