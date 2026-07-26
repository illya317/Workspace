import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";

mock.module("server-only", { namedExports: {} } as never);

let entryAllowed = false;
let readAllowed = false;
let summaryAllowed = false;
const actions: string[] = [];
mock.module("@workspace/platform/server/auth", {
  namedExports: {
    canEnterResource: async () => { actions.push("entry"); return entryAllowed; },
    evaluatePermissionAction: async () => { actions.push("read"); return readAllowed; },
  },
} as never);
mock.module("./performance-access", {
  namedExports: {
    canReadHrPerformanceSummary: async () => { actions.push("summary"); return summaryAllowed; },
  },
} as never);

const { canDiscoverHrWorkspaceAnalysisSource } = await import("./workspace-analysis-source-access");
const {
  HR_EMPLOYMENTS_ANALYSIS_SOURCE,
  HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
} = await import("./workspace-analysis-sources");

test("HR source discovery requires the registered read action", async () => {
  actions.length = 0;
  readAllowed = false;
  assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    source: HR_EMPLOYMENTS_ANALYSIS_SOURCE.definition,
  }), false);
  readAllowed = true;
  assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    source: HR_EMPLOYMENTS_ANALYSIS_SOURCE.definition,
  }), true);
  assert.deepEqual(actions, ["read", "read"]);
});

test("all HR analysis sources reuse their registered read contract without a second source permission", async () => {
  actions.length = 0;
  readAllowed = true;
  for (const registration of HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS) {
    assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
      requesterId: 7,
      targetType: "personal",
      targetId: 7,
      source: registration.definition,
    }), true);
  }
  assert.deepEqual(actions, HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.map(() => "read"));
});

test("HR performance discovery preserves self viewer semantics and original summary visibility", async () => {
  const performance = HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.find((registration) => (
    registration.definition.sourceKey === "hr.performance-attendance"
  ))!;
  actions.length = 0;
  readAllowed = true;
  summaryAllowed = false;

  assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    source: performance.definition,
  }), true);
  assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
    requesterId: 7,
    targetType: "department",
    targetId: 12,
    source: performance.definition,
  }), false);
  summaryAllowed = true;
  assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
    requesterId: 7,
    targetType: "project",
    targetId: 21,
    source: performance.definition,
  }), true);
  assert.deepEqual(actions, ["read", "read", "summary", "read", "summary"]);
});

test("HR performance review child sources inherit the same self and summary visibility", async () => {
  const reviewSources = HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.filter((registration) => (
    registration.definition.sourceKey === "hr.performance-review-details"
    || registration.definition.sourceKey === "hr.performance-review-evidence-values"
  ));
  actions.length = 0;
  readAllowed = true;
  summaryAllowed = false;

  for (const registration of reviewSources) {
    assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
      requesterId: 7,
      targetType: "personal",
      targetId: 7,
      source: registration.definition,
    }), true);
    assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
      requesterId: 7,
      targetType: "department",
      targetId: 12,
      source: registration.definition,
    }), false);
  }
  summaryAllowed = true;
  for (const registration of reviewSources) {
    assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
      requesterId: 7,
      targetType: "project",
      targetId: 21,
      source: registration.definition,
    }), true);
  }
  assert.deepEqual(actions, [
    "read", "read", "summary",
    "read", "read", "summary",
    "read", "summary", "read", "summary",
  ]);
});

test("HR source discovery rejects foreign registrations and evaluates entry explicitly", async () => {
  actions.length = 0;
  const foreign = {
    ...HR_EMPLOYMENTS_ANALYSIS_SOURCE.definition,
    ownerModuleKey: "finance",
  } satisfies WorkspaceAnalysisSourceDefinition;
  assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    source: foreign,
  }), false);
  assert.deepEqual(actions, []);

  entryAllowed = false;
  const entrySource = {
    ...HR_EMPLOYMENTS_ANALYSIS_SOURCE.definition,
    authorization: {
      ...HR_EMPLOYMENTS_ANALYSIS_SOURCE.definition.authorization,
      requiredActions: ["entry", "read"],
    },
  } satisfies WorkspaceAnalysisSourceDefinition;
  assert.equal(await canDiscoverHrWorkspaceAnalysisSource({
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    source: entrySource,
  }), false);
  assert.deepEqual(actions, ["entry"]);
});
