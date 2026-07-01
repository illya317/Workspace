export type SubjectType = "user" | "position" | "department";

export interface Subject {
  id: number;
  name: string;
  extra?: {
    employeeId?: string;
    userId?: number | null;
    hasUser?: boolean;
    username?: string | null;
    canLogin?: boolean;
    company?: string;
    department?: string;
    position?: string;
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
  source: "direct" | "position" | "department" | "ancestor" | "implied" | "implicit" | "child" | null;
}

export type PermissionActionKey =
  | "access"
  | "create"
  | "write"
  | "delete"
  | "archive"
  | "revise"
  | "submit"
  | "withdraw"
  | "approve"
  | "reject"
  | "import"
  | "export"
  | "admin";

export type PermissionGroupKey =
  | "basic"
  | "workflowSubmit"
  | "workflowApprove"
  | "lifecycle"
  | "exchange"
  | "admin";

export interface PermissionActionState {
  actionKey: PermissionActionKey;
  label: string;
  has: boolean;
  source: PermissionState["source"];
  sourceActionKey: PermissionActionKey | null;
  sourceResourceKey: string | null;
  directGrantable: boolean;
  pendingResourceMapping: boolean;
}

export interface PermissionSummaryItem {
  label: string;
  source: PermissionState["source"];
  actionKeys: PermissionActionKey[];
}

export interface PermissionActionTreeGroup {
  key: PermissionGroupKey;
  label: string;
  actions: PermissionActionState[];
}

export interface PermissionActionRecord {
  subjectId: number;
  basicSummary: PermissionSummaryItem | null;
  workflowSummary: PermissionSummaryItem | null;
  lifecycleSummary: PermissionSummaryItem | null;
  exchangeSummary: PermissionSummaryItem | null;
  adminSummary: PermissionSummaryItem | null;
  riskSummary: PermissionSummaryItem | null;
  actionStates: Record<PermissionActionKey, PermissionActionState>;
  actionTree: PermissionActionTreeGroup[];
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
  ownerKey?: string;
  enabled?: boolean;
  hidden?: boolean;
  disabledReason?: string | null;
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
