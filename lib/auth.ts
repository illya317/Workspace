// Backward-compat re-export hub.
// All auth/RBAC functions are now in focused modules under server/auth/ and server/rbac/.
// Import from those directly in new code; this file preserves existing imports.

// Token layer (no DB dependency)
export {
  createToken,
  verifyToken,
  getTokenFromCookie,
} from "./auth/token";
export type { AuthPayload } from "./auth/token";

// Session / authentication
export { authenticate, isKicked } from "@/server/auth/authenticate";

// Admin helpers
export { requireAdmin, isAdmin, isSuperAdmin } from "@/server/auth/admin";

// Domain access checkers
export {
  checkHRAccess,
  checkHRWrite,
  checkHRDelete,
  checkWorksAccess,
  checkFinanceAccess,
  checkFinanceWrite,
  checkFinanceDelete,
  checkFinanceCostAccess,
  checkFinanceCostWrite,
  checkFinanceCostDelete,
  checkFinanceLedgerAccess,
  checkFinanceLedgerWrite,
  checkFinanceLedgerDelete,
  checkFinanceReportAccess,
  checkFinanceReportWrite,
  checkFinanceReportDelete,
  checkFinanceBudgetAccess,
  checkFinanceBudgetWrite,
  checkFinanceBudgetDelete,
  checkFinanceAnalysisAccess,
  checkFinanceAnalysisWrite,
  checkFinanceAnalysisDelete,
  checkFinanceImportAccess,
  checkFinanceImportWrite,
  checkFinanceImportDelete,
  checkInventoryAccess,
  checkContractAccess,
} from "@/server/auth/domain";

// RBAC resource tree
export {
  getResourceDescendants,
  invalidateResourceCache,
} from "@/server/rbac/resource";

// RBAC permission context
export { getPermissionContext } from "@/server/rbac/context";
export type { PermissionContext } from "@/server/rbac/context";

// RBAC core checks
export {
  checkPermission,
  checkPermissionWithContext,
} from "@/server/rbac/check";

// RBAC queries (admin UI)
export {
  getUserPermissions,
  getUserDepartmentAdmins,
} from "@/server/rbac/queries";
