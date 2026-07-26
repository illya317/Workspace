import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const queries: Array<Record<string, unknown>> = [];
const databaseRows = [
  ...Array.from({ length: 120 }, (_, index) => rawMapping(index + 1, "product")),
  rawMapping(121, "sku"),
  ...Array.from({ length: 221 }, (_, index) => rawMapping(index + 122, "pending")),
];

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      productSourceMapping: {
        findMany: async (query: Record<string, unknown>) => {
          queries.push(query);
          const skip = query.skip as number;
          const take = query.take as number;
          return databaseRows.slice(skip, skip + take);
        },
        count: async () => databaseRows.length,
      },
    },
  },
} as never);

const { listProductSourceMappingsPage } = await import("./workspace-analysis-product-source-mappings");

test("dedicated mapping reader returns every linked and pending row through true pagination", async () => {
  const first = await listProductSourceMappingsPage({ page: 1, pageSize: 200 });
  const second = await listProductSourceMappingsPage({ page: 2, pageSize: 200 });
  const rows = [...first.rows, ...second.rows];

  assert.equal(first.total, 342);
  assert.equal(second.total, 342);
  assert.equal(rows.length, 342);
  assert.equal(rows.filter((row) => row.targetKind !== "pending").length, 121);
  assert.equal(rows.filter((row) => row.targetKind === "pending").length, 221);
  assert.deepEqual(queries.map(({ orderBy, skip, take }) => ({ orderBy, skip, take })), [
    { orderBy: { id: "asc" }, skip: 0, take: 200 },
    { orderBy: { id: "asc" }, skip: 200, take: 200 },
  ]);
  assert.deepEqual(rows[120], {
    productId: 9,
    productCode: "P09",
    productName: "产品九",
    id: 121,
    targetKind: "sku",
    targetLabel: "SKU09 9ml",
    sourceSystem: "erp",
    sourceName: "来源产品 121",
    sourceSpecification: "9ml",
    status: "confirmed",
    sourceFile: "products.xlsx",
  });
});

test("dedicated mapping reader rejects pages outside its 4000-row execution envelope", async () => {
  const callsBefore = queries.length;
  await assert.rejects(() => listProductSourceMappingsPage({ page: 21, pageSize: 200 }), /页码必须在 1-20/);
  await assert.rejects(() => listProductSourceMappingsPage({ page: 1, pageSize: 201 }), /每页数量必须在 1-200/);
  assert.equal(queries.length, callsBefore);
});

function rawMapping(id: number, target: "product" | "sku" | "pending") {
  const product = target === "product" ? { id: 1, code: "P01", name: "产品甲" } : null;
  const productSku = target === "sku" ? {
    code: "SKU09",
    specification: "9ml",
    productMaster: { id: 9, code: "P09", name: "产品九" },
  } : null;
  return {
    id,
    productId: product?.id ?? null,
    productSkuId: productSku ? 90 : null,
    sourceSystem: "erp",
    sourceName: `来源产品 ${id}`,
    sourceSpecification: target === "sku" ? "9ml" : "10ml",
    status: target === "pending" ? "pending" : "confirmed",
    sourceFile: "products.xlsx",
    product,
    productSku,
  };
}
