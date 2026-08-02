import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { WorkspaceSourcesOperationalAnalysisDefinition } from "@workspace/platform/workspace-analysis-source-contract";

let readAllowed = true;
let configureAllowed = false;
let apiUseAllowed = true;
let templateRow: { publishedRevision: number | null; revisions: Array<{ code: string }> } | null = null;
const templateQueries: unknown[] = [];
const executedDefinitions: unknown[] = [];
const createdTemplateInputs: unknown[] = [];
const createdRevisionInputs: unknown[] = [];

mock.module("@workspace/platform/server/auth", {
  namedExports: { evaluatePermissionAction: async () => true },
} as never);
mock.module("@workspace/platform/server/business-space-permissions", {
  namedExports: { isDepartmentResponsiblePositionUser: async () => false },
} as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      workspaceAnalysisTemplate: {
        findFirst: async (query: unknown) => {
          templateQueries.push(query);
          return templateRow;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdTemplateInputs.push(data);
          return { id: 41, name: data.name, revision: 1 };
        },
      },
      workspaceAnalysisTemplateRevision: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdRevisionInputs.push(data);
          return { id: 51, ...data };
        },
      },
      $transaction: async (action: (tx: unknown) => Promise<unknown>) => action({
        workspaceAnalysisTemplate: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdTemplateInputs.push(data);
            return { id: 41, name: data.name, revision: 1 };
          },
        },
        workspaceAnalysisTemplateRevision: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdRevisionInputs.push(data);
            return { id: 51, ...data };
          },
        },
      }),
    },
  },
} as never);
mock.module("@workspace/platform/service-result", {
  namedExports: {
    serviceOk: (data: unknown) => ({ ok: true, data }),
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
  },
} as never);
mock.module("./common", {
  namedExports: { buildYearMonthWhere: () => ({}) },
} as never);
mock.module("./domain/operational-analysis-template-validation", {
  namedExports: {
    validateOperationalAnalysisTemplate: (input: Record<string, unknown>) => "code" in input
      ? { ok: false, error: "internal code must not be parsed as external input" }
      : {
          ok: true,
          data: {
            ...input,
            description: input.description ?? null,
            code: `${JSON.stringify(input.definition)}\n`,
          },
        },
  },
} as never);
mock.module("./operational-analytics", {
  namedExports: {
    canReadOperationalAnalytics: async () => readAllowed,
    canConfigureOperationalAnalytics: async () => configureAllowed,
    canUseOperationalAnalyticsApi: async () => apiUseAllowed,
    operationalAnalyticsPermissionResourceKey: () => "finance.operationalAnalytics",
    operationalAnalyticsScopeId: () => "department:12",
  },
} as never);
mock.module("./shipment-department-scope", {
  namedExports: {
    hasDepartmentShipmentActivity: async () => false,
    hasPersonalShipmentActivity: async () => false,
  },
} as never);
mock.module("./workspace-analysis-runtime", {
  namedExports: {
    compileAuthorizedFinanceWorkspaceAnalysisDefinition: async () => ({ ok: true, data: {} }),
    runFinanceWorkspaceAnalysisRuntime: async (input: { definition: unknown }) => {
      executedDefinitions.push(input.definition);
      return { ok: true, data: { success: true, data: { schemaVersion: 1 } } };
    },
  },
} as never);

const {
  runWorkspaceSourcesOperationalAnalysisTemplateRuntime,
  saveOperationalAnalysisTemplate,
} = await import("./operational-analysis-templates");

const definition = {
  schemaVersion: 3,
  dataset: "workspace.sources",
  sources: [{ key: "shipments", sourceKey: "finance.shipments", sourceVersion: 1 }],
  filters: [],
  blocks: [{
    key: "count",
    kind: "metrics",
    source: "shipments",
    metrics: [{ key: "count", label: "发货笔数", operation: "count" }],
  }],
} satisfies WorkspaceSourcesOperationalAnalysisDefinition;

test("v3 template runtime executes only the requested published immutable revision", async (t) => {
  readAllowed = true;
  apiUseAllowed = true;
  templateQueries.length = 0;
  executedDefinitions.length = 0;

  await t.test("a stale client revision fails with 409 before execution", async () => {
    templateRow = { publishedRevision: 4, revisions: [{ code: JSON.stringify(definition) }] };
    const result = await runWorkspaceSourcesOperationalAnalysisTemplateRuntime({
      userId: 7,
      scope: { scopeType: "department", scopeId: 12 },
      templateId: 31,
      revision: 3,
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 409);
    assert.equal(executedDefinitions.length, 0);
  });

  await t.test("the published revision is loaded through the revision relation and executed", async () => {
    templateRow = { publishedRevision: 4, revisions: [{ code: JSON.stringify(definition) }] };
    const result = await runWorkspaceSourcesOperationalAnalysisTemplateRuntime({
      userId: 7,
      scope: { scopeType: "department", scopeId: 12 },
      templateId: 31,
      revision: 4,
      filterValues: { year: "2026" },
    });

    assert.equal(result.ok, true);
    assert.equal(executedDefinitions.length, 1);
    assert.deepEqual(executedDefinitions[0], definition);
    const query = templateQueries.at(-1) as {
      where: Record<string, unknown>;
      select: { revisions: { where: { revision: number }; select: Record<string, boolean> } };
    };
    assert.deepEqual(query.where, { id: 31, scopeType: "department", scopeId: 12, status: "active" });
    assert.deepEqual(query.select.revisions.where, { revision: 4 });
    assert.deepEqual(query.select.revisions.select, { code: true });
    assert.equal("code" in query.select, false, "mutable template head code must not be selected");
  });

  await t.test("API-key authorization is checked before the template query", async () => {
    apiUseAllowed = false;
    const before = templateQueries.length;
    const result = await runWorkspaceSourcesOperationalAnalysisTemplateRuntime({
      userId: 7,
      scope: { scopeType: "department", scopeId: 12 },
      templateId: 31,
      revision: 4,
      viaApiKey: true,
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
    assert.equal(templateQueries.length, before);
    apiUseAllowed = true;
  });
});

test("standard draft writes made with a personal API key require apiUse before persistence", async () => {
  configureAllowed = true;
  apiUseAllowed = false;
  const before = templateQueries.length;
  const result = await saveOperationalAnalysisTemplate(7, {
    input: {
      scopeType: "department",
      scopeId: 12,
      name: "API 草稿",
      definition,
    },
  }, { viaApiKey: true });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
  assert.equal(templateQueries.length, before);
  configureAllowed = false;
  apiUseAllowed = true;
});

test("standard draft creation validates external input once before persisting internal code", async () => {
  configureAllowed = true;
  apiUseAllowed = true;
  templateRow = null;
  createdTemplateInputs.length = 0;
  createdRevisionInputs.length = 0;

  const result = await saveOperationalAnalysisTemplate(7, {
    input: {
      scopeType: "department",
      scopeId: 12,
      name: "API 草稿",
      definition,
    },
  }, { viaApiKey: true });

  assert.equal(result.ok, true);
  assert.equal(createdTemplateInputs.length, 1);
  assert.equal(createdRevisionInputs.length, 1);
  assert.equal(typeof (createdTemplateInputs[0] as { code?: unknown }).code, "string");
  assert.equal((createdRevisionInputs[0] as { changeKind?: unknown }).changeKind, "draft");
  configureAllowed = false;
});
