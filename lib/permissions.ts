// ============================================================
// RBAC Resource/Role keys — centralized constants
// ============================================================

export const RES = {
  system: {
    root: "system",
    audit: "system.audit",
    agent: "system.agent",
    api: "system.api",
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
  },
  work: {
    root: "work",
    report: "work.report",
    task: "work.task",
  },
  finance: {
    root: "finance",
    ledger: "finance.ledger",
    schedules: "finance.schedules",
    statement: "finance.statement",
    budget: "finance.budget",
    analysis: "finance.analysis",
    cost: "finance.cost",
    import: "finance.import",
  },
  production: {
    root: "production",
    inventory: "production.inventory",
  },
  administration: {
    root: "administration",
    contract: "administration.contract",
  },
  library: {
    root: "library",
    write: "library.write",
    secret: "library.secret",
    topSecret: "library.top_secret",
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

// ─── Fallback 常量：DB 未就绪时使用 ──
export const RESOURCE_MAX_ROLE: Record<string, string> = {
  system: "admin",
  library: "write",
  "library.write": "write",
  "library.secret": "access",
  "library.top_secret": "access",
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

function resolveMaxRole(resourceKey: string, map: Record<string, string>): string {
  const parts = resourceKey.split(".");
  while (parts.length > 0) {
    const key = parts.join(".");
    if (map[key]) return map[key];
    parts.pop();
  }
  return "admin";
}

/** 同步版本（含 fallback） — 用于前端/非 async 上下文 */
export function getAvailableRoles(resourceKey: string | null): string[] {
  if (!resourceKey) return [];
  const max = resolveMaxRole(resourceKey, RESOURCE_MAX_ROLE);
  const maxLevel = ROLE_HIERARCHY[max] ?? 0;
  return (["access", "write", "delete", "admin"] as const).filter(
    (r) => (ROLE_HIERARCHY[r] ?? 0) <= maxLevel,
  );
}

export function isRoleAllowed(resourceKey: string, roleKey: string): boolean {
  return getAvailableRoles(resourceKey).includes(roleKey);
}

