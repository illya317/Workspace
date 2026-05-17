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
  },
} as const;

export const ROLE = {
  access: "access",
  read: "read",
  write: "write",
  delete: "delete",
  admin: "admin",
} as const;

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
    write_any_week: "work.report.write",
  },
};
