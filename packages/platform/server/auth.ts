export { authenticate, isKicked } from "./auth/authenticate";
export {
  createToken,
  getTokenFromCookie,
  SESSION_MAX_AGE_SECONDS,
  verifyToken,
} from "./auth-token";
export {
  authorize,
  requireAuthorized,
  type AuthorizeAction,
  type AuthorizeInput,
  type AuthorizeUser,
} from "./auth/authorize";
export {
  requireAnyResourceAccess,
  requireAdminManageAccess,
  requireResourceAccess,
  requireRouteAccess,
} from "./auth/guard";
export {
  requireAdminApiAccess,
  requireApiAccess,
  type ApiAccessResult,
} from "./api-access";
export {
  getCurrentUser,
  getSessionUserFromAuthPayload,
  requireAuth,
  requireCurrentUser,
} from "./auth/session";
export {
  isAdmin,
  isSuperAdmin,
  requireAdmin,
} from "./auth/admin";
export {
  isRootAdminUser,
  isRootAdminUsername,
  ROOT_ADMIN_USERNAME,
} from "./auth/root";
export {
  canManageResourceGrant,
  getManageableResourceKeys,
} from "./rbac/admin-scope";
export {
  deleteUserResourceRoleAssignment,
  getGrants,
  getUserResourceRoleAssignments,
  resourceRoleExists,
  setGrant,
  type SubjectType,
  userResourceRoleAssignmentExists,
} from "./rbac/grants";
export { getPermissionContext, ensureGrantCache } from "./rbac/context";
export { getVisibleResourceKeys } from "./rbac/visibility";
export {
  evaluatePermissionAction,
  getActionGrants,
  setSubjectPermissionActionGrant,
} from "./rbac/action-grants";
export {
  getResourceAncestorKeys,
  getResourceChildKeys,
  getResourceSummariesByIds,
} from "./rbac/resource";
export {
  clearMaxRoleCache,
  getResourceMaxRole,
  isRoleAllowedForResource,
} from "./rbac/maxRole";
export {
  checkHRAccess,
  checkHRWrite,
  checkHRDelete,
  checkWorkAccess,
  checkWorkWrite,
  checkWorkDelete,
  checkWorksAccess,
  checkContractAccess,
  checkFinanceCostAccess,
  checkFinanceCostWrite,
  checkFinanceCostDelete,
  checkFinanceLedgerAccess,
  checkFinanceLedgerCreate,
  checkFinanceLedgerWrite,
  checkFinanceLedgerRevise,
  checkFinanceLedgerDelete,
  checkFinanceBudgetAccess,
  checkFinanceBudgetWrite,
  checkFinanceBudgetDelete,
  checkFinanceAnalysisAccess,
  checkFinanceAnalysisWrite,
  checkFinanceAnalysisDelete,
  checkFinanceImportAccess,
  checkFinanceImportWrite,
  checkFinanceImportDelete,
  checkFinanceReportAccess,
  checkFinanceReportWrite,
  checkFinanceReportDelete,
  checkFinanceStatementConfigAccess,
  checkFinanceStatementConfigCreate,
  checkFinanceStatementConfigWrite,
  checkFinanceStatementConfigDelete,
  checkFinanceStatementReviewAccess,
  checkFinanceStatementReviewWrite,
  checkLibraryAccess,
  checkLibraryWrite,
} from "./auth/domain";
export {
  getUserDepartmentAdmins,
  getUserPermissions,
} from "./rbac/queries";
export { listUsersWithEffectiveResourceRoles } from "./rbac/user-list";
