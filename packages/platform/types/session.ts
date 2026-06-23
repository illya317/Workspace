// Login session contract returned by /api/auth/me.
export interface SessionUser {
  id: number;
  nickname: string;
  username?: string | null;
  wxUserId?: string | null;
  avatar?: string | null;
  apiKey?: string | null;
  canLogin?: boolean;
  isWorkListAdmin?: boolean;
  isSuperAdmin?: boolean;
  visibleResourceKeys?: string[];
  visibleWriteResourceKeys?: string[];
  manageableResourceKeys?: string[];
  isActiveEmployee?: boolean;
  employeeId?: string | null;
  employeeName?: string | null;
  company?: string | null;
  managementGroup?: string | null;
  departmentId?: number;
  departmentName?: string | null;
}
