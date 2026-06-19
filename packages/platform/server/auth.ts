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
  requireAdminManageAccess,
  requireResourceAccess,
} from "./auth/guard";
export {
  getCurrentUser,
  requireAuth,
  requireCurrentUser,
} from "./auth/session";
export {
  isAdmin,
  isSuperAdmin,
  requireAdmin,
} from "./auth/admin";
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
  getResourceAncestorKeys,
  getResourceSummariesByIds,
} from "./rbac/resource";
export {
  clearMaxRoleCache,
  getResourceMaxRole,
  isRoleAllowedForResource,
} from "./rbac/maxRole";
export {
  clearBypassCache,
  isSystemAdminBypassEnabled,
} from "./rbac/bypass";
export {
  checkHRAccess,
  checkHRWrite,
  checkHRDelete,
  checkWorkAccess,
  checkWorkWrite,
  checkWorkDelete,
  checkWorksAccess,
} from "./auth/domain";
export {
  getUserDepartmentAdmins,
  getUserPermissions,
} from "./rbac/queries";
export { listUsersWithEffectiveResourceRoles } from "./rbac/user-list";
