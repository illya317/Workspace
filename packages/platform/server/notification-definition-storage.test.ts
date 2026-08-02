import assert from "node:assert/strict";
import test, { mock } from "node:test";

type DefinitionHead = {
  id: number;
  key: string;
  label: string;
  description: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  hrefTemplate: string | null;
  responseMode: string;
  isImportant: boolean;
  allowProjectMonitoring: boolean;
  variableKeysJson: string;
  allowUserApi: boolean;
  allowedOpenApiClientIdsJson: string;
  status: string;
  revision: number;
  publishedRevision: number | null;
  version: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const operations: string[] = [];
const lifecycleEvents: Array<{
  revision: number;
  action: string;
  priorVersion: number;
  newVersion: number;
}> = [];
let transactionActive = false;
let definition: DefinitionHead | null = null;

const tx = {
  notificationDefinition: {
    create: async ({ data }: { data: Partial<DefinitionHead> }) => {
      operations.push("definition:create");
      const now = new Date("2026-07-31T08:00:00.000Z");
      definition = {
        id: 31,
        key: data.key!,
        label: data.label!,
        description: data.description ?? null,
        titleTemplate: data.titleTemplate!,
        bodyTemplate: data.bodyTemplate!,
        hrefTemplate: data.hrefTemplate ?? null,
        responseMode: data.responseMode!,
        isImportant: data.isImportant!,
        allowProjectMonitoring: data.allowProjectMonitoring!,
        variableKeysJson: data.variableKeysJson!,
        allowUserApi: data.allowUserApi!,
        allowedOpenApiClientIdsJson: data.allowedOpenApiClientIdsJson!,
        status: data.status!,
        revision: data.revision!,
        publishedRevision: null,
        version: data.version!,
        publishedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      return { ...definition };
    },
    findUnique: async ({ where }: { where: { id?: number; key?: string } }) => {
      operations.push("definition:read");
      if (!definition) return null;
      if (where.id !== undefined && where.id !== definition.id) return null;
      if (where.key !== undefined && where.key !== definition.key) return null;
      return { ...definition };
    },
    updateMany: async ({ where, data }: {
      where: { id?: number; version?: number; revision?: number; status?: string };
      data: Record<string, unknown>;
    }) => {
      operations.push("definition:update");
      if (
        !definition
        || (where.id !== undefined && where.id !== definition.id)
        || (where.version !== undefined && where.version !== definition.version)
        || (where.revision !== undefined && where.revision !== definition.revision)
        || (where.status !== undefined && where.status !== definition.status)
      ) return { count: 0 };
      for (const [key, value] of Object.entries(data)) {
        if (key === "version") continue;
        (definition as unknown as Record<string, unknown>)[key] = value;
      }
      definition.version += 1;
      definition.updatedAt = new Date("2026-07-31T08:01:00.000Z");
      return { count: 1 };
    },
  },
  notificationDefinitionRevision: {
    create: async () => {
      operations.push("revision:create");
      return { id: lifecycleEvents.length + 1 };
    },
  },
  $executeRaw: async (query: { values: unknown[] }) => {
    assert.equal(transactionActive, true, "lifecycle insert must run inside the head transaction");
    operations.push("lifecycle:append");
    lifecycleEvents.push({
      revision: Number(query.values[2]),
      action: String(query.values[3]),
      priorVersion: Number(query.values[6]),
      newVersion: Number(query.values[7]),
    });
    return 1;
  },
};

mock.module("./prisma", {
  namedExports: {
    Prisma: {
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    },
    prisma: {
      openApiClient: { findMany: async () => [] },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        operations.push("transaction:start");
        transactionActive = true;
        try {
          const result = await callback(tx);
          operations.push("transaction:commit");
          return result;
        } finally {
          transactionActive = false;
        }
      },
    },
  },
} as never);

const {
  commitNotificationDefinitionArchivedState,
  publishNotificationDefinition,
  saveNotificationDefinition,
} = await import("./notification-definition-storage");

const draft = {
  key: "custom.project.deadline",
  label: "项目节点提醒",
  description: null,
  titleTemplate: "{{project_name}} 即将到期",
  bodyTemplate: "请关注 {{project_name}} 的计划节点。",
  hrefTemplate: "/work/project/{{project_id}}",
  responseMode: "read" as const,
  isImportant: false,
  allowProjectMonitoring: true,
  allowUserApi: false,
  allowedOpenApiClientIds: [],
};

test("definition lifecycle writes create, save, publish and archive facts in head transactions", async () => {
  definition = null;
  operations.length = 0;
  lifecycleEvents.length = 0;

  const created = await saveNotificationDefinition(7, draft);
  assert.equal(created.ok, true);
  const saved = await saveNotificationDefinition(7, { ...draft, id: 31, expectedVersion: 1 });
  assert.equal(saved.ok, true);
  const published = await publishNotificationDefinition(7, draft.key, 2);
  assert.equal(published.ok, true);
  const archived = await commitNotificationDefinitionArchivedState(7, draft.key, 3);
  assert.equal(archived.ok, true);

  assert.deepEqual(lifecycleEvents, [
    { revision: 1, action: "created", priorVersion: 0, newVersion: 1 },
    { revision: 2, action: "saved", priorVersion: 1, newVersion: 2 },
    { revision: 2, action: "published", priorVersion: 2, newVersion: 3 },
    { revision: 2, action: "archived", priorVersion: 3, newVersion: 4 },
  ]);
  assert.equal(operations.filter((operation) => operation === "transaction:start").length, 4);
  assert.equal(operations.filter((operation) => operation === "transaction:commit").length, 4);
});

test("renaming an existing definition fails before head, revision or lifecycle writes", async () => {
  definition = null;
  operations.length = 0;
  lifecycleEvents.length = 0;
  const created = await saveNotificationDefinition(7, draft);
  assert.equal(created.ok, true);
  const existingDefinition = definition as DefinitionHead | null;
  assert.ok(existingDefinition);
  const operationStart = operations.length;
  const lifecycleStart = lifecycleEvents.length;
  const result = await saveNotificationDefinition(7, {
    ...draft,
    id: existingDefinition.id,
    expectedVersion: existingDefinition.version,
    key: "custom.project.renamed",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(result.error, "通知定义创建后不能修改 key");
  assert.equal(lifecycleEvents.length, lifecycleStart);
  assert.deepEqual(operations.slice(operationStart), [
    "transaction:start",
    "definition:read",
    "transaction:commit",
  ]);
});
