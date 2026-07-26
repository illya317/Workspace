import type { ApiMethod } from "./api-contract-types";

const resource = { moduleKey: "inventory", resourceKey: "inventory.receipts", originHrefPattern: "/inventory/receipts" } as const;
const permissionOnly = { eligibility: "permission_only" } as const;
const requiredIndependentReview = {
  eligibility: "workflow_required",
  flowType: "review",
  separationPolicy: "independent_required",
  submitPermissionAction: "submit",
  processPermissionAction: "approve",
  workflowCategoryKey: "quality",
} as const;
const route = (method: ApiMethod, path: string) => ({ method, path });

export const INVENTORY_RECEIPT_BUSINESS_ACTION_REGISTRATIONS = [
  { ...resource, ...permissionOnly, key: "inventory.receipts.record.create", label: "新增成品入库报单记录", writeKind: "create", targetKind: "InventoryReceiptOutput", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/inventory/receipts")] },
  { ...resource, ...permissionOnly, key: "inventory.receipts.record.update", label: "更新成品入库报单记录", writeKind: "update", targetKind: "InventoryReceiptOutput", directPermissionAction: "update", apiRoutes: [route("PATCH", "/api/modules/inventory/receipts/:id")] },
  { ...resource, ...permissionOnly, key: "inventory.receipts.record.delete", label: "删除成品入库报单记录", writeKind: "delete", targetKind: "InventoryReceiptOutput", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/inventory/receipts/:id")] },
  { ...resource, ...requiredIndependentReview, key: "inventory.receipts.report.confirm", label: "确认成品入库报单月度汇总", writeKind: "submit", targetKind: "InventoryReceiptReport", directPermissionAction: "submit", apiRoutes: [route("POST", "/api/modules/inventory/receipts/reports/:reportId/confirm")] },
  { ...resource, ...permissionOnly, key: "inventory.receipts.report.review", label: "复核成品入库报单月度汇总", writeKind: "approve", targetKind: "InventoryReceiptReportReview", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/inventory/receipts/reports/:reportId/review")] },
] as const;
