// 共享类型——从 /api/auth/me 返回的当前登录用户
export interface SessionUser {
  id: number;
  name: string;
  username?: string | null;
  wxUserId?: string | null;
  avatar?: string | null;
  apiKey?: string | null;
  canLogin?: boolean;
  isWorkListAdmin?: boolean;
  isSuperAdmin?: boolean;
  canSelectAnyWeek?: boolean;
  visibleResourceKeys?: string[];
  /** Visible resources for "write" role (DB-driven). */
  visibleWriteResourceKeys?: string[];
  manageableResourceKeys?: string[];
  isActiveEmployee?: boolean;
  employeeId?: string | null;
  company?: string | null;
  managementGroup?: string | null;
  departmentId?: number;
  departmentName?: string | null;
}
