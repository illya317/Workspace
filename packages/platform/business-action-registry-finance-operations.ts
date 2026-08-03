import type { ApiMethod } from "./api-contract-types";
import { FINANCE_ASSET_BUSINESS_ACTION_REGISTRATIONS } from "./business-action-finance-assets-interface";

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;
const FINANCE_TREASURY = { moduleKey: "finance", resourceKey: "finance.treasury", originHrefPattern: "/finance/treasury" } as const;
const FINANCE_TAX = { moduleKey: "finance", resourceKey: "finance.tax", originHrefPattern: "/finance/tax" } as const;
const route = (method: ApiMethod, path: string) => ({ method, path });

export const FINANCE_OPERATIONS_BUSINESS_ACTION_REGISTRATIONS = [
  ...FINANCE_ASSET_BUSINESS_ACTION_REGISTRATIONS,
  { ...FINANCE_TREASURY, ...PERMISSION_ONLY, key: "finance.treasury.workspace.create", label: "创建资金管理记录", writeKind: "create", targetKind: "FinanceTreasuryRecord", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/treasury")] },
  { ...FINANCE_TREASURY, ...PERMISSION_ONLY, key: "finance.treasury.workspace.update", label: "更新资金管理记录", writeKind: "update", targetKind: "FinanceTreasuryRecord", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/treasury")] },
  { ...FINANCE_TAX, ...PERMISSION_ONLY, key: "finance.tax.workspace.create", label: "创建税务管理记录", writeKind: "create", targetKind: "FinanceTaxRecord", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/finance/tax")] },
  { ...FINANCE_TAX, ...PERMISSION_ONLY, key: "finance.tax.workspace.update", label: "更新税务管理记录", writeKind: "update", targetKind: "FinanceTaxRecord", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/finance/tax")] },
] as const;
