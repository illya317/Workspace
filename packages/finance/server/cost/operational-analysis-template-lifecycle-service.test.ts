import assert from "node:assert/strict";
import test, { mock } from "node:test";

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
};

const current = {
  id: 31,
  name: "销售概览",
  description: "当前草稿",
  status: "active",
  revision: 2,
  publishedRevision: 1,
  updatedAt: new Date("2026-07-26T00:00:00.000Z"),
};
const source = {
  revision: 2,
  name: current.name,
  description: current.description,
  code: JSON.stringify(definition),
  changeKind: "draft",
};

let compileCalls = 0;
let runtimeCalls = 0;
let templateUpdate: Record<string, unknown> | null = null;
let revisionCreate: Record<string, unknown> | null = null;

mock.module("@workspace/platform/service-result", {
  namedExports: {
    serviceOk: (data: unknown) => ({ ok: true, data }),
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
  },
} as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      workspaceAnalysisTemplate: {
        findFirst: async (query: { select?: { revisions?: unknown } }) => query.select?.revisions
          ? { status: current.status, revision: current.revision, revisions: [{ code: source.code }] }
          : current,
      },
      workspaceAnalysisTemplateRevision: {
        findFirst: async () => source,
      },
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
        workspaceAnalysisTemplate: {
          updateMany: async (query: { data: Record<string, unknown> }) => {
            templateUpdate = query.data;
            return { count: 1 };
          },
          findUnique: async () => ({
            ...current,
            revision: 3,
            publishedRevision: 3,
            updatedAt: new Date("2026-07-26T01:00:00.000Z"),
          }),
        },
        workspaceAnalysisTemplateRevision: {
          create: async (query: { data: Record<string, unknown> }) => {
            revisionCreate = query.data;
            return query.data;
          },
        },
      }),
    },
  },
} as never);
mock.module("./operational-analytics", {
  namedExports: {
    canConfigureOperationalAnalytics: async () => true,
    canUseOperationalAnalyticsApi: async () => true,
  },
} as never);
mock.module("./workspace-analysis-runtime", {
  namedExports: {
    compileAuthorizedFinanceWorkspaceAnalysisDefinition: async () => {
      compileCalls += 1;
      return { ok: true, data: {} };
    },
    runFinanceWorkspaceAnalysisRuntime: async () => {
      runtimeCalls += 1;
      return { ok: true, data: { success: true, data: { schemaVersion: 1 } } };
    },
  },
} as never);

const {
  executeOperationalAnalysisTemplateLifecycle,
  runOperationalAnalysisTemplateRevisionPreview,
} = await import("./operational-analysis-template-lifecycle");

test("publishing reauthorizes the draft and atomically appends a copy-forward published revision", async () => {
  compileCalls = 0;
  templateUpdate = null;
  revisionCreate = null;
  const result = await executeOperationalAnalysisTemplateLifecycle({
    userId: 7,
    scope: { scopeType: "department", scopeId: 12 },
    templateId: 31,
    command: { action: "publish", expectedRevision: 2, reason: "财务确认" },
  });

  assert.equal(result.ok, true);
  assert.equal(compileCalls, 1);
  const persistedTemplateUpdate = templateUpdate as Record<string, unknown> | null;
  const persistedRevisionCreate = revisionCreate as Record<string, unknown> | null;
  assert.ok(persistedTemplateUpdate);
  assert.ok(persistedRevisionCreate);
  assert.equal(persistedTemplateUpdate.revision, 3);
  assert.equal(persistedTemplateUpdate.publishedRevision, 3);
  assert.equal(persistedRevisionCreate.revision, 3);
  assert.equal(persistedRevisionCreate.changeKind, "publish");
  assert.equal(persistedRevisionCreate.sourceRevision, 2);
  assert.equal(persistedRevisionCreate.reason, "财务确认");
});

test("draft preview uses the exact requested snapshot without changing lifecycle state", async () => {
  runtimeCalls = 0;
  templateUpdate = null;
  const result = await runOperationalAnalysisTemplateRevisionPreview({
    userId: 7,
    scope: { scopeType: "department", scopeId: 12 },
    templateId: 31,
    expectedRevision: 2,
    revision: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(runtimeCalls, 1);
  assert.equal(templateUpdate, null);
});
