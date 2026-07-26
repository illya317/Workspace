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

const { canDiscoverInventoryWorkspaceAnalysisSource } = await import("./workspace-analysis-source-access");
const { INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } = await import("./workspace-analysis-sources");

test("Inventory discovery reuses each original business GET read action without a source-specific grant", async () => {
  reset();
  for (const registration of INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS) {
    assert.equal(await canDiscoverInventoryWorkspaceAnalysisSource({
      requesterId: 7,
      source: registration.definition,
    }), true);
  }

  assert.equal(entryChecks, 0);
  assert.deepEqual(actionChecks.map(({ resourceKey, action, projection }) => ({ resourceKey, action, projection })),
    INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.map(({ definition }) => ({
      resourceKey: definition.authorization.resourceKey,
      action: "read",
      projection: "default",
    })));
});

test("Inventory discovery rejects a foreign owner and preserves a denied business read", async () => {
  reset();
  const source = INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS[0].definition;
  const foreign = { ...source, ownerModuleKey: "finance" } satisfies WorkspaceAnalysisSourceDefinition;
  assert.equal(await canDiscoverInventoryWorkspaceAnalysisSource({ requesterId: 7, source: foreign }), false);
  assert.equal(actionChecks.length, 0);

  allowed = false;
  assert.equal(await canDiscoverInventoryWorkspaceAnalysisSource({ requesterId: 7, source }), false);
  assert.equal(actionChecks.length, 1);
});

function reset() {
  allowed = true;
  entryChecks = 0;
  actionChecks.length = 0;
}
