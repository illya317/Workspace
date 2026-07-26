import assert from "node:assert/strict";
import test, { mock } from "node:test";

const findManyCalls: Array<Record<string, unknown>> = [];
const countCalls: Array<Record<string, unknown>> = [];
const importedAt = new Date("2026-04-01T08:00:00.000Z");

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      financeDataImport: {
        findMany: async (input: Record<string, unknown>) => {
          findManyCalls.push(input);
          return [{ id: 19, profile: "workshop-report", importedAt }];
        },
        count: async (input: Record<string, unknown>) => {
          countCalls.push(input);
          return 1;
        },
      },
    },
  },
} as never);

const { listImports } = await import("./import");

test("filters import headers by exact import id before pagination", async () => {
  const result = await listImports({ importId: 19, page: 1, pageSize: 20 });

  assert.deepEqual(findManyCalls, [{
    where: { id: 19 },
    orderBy: { importedAt: "desc" },
    skip: 0,
    take: 20,
  }]);
  assert.deepEqual(countCalls, [{ where: { id: 19 } }]);
  assert.deepEqual(result.data, [{ id: 19, profile: "workshop-report", importedAt }]);
  assert.deepEqual(result.pagination, { page: 1, pageSize: 20, total: 1, totalPages: 1 });
});
