import { RESOURCE_MAX_ROLE } from "./resources";

// ============================================================
// RBAC Resource/Role keys — centralized constants
// ============================================================

export const RES = {
  settings: {
    root: "settings",
    account: "settings.account",
    admin: "settings.admin",
    governance: "settings.governance",
    api: "settings.api",
  },
  agent: {
    root: "agent",
  },
  hr: {
    root: "hr",
    roster: "hr.roster",
    performance: "hr.performance",
    analytics: "hr.analytics",
  },
  docs: {
    root: "docs",
    positions: "docs.positions",
    company: "docs.company",
    expense: "docs.expense",
    api: "docs.api",
  },
  work: {
    root: "work",
    projects: "work.projects",
    reports: "work.reports",
    tasks: "work.tasks",
    history: "work.history",
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
    inventory: "production.inventory",
    qcBatches: "production.qcBatches",
    qcTemplates: "production.qcTemplates",
  },
  administration: {
    root: "administration",
    contracts: "administration.contracts",
  },
  library: {
    root: "library",
    basicInfo: "library.basicInfo",
    write: "library.basicInfo.write",
    secret: "library.basicInfo.secret",
    topSecret: "library.basicInfo.topSecret",
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
