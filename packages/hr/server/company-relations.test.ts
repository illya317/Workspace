import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const permissionCalls: Array<{ resourceKey: string; action: string }> = [];
let allowedAction = "update";
let storedRelations = [relation(1, 1)];

mockModule("@workspace/platform/server/auth", {
  namedExports: {
    authorize: async ({ resourceKey, action }: { resourceKey: string; action: string }) => {
      permissionCalls.push({ resourceKey, action });
      return action === allowedAction;
    },
    isSuperAdmin: async () => false,
  },
});
mockModule("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: (data: unknown) => ({ ok: true, data }),
  },
});
mockModule("@workspace/platform/server/crud-factory", {
  namedExports: {
    createCrudExecutor: (config: {
      writeCheck?: (userId: number) => Promise<boolean>;
      deleteCheck?: (userId: number) => Promise<boolean>;
    }) => ({
      executeCreate: async (command: { userId: number }) => ({ ok: await config.writeCheck?.(command.userId) }),
      executeUpdateField: async (command: { userId: number }) => ({ ok: await config.writeCheck?.(command.userId) }),
      executeDelete: async (command: { userId: number }) => ({ ok: await config.deleteCheck?.(command.userId) }),
    }),
  },
});
mockModule("@workspace/platform/server/history", {
  namedExports: {
    ensureEditHistoryBaseline: async () => undefined,
    snapshotHistory: async () => undefined,
  },
});
mockModule("@workspace/platform/search", {
  namedExports: { matchSearchFields: () => true },
});
mockModule("./domain/company-relation-validation", {
  namedExports: {
    COMPANY_RELATION_ALLOWED_FIELDS: ["effectiveFrom", "effectiveTo"],
    buildCompanyRelationCreateCommand: async () => ({ ok: true, data: relation(0, 1) }),
    buildCompanyRelationFieldUpdateCommand: async (field: string, value: unknown) => ({ ok: true, data: { field, value } }),
    buildCompanyRelationPageDraftCommand: async (input: {
      userId: number;
      changes: Array<{ id: number; field: string; value: unknown; expectedVersion: number }>;
    }) => ({
      ok: true,
      data: {
        userId: input.userId,
        changes: input.changes.map((change) => ({
          id: change.id,
          expectedVersion: change.expectedVersion,
          data: { [change.field]: new Date(`${String(change.value)}T00:00:00.000Z`) },
        })),
      },
    }),
    validateCompanyRelationDeleteCommand: async () => ({ ok: true, data: { id: 1 } }),
  },
});
mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      companyRelation: {
        findMany: async () => storedRelations,
        findUnique: async () => storedRelations[0] ?? null,
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        const staged = structuredClone(storedRelations);
        const tx = {
          companyRelation: {
            findMany: async () => staged,
            updateMany: async ({ where, data }: {
              where: { id: number; version: number };
              data: Record<string, unknown>;
            }) => {
              const index = staged.findIndex((row) => row.id === where.id && row.version === where.version);
              if (index < 0) return { count: 0 };
              staged[index] = { ...staged[index], ...data, version: where.version + 1 } as typeof staged[number];
              return { count: 1 };
            },
          },
        };
        const result = await callback(tx);
        storedRelations = staged;
        return result;
      },
    },
  },
});

const {
  createCompanyRelation,
  deleteCompanyRelation,
  updateCompanyRelationField,
  updateCompanyRelationPageDraft,
} = await import("./company-relations");

test("company relation CRUD checks the hr.roster action that matches each operation", async () => {
  permissionCalls.length = 0;
  allowedAction = "create";
  assert.equal((await createCompanyRelation({ userId: 7, body: {} })).ok, true);
  allowedAction = "update";
  assert.equal((await updateCompanyRelationField({ userId: 7, id: 1, field: "effectiveTo", value: null })).ok, true);
  allowedAction = "delete";
  assert.equal((await deleteCompanyRelation({ userId: 7, id: 1, expectedVersion: 1 })).ok, true);
  assert.deepEqual(permissionCalls, [
    { resourceKey: "hr.roster", action: "create" },
    { resourceKey: "hr.roster", action: "update" },
    { resourceKey: "hr.roster", action: "delete" },
  ]);
});

test("page draft validates the final row and persists multiple fields in one versioned update", async () => {
  allowedAction = "update";
  storedRelations = [relation(1, 1)];
  const result = await updateCompanyRelationPageDraft({
    userId: 7,
    changes: [
      { id: 1, field: "effectiveFrom", value: "2027-01-01", expectedVersion: 1 },
      { id: 1, field: "effectiveTo", value: "2027-12-31", expectedVersion: 1 },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(storedRelations[0]?.version, 2);
  assert.equal(storedRelations[0]?.effectiveFrom.toISOString().slice(0, 10), "2027-01-01");
  assert.equal(storedRelations[0]?.effectiveTo.toISOString().slice(0, 10), "2027-12-31");
});

test("a stale page draft returns a conflict without changing the stored row", async () => {
  allowedAction = "update";
  storedRelations = [relation(1, 2)];
  const before = structuredClone(storedRelations);
  const result = await updateCompanyRelationPageDraft({
    userId: 7,
    changes: [{ id: 1, field: "effectiveTo", value: "2028-12-31", expectedVersion: 1 }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.deepEqual(storedRelations, before);
});

function relation(id: number, version: number) {
  return {
    id,
    parentId: 1,
    childId: 2,
    shareRatio: 0.75,
    isConsolidated: true,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-12-31T00:00:00.000Z"),
    version,
  };
}
