import type { ApiMethod } from "./api-contract-types";

const resource = { moduleKey: "production", resourceKey: "production.products", originHrefPattern: "/production/products" } as const;
const permissionOnly = { eligibility: "permission_only" } as const;
const route = (method: ApiMethod, path: string) => ({ method, path });

export const PRODUCTION_PRODUCTS_BUSINESS_ACTION_REGISTRATIONS = [
  { ...resource, ...permissionOnly, key: "production.products.product.create", label: "创建产品", writeKind: "create", targetKind: "Product", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/production/products")] },
  { ...resource, ...permissionOnly, key: "production.products.product.update", label: "更新产品", writeKind: "update", targetKind: "Product", directPermissionAction: "update", apiRoutes: [route("PATCH", "/api/modules/production/products/:id")] },
  { ...resource, ...permissionOnly, key: "production.products.sku.create", label: "创建产品 SKU", writeKind: "create", targetKind: "InventoryItem", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/production/products/:id/skus")] },
  { ...resource, ...permissionOnly, key: "production.products.sku.update", label: "更新产品 SKU", writeKind: "update", targetKind: "InventoryItem", directPermissionAction: "update", apiRoutes: [route("PATCH", "/api/modules/production/products/skus/:id")] },
] as const;
