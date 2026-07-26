import "server-only";

import { Prisma, prisma } from "./prisma";

type ProductMasterClient = Prisma.TransactionClient | typeof prisma;

export type ProductMasterItem = {
  id: number;
  code: string;
  name: string;
  specification: string | null;
};

const PRODUCT_SELECT = {
  id: true,
  code: true,
  name: true,
  strength: true,
} satisfies Prisma.ProductSelect;

function projectProduct(product: { id: number; code: string; name: string; strength: string | null }): ProductMasterItem {
  return { id: product.id, code: product.code, name: product.name, specification: product.strength };
}

export function normalizeProductReference(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

export async function listActiveFinishedGoods(client: ProductMasterClient = prisma): Promise<ProductMasterItem[]> {
  const products = await client.product.findMany({
    where: { status: "active" },
    select: PRODUCT_SELECT,
    orderBy: [{ name: "asc" }, { strength: "asc" }, { code: "asc" }],
  });
  return products.map(projectProduct);
}

export async function getActiveFinishedGood(productId: number, client: ProductMasterClient = prisma) {
  if (!Number.isInteger(productId) || productId <= 0) return Promise.resolve(null);
  const product = await client.product.findFirst({
    where: { id: productId, status: "active" },
    select: PRODUCT_SELECT,
  });
  return product ? projectProduct(product) : null;
}

export async function resolveUniqueFinishedGood(
  reference: { name: string; specification?: string | null },
  client: ProductMasterClient = prisma,
): Promise<ProductMasterItem | null> {
  const expectedName = normalizeProductReference(reference.name);
  const expectedSpecification = normalizeProductReference(reference.specification);
  if (!expectedName) return null;
  const products = await listActiveFinishedGoods(client);
  const matches = products.filter((product) =>
    normalizeProductReference(product.name) === expectedName
    && (reference.specification === undefined
      || normalizeProductReference(product.specification) === expectedSpecification));
  return matches.length === 1 ? matches[0] : null;
}
