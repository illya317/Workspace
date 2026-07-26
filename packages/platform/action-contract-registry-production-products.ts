import { defineActionContractMetadataList } from "./action-contract";
import { registeredWrite } from "./action-contract-registry-helpers";

const domain = (validatorKey: string, commitKey: string) => ({ validatorKey, commitKey });

export const PRODUCTION_PRODUCTS_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  registeredWrite({
    key: "production.products.product.create",
    activeEntity: "Product",
    shape: "full_record",
    target: "new_record",
    commitMode: "activate",
    domain: domain("packages/production/server/domain/product-validation.buildProductCreateCommand", "packages/production/server/products/service.commitProductCreateCommand"),
  }),
  registeredWrite({
    key: "production.products.product.update",
    activeEntity: "Product",
    shape: "full_record",
    target: "existing_record",
    targetIdKey: "id",
    domain: domain("packages/production/server/domain/product-validation.buildProductUpdateCommand", "packages/production/server/products/service.commitProductUpdateCommand"),
  }),
  registeredWrite({
    key: "production.products.sku.create",
    activeEntity: "InventoryItem",
    shape: "full_record",
    target: "new_record",
    commitMode: "activate",
    domain: domain("packages/production/server/domain/product-validation.buildProductSkuCreateCommand", "packages/production/server/products/service.commitProductSkuCreateCommand"),
  }),
  registeredWrite({
    key: "production.products.sku.update",
    activeEntity: "InventoryItem",
    shape: "full_record",
    target: "existing_record",
    targetIdKey: "id",
    domain: domain("packages/production/server/domain/product-validation.buildProductSkuUpdateCommand", "packages/production/server/products/service.commitProductSkuUpdateCommand"),
  }),
]);
