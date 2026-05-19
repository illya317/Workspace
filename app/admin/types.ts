export interface ResourceItem {
  id: number;
  key: string;
  name: string;
  description: string | null;
  userCount?: number;
  children?: ResourceItem[];
}

export interface DeptItem {
  id: number;
  name: string;
  managementGroup: string;
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
  roles: { managementGroup: string | null; dept1: string | null; position: string | null }[];
  resourceRoles: Array<{
    resource: { key: string; name: string } | null;
    role: { key: string; name: string } | null;
  }>;
}

export interface AdminUser {
  id: number;
  name: string;
  isWorkListAdmin: boolean;
  isAnyGroupAdmin: boolean;
}
