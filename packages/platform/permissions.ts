import { RESOURCE_MAX_ROLE } from "./resources";

// ============================================================
// RBAC Resource/Role keys — centralized constants
// ============================================================

export const RES = {
  settings: {
    root: "settings",
    account: "settings.account",
    accountApiAccess: "settings.account.apiAccess",
    admin: "settings.admin",
    api: "settings.api",
    apiManage: "settings.api.manage",
  },
  agent: {
    root: "agent",
  },
  hr: {
    root: "hr",
    roster: "hr.roster",
    rosterGenerated: "hr.roster.generated",
    performance: "hr.performance",
    analytics: "hr.analytics",
  },
  docs: {
    root: "docs",
    company: "docs.company",
    expense: "docs.expense",
  },
  work: {
    root: "work",
    projects: "work.projects",
    projectsCreateOrg: "work.projects.createOrg",
    tasks: "work.tasks",
  },
  finance: {
    root: "finance",
    ledger: "finance.ledger",
    statementConfig: "finance.statementConfig",
    statementReview: "finance.statementReview",
    statements: "finance.statements",
    budget: "finance.budget",
    analysis: "finance.analysis",
    cost: "finance.cost",
    tax: "finance.tax",
    treasury: "finance.treasury",
    import: "finance.import",
  },
  production: {
    root: "production",
    qc: "production.qc",
  },
  administration: {
    root: "administration",
    contracts: "administration.contracts",
  },
  library: {
    root: "library",
    basicInfo: "library.basicInfo",
  },
  external: {
    root: "external",
    investors: "external.investors",
    customers: "external.customers",
    suppliers: "external.suppliers",
  },
} as const;

export const ROLE = {
  access: "access",
  read: "read",
  write: "write",
  delete: "delete",
  admin: "admin",
} as const;

export const ACTION = {
  access: "access",
  write: "write",
  delete: "delete",
  admin: "admin",
} as const;

export function normalizeRoleKey(roleKey: string): string {
  return roleKey === "read" ? "access" : roleKey;
}

const ROLE_HIERARCHY: Record<string, number> = {
  access: 0, write: 1, delete: 2, admin: 3,
};

function resolveMaxRole(resourceKey: string, map: Record<string, string>): string {
  const parts = resourceKey.split(".");
  while (parts.length > 0) {
    const key = parts.join(".");
    if (map[key]) return map[key];
    parts.pop();
  }
  return "admin";
}

/** Synchronous role options for frontend and non-async contexts. */
export function getAvailableRoles(resourceKey: string | null): string[] {
  if (!resourceKey) return [];
  const max = resolveMaxRole(resourceKey, RESOURCE_MAX_ROLE);
  const maxLevel = ROLE_HIERARCHY[max] ?? 0;
  return (["access", "write", "delete", "admin"] as const).filter(
    (role) => (ROLE_HIERARCHY[role] ?? 0) <= maxLevel,
  );
}

export function isRoleAllowed(resourceKey: string, roleKey: string): boolean {
  return getAvailableRoles(resourceKey).includes(roleKey);
}

export const BUSINESS_SPACE_ROLES = ["viewer", "editor", "delete", "manager"] as const;

export type BusinessSpaceRole = (typeof BUSINESS_SPACE_ROLES)[number];
export type BusinessSpaceUsage = "work" | "docsTemplate";
export type BusinessSpaceTargetType = "personal" | "company" | "department" | "project" | "position" | "other";

const BUSINESS_SPACE_ROLE_LEVEL: Record<BusinessSpaceRole, number> = {
  viewer: 0,
  editor: 1,
  delete: 2,
  manager: 3,
};

export const BUSINESS_SPACE_ROLE_OPTIONS: Array<{ value: BusinessSpaceRole; label: string }> = [
  { value: "viewer", label: "查看" },
  { value: "editor", label: "编辑" },
  { value: "delete", label: "删除" },
  { value: "manager", label: "管理" },
];

export function normalizeBusinessSpaceRole(role: string | null | undefined): BusinessSpaceRole {
  if (role === "manager" || role === "delete" || role === "editor" || role === "viewer") return role;
  return "viewer";
}

export function businessSpaceRoleAllows(role: BusinessSpaceRole | null | undefined, required: BusinessSpaceRole) {
  if (!role) return false;
  return BUSINESS_SPACE_ROLE_LEVEL[role] >= BUSINESS_SPACE_ROLE_LEVEL[required];
}

export function maxBusinessSpaceRole(
  left: BusinessSpaceRole | null | undefined,
  right: BusinessSpaceRole | null | undefined,
): BusinessSpaceRole | null {
  if (!left) return right ?? null;
  if (!right) return left;
  return BUSINESS_SPACE_ROLE_LEVEL[left] >= BUSINESS_SPACE_ROLE_LEVEL[right] ? left : right;
}

export function businessSpaceRoleLabel(role: BusinessSpaceRole | string | null | undefined) {
  if (role === "manager") return "管理";
  if (role === "delete") return "删除";
  if (role === "editor") return "编辑";
  return "查看";
}

export function businessSpaceKindLabel(targetType: BusinessSpaceTargetType | string, usage: BusinessSpaceUsage) {
  if (targetType === "personal") return "个人";
  if (targetType === "department") return "部门";
  if (targetType === "project") return "项目";
  if (targetType === "position") return "岗位";
  if (targetType === "company") return usage === "docsTemplate" ? "公共" : "运营委员会";
  if (targetType === "other") return "其他";
  return "空间";
}

export function businessSpaceGroupTitle(targetType: BusinessSpaceTargetType | string, usage: BusinessSpaceUsage) {
  if (targetType === "company" && usage === "docsTemplate") return "公共模板";
  return `${businessSpaceKindLabel(targetType, usage)}空间`;
}
