// 共享类型——从 /api/auth/me 返回的当前登录用户
export interface SessionUser {
  id: number;
  name: string;
  username?: string | null;
  wxUserId?: string | null;
  apiKey?: string | null;
  canLogin?: boolean;
  isWorkListAdmin?: boolean;
  isSuperAdmin?: boolean;
  canSelectAnyWeek?: boolean;
  canAccessHR?: boolean;
  canEditHR?: boolean;
  canDeleteHR?: boolean;
  canAccessWorks?: boolean;
  canAccessFinance?: boolean;
  canAccessFinanceCost?: boolean;
  canAccessFinanceLedger?: boolean;
  canAccessFinanceReport?: boolean;
  canAccessFinanceBudget?: boolean;
  canAccessFinanceAnalysis?: boolean;
  canAccessFinanceImport?: boolean;
  canAccessInventory?: boolean;
  canAccessContract?: boolean;
  canAccessAdmin?: boolean;
  canManagePermissions?: boolean;
  canAccessApi?: boolean;
  canAccessAgent?: boolean;
  canAccessDocs?: boolean;
  canAccessExternal?: boolean;
  canAccessLibrary?: boolean;
  manageableResourceKeys?: string[];
  isActiveEmployee?: boolean;
  employeeId?: string | null;
  company?: string | null;
  managementGroup?: string | null;
  departmentId?: number;
  departmentName?: string | null;
}
