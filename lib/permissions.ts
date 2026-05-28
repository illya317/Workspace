// ============================================================
// RBAC Resource/Role keys — centralized constants
// ============================================================

export const RES = {
  system: {
    root: "system",
    user: "system.user",
    audit: "system.audit",
    config: "system.config",
  },
  people: {
    root: "people",
    employee: "people.employee",
    org: "people.org",
  },
  docs: {
    root: "docs",
    policy: "docs.policy",
    manual: "docs.manual",
    form: "docs.form",
  },
  work: {
    root: "work",
    report: "work.report",
    task: "work.task",
  },
  finance: {
    root: "finance",
    account: "finance.account",
    voucher: "finance.voucher",
    report: "finance.report",
  },
  inventory: {
    root: "inventory",
    raw: "inventory.raw",
    packaging: "inventory.packaging",
    finished: "inventory.finished",
    report: "inventory.report",
  },
  contract: {
    root: "contract",
    list: "contract.list",
    edit: "contract.edit",
  },
} as const;

export const ROLE = {
  access: "access",
  read: "read",
  write: "write",
  delete: "delete",
  admin: "admin",
} as const;

// 统一动作常量（后台不再使用 read）
export const ACTION = {
  access: "access",
  write: "write",
  delete: "delete",
  admin: "admin",
} as const;

// 入参兼容：所有 read 统一转成 access
export function normalizeRoleKey(roleKey: string): string {
  return roleKey === "read" ? "access" : roleKey;
}

// ─── Backward compat aliases ──────────────────────────────
// Old code using perm.system.admin strings still works at runtime,
// but new code should use checkPermission() with separate args.

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
