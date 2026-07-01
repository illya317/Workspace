export const PERMISSION_ACTION_KEYS = [
  "access",
  "create",
  "write",
  "delete",
  "archive",
  "revise",
  "submit",
  "withdraw",
  "approve",
  "reject",
  "import",
  "export",
  "admin",
] as const;

export type PermissionActionKey = (typeof PERMISSION_ACTION_KEYS)[number];

export const PERMISSION_GROUP_KEYS = [
  "basic",
  "workflowSubmit",
  "workflowApprove",
  "lifecycle",
  "exchange",
  "admin",
] as const;

export type PermissionGroupKey = (typeof PERMISSION_GROUP_KEYS)[number];

export type PermissionActionSource =
  | "direct"
  | "position"
  | "department"
  | "ancestor"
  | "implied"
  | "implicit"
  | "child";

export interface PermissionActionDefinition {
  key: PermissionActionKey;
  label: string;
  shortLabel: string;
  glyph: string;
  group: PermissionGroupKey;
  directGrantable: boolean;
  legacyRoleKey?: "access" | "write" | "delete" | "admin";
  implies: PermissionActionKey[];
}

export interface PermissionGroupDefinition {
  key: PermissionGroupKey;
  label: string;
  summaryLabel: string;
  actions: PermissionActionKey[];
}

export const PERMISSION_ACTION_DEFS: Record<PermissionActionKey, PermissionActionDefinition> = {
  access: {
    key: "access",
    label: "访问",
    shortLabel: "访问",
    glyph: "view",
    group: "basic",
    directGrantable: true,
    legacyRoleKey: "access",
    implies: ["access"],
  },
  create: {
    key: "create",
    label: "新建",
    shortLabel: "新建",
    glyph: "add",
    group: "basic",
    directGrantable: true,
    implies: ["create", "access"],
  },
  write: {
    key: "write",
    label: "编辑",
    shortLabel: "编辑",
    glyph: "edit",
    group: "basic",
    directGrantable: true,
    legacyRoleKey: "write",
    implies: ["write", "create", "access"],
  },
  delete: {
    key: "delete",
    label: "删除",
    shortLabel: "删除",
    glyph: "delete-bin",
    group: "basic",
    directGrantable: true,
    legacyRoleKey: "delete",
    implies: ["delete", "write", "create", "access"],
  },
  archive: {
    key: "archive",
    label: "归档",
    shortLabel: "归档",
    glyph: "archive",
    group: "lifecycle",
    directGrantable: true,
    implies: ["archive", "access"],
  },
  revise: {
    key: "revise",
    label: "修订",
    shortLabel: "修订",
    glyph: "history",
    group: "lifecycle",
    directGrantable: true,
    implies: ["revise", "write", "create", "access"],
  },
  submit: {
    key: "submit",
    label: "提交",
    shortLabel: "发起",
    glyph: "send",
    group: "workflowSubmit",
    directGrantable: true,
    implies: ["submit", "withdraw", "create", "access"],
  },
  withdraw: {
    key: "withdraw",
    label: "撤回",
    shortLabel: "撤回",
    glyph: "reset",
    group: "workflowSubmit",
    directGrantable: false,
    implies: ["withdraw", "access"],
  },
  approve: {
    key: "approve",
    label: "审批",
    shortLabel: "审批",
    glyph: "verified",
    group: "workflowApprove",
    directGrantable: true,
    implies: ["approve", "reject", "access"],
  },
  reject: {
    key: "reject",
    label: "驳回",
    shortLabel: "驳回",
    glyph: "x",
    group: "workflowApprove",
    directGrantable: false,
    implies: ["reject", "access"],
  },
  import: {
    key: "import",
    label: "导入",
    shortLabel: "导入",
    glyph: "upload",
    group: "exchange",
    directGrantable: true,
    implies: ["import", "access"],
  },
  export: {
    key: "export",
    label: "导出",
    shortLabel: "导出",
    glyph: "download",
    group: "exchange",
    directGrantable: true,
    implies: ["export", "access"],
  },
  admin: {
    key: "admin",
    label: "管理",
    shortLabel: "管理",
    glyph: "lock",
    group: "admin",
    directGrantable: true,
    legacyRoleKey: "admin",
    implies: [...PERMISSION_ACTION_KEYS],
  },
};

export const PERMISSION_GROUP_DEFS: PermissionGroupDefinition[] = [
  { key: "basic", label: "基础权限", summaryLabel: "基础", actions: ["delete", "write", "create", "access"] },
  { key: "workflowSubmit", label: "流程发起", summaryLabel: "发起", actions: ["submit", "withdraw"] },
  { key: "workflowApprove", label: "流程审批", summaryLabel: "审批", actions: ["approve", "reject"] },
  { key: "lifecycle", label: "生命周期", summaryLabel: "生命周期", actions: ["archive", "revise"] },
  { key: "exchange", label: "数据交换", summaryLabel: "数据", actions: ["import", "export"] },
  { key: "admin", label: "管理", summaryLabel: "管理", actions: ["admin"] },
];

export const LEGACY_PERMISSION_ACTION_KEYS = ["access", "write", "delete", "admin"] as const;

export function isPermissionActionKey(value: string): value is PermissionActionKey {
  return (PERMISSION_ACTION_KEYS as readonly string[]).includes(value);
}

export function isLegacyPermissionActionKey(actionKey: PermissionActionKey) {
  return (LEGACY_PERMISSION_ACTION_KEYS as readonly string[]).includes(actionKey);
}

export function getPermissionActionLabel(actionKey: PermissionActionKey) {
  return PERMISSION_ACTION_DEFS[actionKey].label;
}

export function getPermissionActionGlyph(actionKey: PermissionActionKey) {
  return PERMISSION_ACTION_DEFS[actionKey].glyph;
}

export function actionImplies(grantedActionKey: PermissionActionKey, requiredActionKey: PermissionActionKey) {
  return PERMISSION_ACTION_DEFS[grantedActionKey].implies.includes(requiredActionKey);
}

export function impliedActionKeys(actionKey: PermissionActionKey): PermissionActionKey[] {
  return PERMISSION_ACTION_DEFS[actionKey].implies;
}

export function roleKeyToActionKey(roleKey: string): PermissionActionKey | null {
  if (roleKey === "read") return "access";
  if (roleKey === "access" || roleKey === "write" || roleKey === "delete" || roleKey === "admin") return roleKey;
  return null;
}
