// ============================================================
// Permission key constants
// All permission checks MUST use these constants, not magic strings.
// ============================================================

export const perm = {
  system: {
    access: "system.access",       // 可登录
    admin: "system.admin",         // 超级管理员
  },
  module: {
    hr: {
      access: "module.hr.access",   // 人事行政
    },
    works: {
      access: "module.works.access", // 工作清单
    },
  },
  department: {
    admin: "department.admin",     // 部门管理员 (scopeId=部门ID)
  },
  report: {
    write_any_week: "report.write_any_week", // 补填任意周报
  },
  report_group: {
    admin: "report_group.admin",   // 周报分组负责人
    member: "report_group.member", // 周报分组参与
    viewer: "report_group.viewer", // 周报分组查看
  },
  field: {
    read: "field.read",            // 字段只读
    write: "field.write",          // 字段编辑 (scopeId=字段名)
  },
} as const;

export type PermKey = (typeof perm)[keyof typeof perm] extends infer T
  ? T extends { [k: string]: infer V } ? V : never
  : never;

// ─── Resource/Role keys ────────────────────────────────────

export const RESOURCE_KEYS = ["system", "module.hr", "module.works", "department", "report", "report_group", "field"] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const ROLE_KEYS = ["access", "admin", "write", "read", "member", "viewer", "write_any_week"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

// ─── Old boolean → new permission mapping ──────────────────
// Used only for migration/seed — new code should use perm.* constants.

export const BOOLEAN_TO_PERM: Record<string, string> = {
  isWorkListAdmin:  perm.system.admin,
  canSelectAnyWeek: perm.report.write_any_week,
  canAccessHR:      perm.module.hr.access,
  canAccessWorks:   perm.module.works.access,
  canLogin:         perm.system.access,
};
