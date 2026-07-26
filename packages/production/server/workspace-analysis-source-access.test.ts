import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";

mock.module("server-only", { namedExports: {} } as never);

let allowed = true;
let entryChecks = 0;
const actionChecks: Array<{ requesterId: number; resourceKey: string; action: string; projection: string }> = [];

mock.module("@workspace/platform/server/auth", {
  namedExports: {
    canEnterResource: async () => {
      entryChecks += 1;
      return allowed;
    },
    evaluatePermissionAction: async (
      requesterId: number,
      resourceKey: string,
      action: string,
      options: { projection: string },
    ) => {
      actionChecks.push({ requesterId, resourceKey, action, projection: options.projection });
      return allowed;
    },
  },
} as never);

const { canDiscoverProductionWorkspaceAnalysisSource } = await import("./workspace-analysis-source-access");
const { PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } = await import("./workspace-analysis-sources");

test("Production discovery reuses product and QC business reads without a source-specific grant", async () => {
  reset();
  for (const registration of PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS) {
    assert.equal(await canDiscoverProductionWorkspaceAnalysisSource({
      requesterId: 11,
      source: registration.definition,
    }), true);
  }

  assert.equal(entryChecks, 0);
  assert.deepEqual(actionChecks.map(({ requesterId, resourceKey, action, projection }) => ({
    requesterId,
    resourceKey,
    action,
    projection,
  })), PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.map(({ definition }) => ({
    requesterId: 11,
    resourceKey: definition.authorization.resourceKey,
    action: "read",
    projection: "default",
  })));
});

test("Production discovery rejects a foreign owner and preserves a denied business read", async () => {
  reset();
  const source = PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS[0].definition;
  const foreign = { ...source, ownerModuleKey: "inventory" } satisfies WorkspaceAnalysisSourceDefinition;
  assert.equal(await canDiscoverProductionWorkspaceAnalysisSource({ requesterId: 11, source: foreign }), false);
  assert.equal(actionChecks.length, 0);

  allowed = false;
  assert.equal(await canDiscoverProductionWorkspaceAnalysisSource({ requesterId: 11, source }), false);
  assert.equal(actionChecks.length, 1);
});

function reset() {
  allowed = true;
  entryChecks = 0;
  actionChecks.length = 0;
}
