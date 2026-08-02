import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);
mock.module("@workspace/platform/service-result", {
  namedExports: {
    serviceOk: (data: unknown) => ({ ok: true, data }),
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
  },
} as never);
mock.module("./operational-analytics", {
  namedExports: {
    canConfigureOperationalAnalytics: async () => true,
    canUseOperationalAnalyticsApi: async () => true,
  },
} as never);

const { buildOperationalAnalysisTemplateApiContract } = await import("./operational-analysis-api-contract");

test("template contract exposes normal API routes, JSON schemas and an API-only example", () => {
  const contract = buildOperationalAnalysisTemplateApiContract({ scopeType: "department", scopeId: 797 });
  assert.equal(
    contract.routes.createDraft,
    "POST /api/modules/finance/cost/operational-analytics/spaces/department/797/templates",
  );
  assert.match(contract.routes.discoverSources, /keyword=<required>/);
  const createSchema = contract.bodySchemas.createDraft as {
    required?: string[];
    properties?: Record<string, unknown>;
  };
  assert.deepEqual(createSchema.required, ["name", "definition"]);
  assert.equal("scopeType" in (createSchema.properties ?? {}), false);
  assert.equal("scopeId" in (createSchema.properties ?? {}), false);
  assert.equal(contract.example.createDraft.definition.schemaVersion, 3);
  assert.equal(contract.example.createDraft.definition.dataset, "workspace.sources");
});
