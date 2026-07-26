import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { defineBusinessActionCommandAdapter, executeDirectBusinessActionCommand } from "@workspace/platform/server/business-action-executor";
import { buildProductCreateCommand, buildProductSkuCreateCommand, buildProductSkuUpdateCommand, buildProductUpdateCommand } from "../domain/product-validation";
import { commitProductCreateCommand, commitProductSkuCreateCommand, commitProductSkuUpdateCommand, commitProductUpdateCommand } from "./service";

function validation<T>(result: { ok: true; data: T } | { ok: false; issue: { message: string; status?: number } }) {
  return result.ok ? serviceOk(result.data) : serviceError(result.issue.message, result.issue.status ?? 400);
}

type CreateProductInput = Parameters<typeof buildProductCreateCommand>[0];
type UpdateProductInput = Parameters<typeof buildProductUpdateCommand>[0];
type CreateSkuInput = Parameters<typeof buildProductSkuCreateCommand>[0];
type UpdateSkuInput = Parameters<typeof buildProductSkuUpdateCommand>[0];

const createProductAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "production.products.product.create",
  validatorKey: "packages/production/server/domain/product-validation.buildProductCreateCommand",
  commitKey: "packages/production/server/products/service.commitProductCreateCommand",
  validate: (input: CreateProductInput) => validation(buildProductCreateCommand(input)),
  commit: commitProductCreateCommand,
});

const updateProductAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "production.products.product.update",
  validatorKey: "packages/production/server/domain/product-validation.buildProductUpdateCommand",
  commitKey: "packages/production/server/products/service.commitProductUpdateCommand",
  validate: (input: UpdateProductInput) => validation(buildProductUpdateCommand(input)),
  commit: commitProductUpdateCommand,
});

const createSkuAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "production.products.sku.create",
  validatorKey: "packages/production/server/domain/product-validation.buildProductSkuCreateCommand",
  commitKey: "packages/production/server/products/service.commitProductSkuCreateCommand",
  validate: (input: CreateSkuInput) => validation(buildProductSkuCreateCommand(input)),
  commit: commitProductSkuCreateCommand,
});

const updateSkuAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "production.products.sku.update",
  validatorKey: "packages/production/server/domain/product-validation.buildProductSkuUpdateCommand",
  commitKey: "packages/production/server/products/service.commitProductSkuUpdateCommand",
  validate: (input: UpdateSkuInput) => validation(buildProductSkuUpdateCommand(input)),
  commit: commitProductSkuUpdateCommand,
});

export function executeCreateProductCommand(input: CreateProductInput) {
  return executeDirectBusinessActionCommand({ command: createProductAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeUpdateProductCommand(input: UpdateProductInput) {
  return executeDirectBusinessActionCommand({ command: updateProductAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeCreateProductSkuCommand(input: CreateSkuInput) {
  return executeDirectBusinessActionCommand({ command: createSkuAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeUpdateProductSkuCommand(input: UpdateSkuInput) {
  return executeDirectBusinessActionCommand({ command: updateSkuAdapter, input, context: undefined, actorUserId: input.userId });
}
