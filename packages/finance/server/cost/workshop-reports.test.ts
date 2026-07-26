import assert from "node:assert/strict";
import test, { mock } from "node:test";

const findManyCalls: Array<Record<string, unknown>> = [];
const countCalls: Array<Record<string, unknown>> = [];
const row = {
  id: 51,
  importId: 19,
  year: 2026,
  month: 3,
  productName: "产品甲",
  batchNo: "B-001",
  workPoint: 12.5,
  quantity: 200,
  employeeId: 7,
  positionId: 9,
  sourceFile: "workshop.xlsx",
  sourceSheet: "3月",
  sourceRow: 8,
  createdAt: new Date("2026-04-01T08:00:00.000Z"),
  updatedAt: new Date("2026-04-02T08:00:00.000Z"),
};

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      financeWorkshopReport: {
        findMany: async (input: Record<string, unknown>) => {
          findManyCalls.push(input);
          return [row];
        },
        count: async (input: Record<string, unknown>) => {
          countCalls.push(input);
          return 3;
        },
      },
    },
  },
} as never);

const { listWorkshopReports } = await import("./workshop-reports");

test("loads complete paginated workshop facts with an exact import binding", async () => {
  const result = await listWorkshopReports({
    importId: 19,
    year: 2026,
    month: 3,
    productName: "产品甲",
    sourceFile: "workshop",
    page: 2,
    pageSize: 2,
  });

  const where = {
    importId: 19,
    year: 2026,
    month: 3,
    productName: { contains: "产品甲", mode: "insensitive" },
    sourceFile: { contains: "workshop", mode: "insensitive" },
  };
  assert.deepEqual(findManyCalls, [{
    where,
    orderBy: [
      { year: "desc" },
      { month: "desc" },
      { sourceRow: "asc" },
      { id: "asc" },
    ],
    skip: 2,
    take: 2,
  }]);
  assert.deepEqual(countCalls, [{ where }]);
  assert.deepEqual(result.data, [row]);
  assert.deepEqual(result.pagination, { page: 2, pageSize: 2, total: 3, totalPages: 2 });
});
