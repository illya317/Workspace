// ============================================================
// RBAC Resource/Role keys — centralized constants
// ============================================================

export const RES = {
  system: {
    root: "system",
    user: "system.user",
    permission: "system.permission",
    audit: "system.audit",
    config: "system.config",
  },
  people: {
    root: "people",
    roster: "people.roster",
    performance: "people.performance",
    analytics: "people.analytics",
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
    report: "work.report",
    task: "work.task",
  },
  finance: {
    root: "finance",
    ledger: "finance.ledger",
    statement: "finance.statement",
    budget: "finance.budget",
    analysis: "finance.analysis",
    cost: "finance.cost",
    import: "finance.import",
  },
  production: {
    root: "production",
    inventory: "inventory",
  },
  administration: {
    root: "administration",
    contract: "administration.contract",
  },
  library: {
    root: "library",
  },
  external: {
    root: "external",
    investor: "external.investor",
    customer: "external.customer",
    supplier: "external.supplier",
  },
  legal: {
    root: "legal",
    chat: "legal.chat",
    document: "legal.document",
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

// ─── Available roles per resource (maxRoleKey per resource) ──
export const RESOURCE_MAX_ROLE: Record<string, string> = {
  system: "admin",
  library: "access",
  docs: "access",
  external: "delete",
  production: "admin",
  finance: "admin",
  administration: "admin",
  people: "admin",
  work: "admin",
  legal: "access",
};

const ROLE_HIERARCHY: Record<string, number> = {
  access: 0, write: 1, delete: 2, admin: 3,
};

/** 返回某资源可用的所有角色（按层级从低到高） */
export function getAvailableRoles(resourceKey: string | null): string[] {
  if (!resourceKey) return [];
  const parts = resourceKey.split(".");
  while (parts.length > 0) {
    const key = parts.join(".");
    const max = RESOURCE_MAX_ROLE[key];
    if (max) {
      const maxLevel = ROLE_HIERARCHY[max] ?? 0;
      return ["access", "write", "delete", "admin"].filter(
        (r) => (ROLE_HIERARCHY[r] ?? 0) <= maxLevel,
      );
    }
    parts.pop();
  }
  return ["access"];
}

/** 检查角色是否在资源允许范围内 */
export function isRoleAllowed(resourceKey: string, roleKey: string): boolean {
  const available = getAvailableRoles(resourceKey);
  return available.includes(roleKey);
}

// ─── Backward compat ──────────────────────────────────────
export const perm = {
  system: {
    access: "system.access",
    admin: "system.admin",
  },
  people: {
    access: "people.access",
  },
  work: {
    access: "work.access",
  },
  report: {
    write: "work.report.write",
  },
};
