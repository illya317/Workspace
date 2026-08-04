export { authenticate, isKicked, isProgrammaticApiRequest } from "./auth/authenticate";
export {
  createToken,
  getTokenFromCookie,
  SESSION_MAX_AGE_SECONDS,
  verifyToken,
} from "./auth-token";
export {
  AUTH_COOKIE_CONTRACT,
  LEGACY_KICKED_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  clearSessionCookies,
  clearWecomLoginCookies,
  readPostLoginNextCookie,
  readSessionCookie,
  readWecomStateCookie,
  setKickedCookie,
  setSessionCookie,
  setWecomLoginCookies,
} from "../auth-cookies";
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
  requireRouteActionAccess,
} from "./auth/guard";
export { canEnterResource } from "./rbac/resource-entry";
export {
  requireAdminApiAccess,
  requireApiAccess,
  type ApiAccessResult,
} from "./api-access";
export {
  getCurrentUser,
  getAgentActorSessionUser,
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
  hasGlobalGrantManagementAccess,
} from "./rbac/admin-scope";
export { getPermissionContext, ensureGrantCache } from "./rbac/context";
export { getVisibleResourceKeys } from "./rbac/visibility";
export {
  evaluatePermissionAction,
  getActionGrants,
  setSubjectPermissionActionGrant,
  type SubjectType,
} from "./rbac/action-grants";
export {
  getResourceAncestorKeys,
  getResourceChildKeys,
  getResourceSummariesByIds,
} from "./rbac/resource";
export {
  checkHRRead,
  checkHRUpdate,
  checkHRDelete,
} from "./auth/domain";
export {
  getUserPermissions,
} from "./rbac/queries";
export { listUsersWithEffectiveResourceRoles } from "./rbac/user-list";
