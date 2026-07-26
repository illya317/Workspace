import { matchSearchFields } from "@workspace/platform/search";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { ProductCatalogResponse, ProductRecord } from "@workspace/production/types";
import {
  validateProductCreateCommand,
  validateProductSkuCreateCommand,
  validateProductSkuUpdateCommand,
  validateProductUpdateCommand,
  type ProductCreateCommand,
  type ProductSkuCreateCommand,
  type ProductSkuUpdateCommand,
  type ProductUpdateCommand,
} from "../domain/product-validation";

const include = {
  skus: {
    include: { productSourceMappings: { orderBy: { id: "desc" as const }, take: 100 } },
    orderBy: [{ status: "asc" as const }, { code: "asc" as const }],
  },
  sourceMappings: {
    include: { productSku: { select: { code: true, specification: true } } },
    orderBy: { id: "desc" as const },
    take: 100,
  },
} satisfies Prisma.ProductInclude;

type ProductWithDetails = Prisma.ProductGetPayload<{ include: typeof include }>;

function decimal(value: Prisma.Decimal | null) {
  return value === null ? null : Number(value);
}

function projectProduct(row: ProductWithDetails): ProductRecord {
  const skuById = new Map(row.skus.map((sku) => [sku.id, sku]));
  const mappings = [...row.sourceMappings, ...row.skus.flatMap((sku) => sku.productSourceMappings)];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    dosageForm: row.dosageForm,
    strength: row.strength,
    approvalNumber: row.approvalNumber,
    status: row.status === "inactive" ? "inactive" : "active",
    note: row.note,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    skus: row.skus.map((sku) => ({
      id: sku.id,
      productMasterId: row.id,
      code: sku.code,
      name: sku.name,
      specification: sku.specification,
      baseUnit: sku.baseUnit,
      contentUnit: sku.contentUnit,
      unitsPerPackage: decimal(sku.unitsPerPackage),
      packagesPerCase: decimal(sku.packagesPerCase),
      barcode: sku.barcode,
      status: sku.status === "inactive" ? "inactive" : "active",
      version: sku.version,
    })),
    sourceMappings: mappings.map((mapping) => {
      const targetSku = mapping.productSkuId ? skuById.get(mapping.productSkuId) : null;
      return {
        id: mapping.id,
        targetKind: mapping.productSkuId ? "sku" : mapping.productId ? "product" : "pending",
        targetLabel: targetSku ? `${targetSku.code} ${targetSku.specification ?? ""}`.trim() : mapping.productId ? row.name : null,
        sourceSystem: mapping.sourceSystem,
        sourceName: mapping.sourceName,
        sourceSpecification: mapping.sourceSpecification,
        status: mapping.status,
        sourceFile: mapping.sourceFile,
      };
    }),
  };
}

export async function listProducts(input: { keyword?: string }): Promise<ProductCatalogResponse> {
  const [rows, pendingMappings] = await Promise.all([
    prisma.product.findMany({ include, orderBy: [{ status: "asc" }, { code: "asc" }] }),
    prisma.productSourceMapping.findMany({ where: { status: "pending" }, orderBy: { id: "desc" }, take: 200 }),
  ]);
  const projected = rows.map(projectProduct);
  const items = input.keyword
    ? projected.filter((item) => matchSearchFields(item, input.keyword ?? "", ["code", "name", "dosageForm", "strength", "approvalNumber", "skus.code", "skus.specification"]))
    : projected;
  const pendingMappingDtos = pendingMappings.map((mapping) => ({
    id: mapping.id,
    targetKind: "pending" as const,
    targetLabel: null,
    sourceSystem: mapping.sourceSystem,
    sourceName: mapping.sourceName,
    sourceSpecification: mapping.sourceSpecification,
    status: mapping.status,
    sourceFile: mapping.sourceFile,
  }));
  const sourceMappingIds = new Set([
    ...items.flatMap((item) => item.sourceMappings.map((mapping) => mapping.id)),
    ...pendingMappingDtos.map((mapping) => mapping.id),
  ]);
  return {
    items,
    total: items.length,
    skuCount: items.reduce((sum, item) => sum + item.skus.length, 0),
    sourceMappingCount: sourceMappingIds.size,
    pendingMappingCount: pendingMappings.length,
    pendingMappings: pendingMappingDtos,
  };
}

function mapWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return serviceError("产品编码、产品名称与规格组合或 SKU 编码已存在", 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return serviceError("记录不存在", 404);
  throw error;
}

export async function commitProductCreateCommand(rawCommand: ProductCreateCommand) {
  const validation = validateProductCreateCommand(rawCommand);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const product = await prisma.$transaction(async (tx) => {
      const row = await tx.product.create({ data: { ...command.data, editedByUserId: command.userId }, include });
      await snapshotHistory("Product", row.id, command.userId, tx);
      return row;
    });
    return serviceOk({ success: true, record: projectProduct(product) });
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function commitProductUpdateCommand(rawCommand: ProductUpdateCommand) {
  const validation = validateProductUpdateCommand(rawCommand);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id: command.id } });
      if (!current) return serviceError("产品不存在", 404);
      if (current.version !== command.expectedVersion) return serviceError("记录已被其他人修改，请刷新后重试", 409);
      await ensureEditHistoryBaseline("Product", command.id, command.userId, tx);
      const row = await tx.product.update({ where: { id: command.id }, data: { ...command.data, editedByUserId: command.userId, version: { increment: 1 } }, include });
      await snapshotHistory("Product", row.id, command.userId, tx);
      return serviceOk({ success: true, record: projectProduct(row) });
    });
  } catch (error) {
    return mapWriteError(error);
  }
}

async function resolveSkuCompanyCode(tx: Prisma.TransactionClient, productId: number) {
  const existing = await tx.inventoryItem.findFirst({ where: { productMasterId: productId }, select: { companyCode: true } });
  if (existing?.companyCode) return existing.companyCode;
  const anyFinishedGood = await tx.inventoryItem.findFirst({ where: { itemType: "finished_goods" }, orderBy: { id: "asc" }, select: { companyCode: true } });
  return anyFinishedGood?.companyCode ?? null;
}

export async function commitProductSkuCreateCommand(rawCommand: ProductSkuCreateCommand) {
  const validation = validateProductSkuCreateCommand(rawCommand);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: command.productId } });
      if (!product) return serviceError("产品不存在", 404);
      const companyCode = await resolveSkuCompanyCode(tx, product.id);
      if (!companyCode) return serviceError("首次建立 SKU 请先导入产成品入库表，以确定库存账套", 409);
      const row = await tx.inventoryItem.create({ data: { ...command.data, companyCode, itemType: "finished_goods", productMasterId: product.id, editedBy: command.userId } });
      await snapshotHistory("InventoryItem", row.id, command.userId, tx);
      return serviceOk({ success: true, id: row.id });
    });
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function commitProductSkuUpdateCommand(rawCommand: ProductSkuUpdateCommand) {
  const validation = validateProductSkuUpdateCommand(rawCommand);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.inventoryItem.findFirst({ where: { id: command.id, itemType: "finished_goods", productMasterId: { not: null } } });
      if (!current) return serviceError("SKU 不存在", 404);
      if (current.version !== command.expectedVersion) return serviceError("记录已被其他人修改，请刷新后重试", 409);
      await ensureEditHistoryBaseline("InventoryItem", current.id, command.userId, tx);
      const row = await tx.inventoryItem.update({ where: { id: current.id }, data: { ...command.data, editedBy: command.userId, version: { increment: 1 } } });
      await snapshotHistory("InventoryItem", row.id, command.userId, tx);
      return serviceOk({ success: true, id: row.id });
    });
  } catch (error) {
    return mapWriteError(error);
  }
}
