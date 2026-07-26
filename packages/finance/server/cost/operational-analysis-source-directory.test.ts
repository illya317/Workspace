import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { WorkspaceAnalysisSourceProvider } from "@workspace/platform/server/workspace-analysis-source-directory";

mock.module("server-only", { namedExports: {} } as never);

let readAllowed = true;
let apiUseAllowed = true;
const readCalls: Array<[number, string, number]> = [];
const apiUseCalls: Array<[number, string, number]> = [];
const remoteProviderInputs: Array<{ ownerUnitId: string; apiModulePathSegment?: string; timeoutMs?: number }> = [];
mock.module("@workspace/platform/server/auth", {
  namedExports: {
    canEnterResource: async () => true,
    evaluatePermissionAction: async () => true,
  },
} as never);
mock.module("./operational-analytics", {
  namedExports: {
    canReadOperationalAnalytics: async (userId: number, targetType: string, targetId: number) => {
      readCalls.push([userId, targetType, targetId]);
      return readAllowed;
    },
    canUseOperationalAnalyticsApi: async (userId: number, targetType: string, targetId: number) => {
      apiUseCalls.push([userId, targetType, targetId]);
      return apiUseAllowed;
    },
    executeOperationalAnalyticsShipmentList: async () => ({
      ok: true,
      data: { success: true, data: [], pagination: { total: 0 } },
    }),
  },
} as never);
mock.module("@workspace/platform/server/api", {
  namedExports: {
    serviceOk: (data: unknown) => ({ ok: true, data }),
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    isPlatformServiceResult: () => false,
    jsonErrorResponse: () => new Response(null, { status: 400 }),
    serviceResponse: (result: unknown) => result,
  },
} as never);
mock.module("@workspace/platform/server/workspace-analysis-source-rpc", {
  namedExports: {
    createRemoteWorkspaceAnalysisSourceProvider: (input: { ownerUnitId: string; apiModulePathSegment?: string }) => {
      remoteProviderInputs.push(input);
      return {
        ownerUnitId: input.ownerUnitId,
        listAvailableSources: async () => [],
      };
    },
  },
} as never);

const {
  buildFinanceOperationalAnalysisSourceDirectory,
  discoverOperationalAnalysisSources,
  listOperationalAnalysisSources,
} = await import("./operational-analysis-source-directory");

const emptyHrProvider: WorkspaceAnalysisSourceProvider = {
  ownerUnitId: "hr",
  listAvailableSources: async () => [],
};

test("default directory composes every domain owner and maps the legacy capital API segment", () => {
  remoteProviderInputs.length = 0;
  assert.doesNotThrow(() => buildFinanceOperationalAnalysisSourceDirectory());
  assert.deepEqual(remoteProviderInputs.map(({ ownerUnitId }) => ownerUnitId), [
    "administration",
    "capital-securities",
    "external",
    "hr",
    "inventory",
    "library",
    "production",
    "work",
  ]);
  assert.equal(
    remoteProviderInputs.find(({ ownerUnitId }) => ownerUnitId === "capital-securities")?.apiModulePathSegment,
    "capitalSecurities",
  );
  assert.equal(remoteProviderInputs.every(({ timeoutMs }) => timeoutMs === 2_000), true);
});

test("runtime directory can limit remote discovery to referenced owners with a cold-start budget", () => {
  remoteProviderInputs.length = 0;
  assert.doesNotThrow(() => buildFinanceOperationalAnalysisSourceDirectory({
    remoteOwnerUnitIds: ["hr", "work"],
    remoteProviderTimeoutMs: 10_000,
  }));
  assert.deepEqual(remoteProviderInputs, [
    { ownerUnitId: "hr", callerUnitId: "finance", timeoutMs: 10_000 },
    { ownerUnitId: "work", callerUnitId: "finance", timeoutMs: 10_000 },
  ]);
});

test("Finance composition exposes the personal source only to personal space and company-wide sources to every space", async () => {
  readAllowed = true;
  readCalls.length = 0;
  const directory = buildFinanceOperationalAnalysisSourceDirectory({ remoteProviders: [emptyHrProvider] });

  const personal = await directory.list({ requesterId: 7, targetType: "personal", targetId: 7 });
  const personalKeys = personal.sources.map((source) => source.sourceKey);
  assert.equal(personalKeys.includes("finance.shipments"), true);
  const department = await directory.list({ requesterId: 7, targetType: "department", targetId: 12 });
  const project = await directory.list({ requesterId: 7, targetType: "project", targetId: 22 });
  const companyWide = personalKeys.filter((sourceKey) => sourceKey !== "finance.shipments");
  assert.deepEqual(department.sources.map((source) => source.sourceKey), companyWide);
  assert.deepEqual(project.sources.map((source) => source.sourceKey), companyWide);
  assert.deepEqual(readCalls, [[7, "personal", 7]]);
});

test("source discovery checks outer space access before invoking any provider", async () => {
  readAllowed = false;
  let directoryCalls = 0;
  const result = await listOperationalAnalysisSources(7, { scopeType: "department", scopeId: 12 }, {
    viaApiKey: false,
  }, {
    list: async () => {
      directoryCalls += 1;
      return { sources: [], providers: [], authorizedSources: null as never };
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
  assert.equal(directoryCalls, 0);
});

test("source discovery preserves explicit optional-provider availability diagnostics", async () => {
  readAllowed = true;
  const result = await listOperationalAnalysisSources(7, { scopeType: "personal", scopeId: 7 }, {}, {
    list: async () => ({
      sources: [],
      providers: [
        { ownerUnitId: "finance", status: "available" as const, sourceCount: 0 },
        { ownerUnitId: "hr", status: "unavailable" as const, sourceCount: 0 },
      ],
      authorizedSources: null as never,
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.data.providers[1], { ownerUnitId: "hr", status: "unavailable", sourceCount: 0 });
});

test("API key source discovery requires apiUse in addition to read", async () => {
  readAllowed = true;
  apiUseAllowed = false;
  apiUseCalls.length = 0;
  let directoryCalls = 0;
  const result = await listOperationalAnalysisSources(7, { scopeType: "personal", scopeId: 7 }, {
    viaApiKey: true,
  }, {
    list: async () => {
      directoryCalls += 1;
      return { sources: [], providers: [], authorizedSources: null as never };
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
  assert.deepEqual(apiUseCalls, [[7, "personal", 7]]);
  assert.equal(directoryCalls, 0);
  apiUseAllowed = true;
});

test("standard source discovery searches and expands an exact selected definition", async () => {
  readAllowed = true;
  apiUseAllowed = true;
  const directory = buildFinanceOperationalAnalysisSourceDirectory({ remoteProviders: [emptyHrProvider] });
  const result = await discoverOperationalAnalysisSources(7, {
    scopeType: "department",
    scopeId: 12,
  }, {
    keyword: "成本",
    page: 1,
    pageSize: 20,
    selected: [{ sourceKey: "finance.cost.structure", sourceVersion: 1 }],
  }, { viaApiKey: true }, directory);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.data.sources.some((source) => source.sourceKey === "finance.cost.structure"), true);
  assert.equal(result.data.data.selected[0]?.sourceKey, "finance.cost.structure");
  assert.equal(result.data.data.selected[0]?.fields.some((field) => field.key === "manufacturingSubtotal"), true);
  assert.equal(
    result.data.data.links.templateContract,
    "/api/modules/finance/cost/operational-analytics/spaces/department/12/templates/contract",
  );
});
