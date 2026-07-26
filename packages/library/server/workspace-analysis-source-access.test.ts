import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";

mock.module("server-only", { namedExports: {} } as never);

let readAllowed = true;
const calls: number[] = [];
mock.module("./permissions", {
  namedExports: {
    checkLibraryRead: async (userId: number) => {
      calls.push(userId);
      return readAllowed;
    },
  },
} as never);

const {
  buildLibraryWorkspaceAnalysisSourceCatalog,
  canDiscoverLibraryWorkspaceAnalysisSource,
} = await import("./workspace-analysis-source-access");

test("Library source discovery inherits only library.basicInfo read", async () => {
  const catalog = buildLibraryWorkspaceAnalysisSourceCatalog();
  calls.length = 0;
  readAllowed = true;

  for (const source of catalog.list()) {
    assert.deepEqual(source.authorization.requiredActions, ["read"]);
    assert.equal(source.authorization.resourceKey, "library.basicInfo");
    assert.equal(source.authorization.enforcement, "gateway");
    assert.equal(await discover(source, "department"), true);
  }
  assert.deepEqual(calls, catalog.list().map(() => 17));
});

test("Library source discovery rejects denied read, unsupported scope and foreign owners", async () => {
  const catalog = buildLibraryWorkspaceAnalysisSourceCatalog();
  const source = catalog.get("library.documents", 1)!;
  calls.length = 0;
  readAllowed = false;
  assert.equal(await discover(source, "personal"), false);

  const foreign = { ...source, ownerModuleKey: "finance" } satisfies WorkspaceAnalysisSourceDefinition;
  assert.equal(await discover(foreign, "personal"), false);
  assert.deepEqual(calls, [17]);
  readAllowed = true;
});

function discover(
  source: WorkspaceAnalysisSourceDefinition,
  targetType: "personal" | "department" | "project",
) {
  return canDiscoverLibraryWorkspaceAnalysisSource({ requesterId: 17, targetType, source });
}
