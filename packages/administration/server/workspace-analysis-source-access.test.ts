import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);
const resources: string[] = [];
mock.module("@workspace/platform/server/auth", { namedExports: {
  canEnterResource: async () => false,
  evaluatePermissionAction: async (_userId: number, resourceKey: string) => { resources.push(resourceKey); return true; },
} } as never);

const { canDiscoverAdministrationWorkspaceAnalysisSource } = await import("./workspace-analysis-source-access");
const {
  ADMINISTRATION_CONTRACTS_ANALYSIS_SOURCE,
  ADMINISTRATION_ERP_DILIGENCE_SUBMISSIONS_ANALYSIS_SOURCE,
} = await import("./workspace-analysis-sources");

test("administration discovery uses the inherited contract read only", async () => {
  resources.length = 0;
  assert.equal(await canDiscoverAdministrationWorkspaceAnalysisSource({ requesterId: 7, source: ADMINISTRATION_CONTRACTS_ANALYSIS_SOURCE.definition }), true);
  assert.deepEqual(resources, ["administration.contracts"]);

  resources.length = 0;
  assert.equal(await canDiscoverAdministrationWorkspaceAnalysisSource({
    requesterId: 7,
    source: ADMINISTRATION_ERP_DILIGENCE_SUBMISSIONS_ANALYSIS_SOURCE.definition,
  }), true);
  assert.deepEqual(resources, ["administration.erpDiligence"]);
});
