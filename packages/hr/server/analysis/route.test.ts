import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const catalog = { kind: "hr-analysis-catalog" };
const canDiscover = async () => true;
const executeSource = async () => ({ rows: [] });
let handlerCalls = 0;
const handler = async () => {
  handlerCalls += 1;
  return new Response(null, { status: 204 });
};
let capturedConfiguration: Record<string, unknown> | null = null;

mock.module("@workspace/platform/server/workspace-analysis-source-rpc", {
  namedExports: {
    createWorkspaceAnalysisSourceRpcHandler: (configuration: Record<string, unknown>) => {
      capturedConfiguration = configuration;
      return handler;
    },
  },
} as never);
mock.module("./source-access", {
  namedExports: {
    buildHrWorkspaceAnalysisSourceCatalog: () => catalog,
    canDiscoverHrWorkspaceAnalysisSource: canDiscover,
  },
} as never);
mock.module("./source-executor", {
  namedExports: { loadHrWorkspaceAnalysisSource: executeSource },
} as never);

const analysis = await import("../analysis");

test("the HR analysis interface exposes one lazy route intent and the registered source catalog", async () => {
  assert.deepEqual(Object.keys(analysis).sort(), [
    "HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS",
    "createHrWorkspaceAnalysisSourceRoute",
  ]);

  const route = analysis.createHrWorkspaceAnalysisSourceRoute();
  assert.equal(capturedConfiguration, null);

  const firstResponse = await route(new Request("http://localhost/test/api/modules/hr/internal/workspace-analysis-sources"));
  const secondResponse = await route(new Request("http://localhost/test/api/modules/hr/internal/workspace-analysis-sources"));

  assert.equal(firstResponse.status, 204);
  assert.equal(secondResponse.status, 204);
  assert.equal(handlerCalls, 2);
  assert.deepEqual(capturedConfiguration, {
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: catalog,
    canDiscover,
    executeSource,
  });
  assert.ok(analysis.HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.length > 0);
});
