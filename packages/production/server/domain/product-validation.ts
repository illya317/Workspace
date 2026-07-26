import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { ProductCreateInput, ProductSkuCreateInput, ProductSkuUpdateInput, ProductUpdateInput } from "../products/schemas";

function text(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function productIdentityKey(name: string, strength?: string | null) {
  return [name, strength].map((value) => (value ?? "").normalize("NFKC").replace(/[\s（）()]/g, "").toLowerCase()).join("|");
}

export interface ProductCreateCommand {
  userId: number;
  data: {
    code: string;
    identityKey: string;
    name: string;
    dosageForm: string | null;
    strength: string | null;
    approvalNumber: string | null;
    status: "active" | "inactive";
    note: string | null;
  };
}

export interface ProductUpdateCommand extends ProductCreateCommand {
  id: number;
  expectedVersion: number;
}

export interface ProductSkuCreateCommand {
  productId: number;
  userId: number;
  data: Omit<ProductSkuCreateInput, "status"> & { status: "active" | "inactive" };
}

export interface ProductSkuUpdateCommand {
  id: number;
  userId: number;
  expectedVersion: number;
  data: Omit<ProductSkuUpdateInput, "expectedVersion">;
}

function productData(input: ProductCreateInput) {
  const name = input.name.trim();
  const strength = text(input.strength);
  return {
    code: input.code.trim(),
    identityKey: productIdentityKey(name, strength),
    name,
    dosageForm: text(input.dosageForm),
    strength,
    approvalNumber: text(input.approvalNumber),
    status: input.status ?? "active",
    note: text(input.note),
  };
}

export function buildProductCreateCommand(input: { body: ProductCreateInput; userId: number }): DomainValidationResult<ProductCreateCommand> {
  if (!input.userId) return failCommand("登录状态无效", 401);
  return okCommand({ userId: input.userId, data: productData(input.body) });
}

export function buildProductUpdateCommand(input: { id: number; body: ProductUpdateInput; userId: number }): DomainValidationResult<ProductUpdateCommand> {
  if (!Number.isInteger(input.id) || input.id <= 0) return failCommand("产品 ID 无效");
  if (!input.body.code || !input.body.name) return failCommand("产品编码和名称不能为空");
  return okCommand({ id: input.id, userId: input.userId, expectedVersion: input.body.expectedVersion, data: productData(input.body as ProductCreateInput) });
}

function skuData(input: ProductSkuCreateInput) {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    specification: text(input.specification),
    baseUnit: input.baseUnit.trim(),
    contentUnit: text(input.contentUnit),
    unitsPerPackage: input.unitsPerPackage ?? null,
    packagesPerCase: input.packagesPerCase ?? null,
    barcode: text(input.barcode),
    status: input.status ?? "active" as const,
  };
}

export function buildProductSkuCreateCommand(input: { productId: number; body: ProductSkuCreateInput; userId: number }): DomainValidationResult<ProductSkuCreateCommand> {
  if (!Number.isInteger(input.productId) || input.productId <= 0) return failCommand("产品 ID 无效");
  return okCommand({ productId: input.productId, userId: input.userId, data: skuData(input.body) });
}

export function buildProductSkuUpdateCommand(input: { id: number; body: ProductSkuUpdateInput; userId: number }): DomainValidationResult<ProductSkuUpdateCommand> {
  if (!Number.isInteger(input.id) || input.id <= 0) return failCommand("SKU ID 无效");
  const { expectedVersion, ...data } = input.body;
  return okCommand({ id: input.id, userId: input.userId, expectedVersion, data });
}

export function validateProductCreateCommand(command: ProductCreateCommand): DomainValidationResult<ProductCreateCommand> {
  if (!Number.isInteger(command.userId) || command.userId <= 0) return failCommand("登录状态无效", 401);
  if (!command.data.code.trim() || !command.data.name.trim()) return failCommand("产品编码和名称不能为空");
  if (command.data.identityKey !== productIdentityKey(command.data.name, command.data.strength)) {
    return failCommand("产品业务标识与名称规格不一致");
  }
  return okCommand(command);
}

export function validateProductUpdateCommand(command: ProductUpdateCommand): DomainValidationResult<ProductUpdateCommand> {
  const base = validateProductCreateCommand(command);
  if (!base.ok) return base;
  if (!Number.isInteger(command.id) || command.id <= 0) return failCommand("产品 ID 无效");
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion <= 0) return failCommand("产品版本无效");
  return okCommand(command);
}

export function validateProductSkuCreateCommand(command: ProductSkuCreateCommand): DomainValidationResult<ProductSkuCreateCommand> {
  if (!Number.isInteger(command.userId) || command.userId <= 0) return failCommand("登录状态无效", 401);
  if (!Number.isInteger(command.productId) || command.productId <= 0) return failCommand("产品 ID 无效");
  if (!command.data.code.trim() || !command.data.name.trim() || !command.data.baseUnit.trim()) {
    return failCommand("SKU 编码、名称和基础单位不能为空");
  }
  return okCommand(command);
}

export function validateProductSkuUpdateCommand(command: ProductSkuUpdateCommand): DomainValidationResult<ProductSkuUpdateCommand> {
  if (!Number.isInteger(command.userId) || command.userId <= 0) return failCommand("登录状态无效", 401);
  if (!Number.isInteger(command.id) || command.id <= 0) return failCommand("SKU ID 无效");
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion <= 0) return failCommand("SKU 版本无效");
  if (Object.keys(command.data).length === 0) return failCommand("至少需要修改一个 SKU 字段");
  if (
    (command.data.code !== undefined && !command.data.code.trim())
    || (command.data.name !== undefined && !command.data.name.trim())
    || (command.data.baseUnit !== undefined && !command.data.baseUnit.trim())
  ) {
    return failCommand("SKU 编码、名称和基础单位不能为空");
  }
  return okCommand(command);
}
