export interface GrantCache {
  /** resourceId -> Set<roleKey> */
  userGrants: Map<number, Set<string>>;
  positionGrants: Map<number, Set<string>>;
  departmentGrants: Map<number, Set<string>>;
}

export interface PermissionContext {
  userId: number;
  isAdmin: boolean;
  positionIds: number[];
  departmentIds: number[];
  /** Preloaded grants for fast in-memory checks. Populated on demand. */
  _grantCache?: GrantCache;
}
