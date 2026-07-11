// Login session contract returned by /api/auth/me.
export interface SessionUser {
  id: number;
  username: string;
  wxUserId?: string | null;
  avatar?: string | null;
  hasApiKey?: boolean;
  canLogin?: boolean;
  isWorkListAdmin?: boolean;
  isSuperAdmin?: boolean;
  visibleResourceKeys?: string[];
  visibleReadResourceKeys?: string[];
  visibleUpdateResourceKeys?: string[];
  visibleSubmitResourceKeys?: string[];
  manageableResourceKeys?: string[];
  adminResourceKeys?: string[];
  isActiveEmployee?: boolean;
  employeeId?: string | null;
  employeeName?: string | null;
  company?: string | null;
  managementGroup?: string | null;
  departmentId?: number;
  departmentName?: string | null;
}
