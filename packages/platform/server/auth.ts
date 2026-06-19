export { authenticate, isKicked } from "../../../server/auth/authenticate";
export {
  createToken,
  getTokenFromCookie,
  SESSION_MAX_AGE_SECONDS,
  verifyToken,
} from "../../../lib/auth/token";
export {
  authorize,
  requireAuthorized,
  type AuthorizeAction,
  type AuthorizeInput,
  type AuthorizeUser,
} from "../../../server/auth/authorize";
export { checkPermission } from "../../../server/rbac/check";
export {
  canManageResourceGrant,
  getManageableResourceKeys,
} from "../../../server/rbac/admin-scope";
export {
  deleteUserResourceRoleAssignment,
  getGrants,
  getUserResourceRoleAssignments,
  resourceRoleExists,
  setGrant,
  type SubjectType,
  userResourceRoleAssignmentExists,
} from "../../../server/rbac/grants";
export { getPermissionContext, ensureGrantCache } from "../../../server/rbac/context";
export { getVisibleResourceKeys } from "../../../server/rbac/visibility";
export { getResourceAncestorKeys } from "../../../server/rbac/resource";
export {
  clearMaxRoleCache,
  getResourceMaxRole,
  isRoleAllowedForResource,
} from "../../../server/rbac/maxRole";
export {
  clearBypassCache,
  isSystemAdminBypassEnabled,
} from "../../../server/rbac/bypass";
export {
  checkHRAccess,
  checkHRWrite,
  checkHRDelete,
  checkWorkAccess,
  checkWorkWrite,
  checkWorkDelete,
  checkWorksAccess,
} from "../../../server/auth/domain";
