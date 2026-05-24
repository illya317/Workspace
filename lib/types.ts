// 共享类型——从 /api/auth/me 返回的当前登录用户
export interface SessionUser {
  id: number;
  name: string;
  username?: string | null;
  wxUserId?: string | null;
  apiKey?: string | null;
  canLogin?: boolean;
  isWorkListAdmin?: boolean;
  canSelectAnyWeek?: boolean;
  canAccessHR?: boolean;
  canAccessWorks?: boolean;
  canAccessFinance?: boolean;
  company?: string | null;
  managementGroup?: string | null;
  departmentId?: number;
  departmentName?: string | null;
}
