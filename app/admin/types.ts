export type SubjectType = "user" | "position" | "department";

export interface Subject {
  id: number;
  name: string;
  extra?: {
    employeeId?: string;
    userId?: number | null;
    hasUser?: boolean;
    company?: string;
    department?: string;
    deptPath?: string[];
    positionIds?: number[];
    departmentIds?: number[];
    code?: string;
  };
}

export interface Grant {
  subjectId: number;
  resourceKey: string;
  roleKey: string;
  scopeId: string | null;
}

export interface PermissionState {
  has: boolean;
  source: "direct" | "position" | "department" | "ancestor" | "system.admin" | "implied" | null;
}

export interface ResourceItem {
  id: number;
  key: string;
  name: string;
  description: string | null;
  userCount?: number;
  maxRoleKey?: string;
  effectiveMaxRoleKey?: string;
  scopeTypes?: string | null;
  scopeInheritanceMode?: string;
  children?: ResourceItem[];
}

export interface DeptItem {
  id: number;
  name: string;
  company: string;
  count: number;
}

export interface SearchResult {
  rowId: number;
  employeeId: string;
  name: string;
  alias: string;
  dept1: string;
  position: string;
  userId: number | null;
}

export interface EmployeePerm {
  employeeId: string;
  name: string;
  canLogin: boolean;
  hasApiKey: boolean;
  userId: number | null;
  username: string | null;
  permissions: string[];
  roles: { company: string | null; dept1: string | null; position: string | null }[];
  resourceRoles: Array<{
    resource: { key: string; name: string } | null;
    role: { key: string; name: string } | null;
  }>;
}

export interface AdminUser {
  id: number;
  name: string;
  isWorkListAdmin?: boolean;
  isAnyGroupAdmin?: boolean;
}
