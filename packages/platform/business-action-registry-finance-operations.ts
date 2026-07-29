import type { ApiMethod } from "./api-contract-types";

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;
const FINANCE_ASSETS = { moduleKey: "finance", resourceKey: "finance.assets", originHrefPattern: "/finance/assets" } as const;
const FINANCE_TREASURY = { moduleKey: "finance", resourceKey: "finance.treasury", originHrefPattern: "/finance/treasury" } as const;
const FINANCE_TAX = { moduleKey: "finance", resourceKey: "finance.tax", originHrefPattern: "/finance/tax" } as const;

function route(method: ApiMethod, path: string, notes?: string) {
  return notes ? { method, path, notes } : { method, path };
}

export const FINANCE_OPERATIONS_BUSINESS_ACTION_REGISTRATIONS = [
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.asset.create", label: "创建资产卡片", writeKind: "create", targetKind: "FinanceAssetCard", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/assets")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.asset.update", label: "更新资产卡片", writeKind: "update", targetKind: "FinanceAssetCard", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/assets")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.categoryPolicy.update", label: "更新资产会计政策", writeKind: "update", targetKind: "FinanceAssetCategoryPolicy", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/assets/policies")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.categoryPolicy.delete", label: "删除资产会计政策覆盖", writeKind: "delete", targetKind: "FinanceAssetCategoryPolicy", directPermissionAction: "update", apiRoutes: [route("DELETE", "/api/modules/finance/assets/policies")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.assetPeriod.recalculate", label: "重算折旧摊销期间", writeKind: "revise", targetKind: "FinanceAssetPeriodEntry", directPermissionAction: "revise", apiRoutes: [route("POST", "/api/modules/finance/assets/periods/recalculate")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.assetPeriod.linkVoucher", label: "关联折旧摊销凭证", writeKind: "revise", targetKind: "FinanceAssetPeriodEntry", directPermissionAction: "revise", apiRoutes: [route("PUT", "/api/modules/finance/assets/periods/voucher-link")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.acquisitionEvidence.confirm", label: "确认资产取得证据", writeKind: "revise", targetKind: "FinanceAssetAcquisitionEvidence", directPermissionAction: "revise", apiRoutes: [route("POST", "/api/modules/finance/assets/acquisition-evidence")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.impairmentAssessment.confirm", label: "确认资产减值评估", writeKind: "revise", targetKind: "FinanceAssetImpairmentAssessment", directPermissionAction: "revise", apiRoutes: [route("PUT", "/api/modules/finance/assets/impairment-assessment")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.disposal.confirm", label: "确认资产处置", writeKind: "revise", targetKind: "FinanceAssetDisposal", directPermissionAction: "revise", apiRoutes: [route("POST", "/api/modules/finance/assets/disposals")] },
  { ...FINANCE_ASSETS, ...PERMISSION_ONLY, key: "finance.assets.workspace.export", label: "下载资产会计 Excel", writeKind: "export", targetKind: "FinanceAssetWorkbook", directPermissionAction: "export", apiRoutes: [route("GET", "/api/modules/finance/assets/export", "GET export is permission-only and generates no business record.")] },
  { ...FINANCE_TREASURY, ...PERMISSION_ONLY, key: "finance.treasury.workspace.create", label: "创建资金管理记录", writeKind: "create", targetKind: "FinanceTreasuryRecord", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/treasury")] },
  { ...FINANCE_TREASURY, ...PERMISSION_ONLY, key: "finance.treasury.workspace.update", label: "更新资金管理记录", writeKind: "update", targetKind: "FinanceTreasuryRecord", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/treasury")] },
  { ...FINANCE_TAX, ...PERMISSION_ONLY, key: "finance.tax.workspace.create", label: "创建税务管理记录", writeKind: "create", targetKind: "FinanceTaxRecord", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/tax")] },
  { ...FINANCE_TAX, ...PERMISSION_ONLY, key: "finance.tax.workspace.update", label: "更新税务管理记录", writeKind: "update", targetKind: "FinanceTaxRecord", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/tax")] },
] as const;
