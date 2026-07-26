import "server-only";

import { prisma } from "@workspace/platform/server/prisma";
import type { Prisma } from "@workspace/platform/server/prisma";

import type { ProductionProductSourceMappingAnalysisRow } from "./workspace-analysis-source-fields";

export const PRODUCT_SOURCE_MAPPING_PAGE_SIZE_LIMIT = 200;
export const PRODUCT_SOURCE_MAPPING_PAGE_LIMIT = 20;

const mappingSelect = {
  id: true,
  productId: true,
  productSkuId: true,
  sourceSystem: true,
  sourceName: true,
  sourceSpecification: true,
  status: true,
  sourceFile: true,
  product: { select: { id: true, code: true, name: true } },
  productSku: {
    select: {
      code: true,
      specification: true,
      productMaster: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.ProductSourceMappingSelect;

type ProductSourceMappingReadRow = Prisma.ProductSourceMappingGetPayload<{ select: typeof mappingSelect }>;

export async function listProductSourceMappingsPage(input: {
  readonly page: number;
  readonly pageSize: number;
}): Promise<{ readonly rows: readonly ProductionProductSourceMappingAnalysisRow[]; readonly total: number }> {
  if (!Number.isInteger(input.page) || input.page < 1 || input.page > PRODUCT_SOURCE_MAPPING_PAGE_LIMIT) {
    throw new Error(`产品来源映射页码必须在 1-${PRODUCT_SOURCE_MAPPING_PAGE_LIMIT} 之间`);
  }
  if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > PRODUCT_SOURCE_MAPPING_PAGE_SIZE_LIMIT) {
    throw new Error(`产品来源映射每页数量必须在 1-${PRODUCT_SOURCE_MAPPING_PAGE_SIZE_LIMIT} 之间`);
  }
  const [rows, total] = await Promise.all([
    prisma.productSourceMapping.findMany({
      select: mappingSelect,
      orderBy: { id: "asc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.productSourceMapping.count(),
  ]);
  return { rows: rows.map(projectProductSourceMapping), total };
}

function projectProductSourceMapping(row: ProductSourceMappingReadRow): ProductionProductSourceMappingAnalysisRow {
  const product = row.product ?? row.productSku?.productMaster ?? null;
  return {
    productId: product?.id ?? null,
    productCode: product?.code ?? null,
    productName: product?.name ?? null,
    id: row.id,
    targetKind: row.productSkuId ? "sku" : row.productId ? "product" : "pending",
    targetLabel: row.productSku
      ? `${row.productSku.code} ${row.productSku.specification ?? ""}`.trim()
      : row.productId ? row.product?.name ?? null : null,
    sourceSystem: row.sourceSystem,
    sourceName: row.sourceName,
    sourceSpecification: row.sourceSpecification,
    status: row.status,
    sourceFile: row.sourceFile,
  };
}
