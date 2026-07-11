import type { ActionGlyphKind } from "@workspace/core/ui";

export const ACTION_REGISTRY_GROUP_KEYS = [
  "basic",
  "lifecycle",
  "workflow",
  "exchange",
  "governance",
  "ui",
] as const;

export type ActionRegistryGroupKey = (typeof ACTION_REGISTRY_GROUP_KEYS)[number];

export interface ActionRegistryDefinition {
  key: string;
  label: string;
  shortLabel: string;
  group: ActionRegistryGroupKey;
  icon: ActionGlyphKind;
  iconAlternatives?: readonly ActionGlyphKind[];
  isPermissionAction: boolean;
  implies: readonly string[];
  notes?: string;
}

export const ACTION_REGISTRY = [
  {
    key: "entry",
    label: "进入",
    shortLabel: "进入",
    group: "basic",
    icon: "list",
    isPermissionAction: true,
    implies: ["entry"],
  },
  {
    key: "read",
    label: "查看",
    shortLabel: "查看",
    group: "basic",
    icon: "view",
    isPermissionAction: true,
    implies: ["read", "entry"],
  },
  {
    key: "create",
    label: "新建",
    shortLabel: "新建",
    group: "basic",
    icon: "add",
    isPermissionAction: true,
    implies: ["create", "read", "entry"],
  },
  {
    key: "update",
    label: "编辑",
    shortLabel: "编辑",
    group: "basic",
    icon: "edit",
    isPermissionAction: true,
    implies: ["update", "read", "entry"],
  },
  {
    key: "delete",
    label: "删除",
    shortLabel: "删除",
    group: "basic",
    icon: "delete-bin",
    isPermissionAction: true,
    implies: ["delete", "read", "entry"],
    notes: "Atomic delete action; it does not imply create or update.",
  },
  {
    key: "archive",
    label: "归档",
    shortLabel: "归档",
    group: "lifecycle",
    icon: "archive",
    iconAlternatives: ["restore"],
    isPermissionAction: true,
    implies: ["archive", "read", "entry"],
  },
  {
    key: "revise",
    label: "修订",
    shortLabel: "修订",
    group: "lifecycle",
    icon: "revise",
    iconAlternatives: ["history", "restore"],
    isPermissionAction: true,
    implies: ["revise", "read", "entry"],
  },
  {
    key: "reverse",
    label: "撤销",
    shortLabel: "撤销",
    group: "lifecycle",
    icon: "withdraw",
    iconAlternatives: ["reset", "back"],
    isPermissionAction: true,
    implies: ["reverse", "read", "entry"],
    notes: "Covers withdraw/cancel/void/invalidate/reversal; owner/status/workflow rules decide the concrete operation.",
  },
  {
    key: "lock",
    label: "锁定",
    shortLabel: "锁定",
    group: "lifecycle",
    icon: "lock",
    isPermissionAction: true,
    implies: ["lock", "read", "entry"],
  },
  {
    key: "unlock",
    label: "解锁",
    shortLabel: "解锁",
    group: "lifecycle",
    icon: "unlock",
    isPermissionAction: true,
    implies: ["unlock", "read", "entry"],
  },
  {
    key: "submit",
    label: "提交",
    shortLabel: "提交",
    group: "workflow",
    icon: "send",
    isPermissionAction: true,
    implies: ["submit", "read", "entry"],
  },
  {
    key: "approve",
    label: "审批通过",
    shortLabel: "通过",
    group: "workflow",
    icon: "approve",
    isPermissionAction: true,
    implies: ["approve", "read", "entry"],
  },
  {
    key: "reject",
    label: "审批驳回",
    shortLabel: "驳回",
    group: "workflow",
    icon: "reject",
    isPermissionAction: true,
    implies: ["reject", "read", "entry"],
  },
  {
    key: "import",
    label: "导入",
    shortLabel: "导入",
    group: "exchange",
    icon: "upload",
    isPermissionAction: true,
    implies: ["import"],
    notes: "Import does not imply create/update; importing new records should require import + create.",
  },
  {
    key: "export",
    label: "导出",
    shortLabel: "导出",
    group: "exchange",
    icon: "download",
    isPermissionAction: true,
    implies: ["export", "read", "entry"],
  },
  {
    key: "apiUse",
    label: "API 调用",
    shortLabel: "API",
    group: "exchange",
    icon: "link",
    isPermissionAction: true,
    implies: ["apiUse"],
    notes: "API use is an integration boundary; external create should require apiUse + create.",
  },
  {
    key: "share",
    label: "共享",
    shortLabel: "共享",
    group: "governance",
    icon: "share",
    isPermissionAction: true,
    implies: ["share", "read", "entry"],
  },
  {
    key: "grant",
    label: "授权",
    shortLabel: "授权",
    group: "governance",
    icon: "permission-organization",
    isPermissionAction: true,
    implies: ["grant"],
  },
  {
    key: "configure",
    label: "配置",
    shortLabel: "配置",
    group: "governance",
    icon: "settings",
    isPermissionAction: true,
    implies: ["configure"],
  },
  {
    key: "audit",
    label: "审计",
    shortLabel: "审计",
    group: "governance",
    icon: "history",
    isPermissionAction: true,
    implies: ["audit"],
  },
  {
    key: "refresh",
    label: "刷新",
    shortLabel: "刷新",
    group: "ui",
    icon: "refresh",
    isPermissionAction: false,
    implies: ["refresh"],
  },
  {
    key: "reset",
    label: "重置",
    shortLabel: "重置",
    group: "ui",
    icon: "reset",
    isPermissionAction: false,
    implies: ["reset"],
  },
  {
    key: "save",
    label: "保存",
    shortLabel: "保存",
    group: "ui",
    icon: "save",
    isPermissionAction: false,
    implies: ["save"],
  },
  {
    key: "cancel",
    label: "取消",
    shortLabel: "取消",
    group: "ui",
    icon: "cancel",
    isPermissionAction: false,
    implies: ["cancel"],
    notes: "Plain UI cancel is never a permission action; business cancellation maps to reverse.",
  },
  {
    key: "close",
    label: "关闭",
    shortLabel: "关闭",
    group: "ui",
    icon: "cancel",
    isPermissionAction: false,
    implies: ["close"],
  },
] as const satisfies readonly ActionRegistryDefinition[];

export type RegisteredActionKey = (typeof ACTION_REGISTRY)[number]["key"];
export type PermissionRegistryActionKey = Extract<(typeof ACTION_REGISTRY)[number], { isPermissionAction: true }>["key"];

type RegisteredActionDefinition = ActionRegistryDefinition & { key: RegisteredActionKey };
const ACTION_REGISTRY_DEFINITIONS = ACTION_REGISTRY as readonly RegisteredActionDefinition[];

export const ACTION_REGISTRY_BY_KEY: Record<RegisteredActionKey, RegisteredActionDefinition> = ACTION_REGISTRY_DEFINITIONS.reduce(
  (acc, action) => {
    acc[action.key] = action;
    return acc;
  },
  {} as Record<RegisteredActionKey, RegisteredActionDefinition>,
);

export const PERMISSION_ACTION_REGISTRY = ACTION_REGISTRY_DEFINITIONS.filter((action) => action.isPermissionAction);
export const UI_ACTION_REGISTRY = ACTION_REGISTRY_DEFINITIONS.filter((action) => !action.isPermissionAction);

export const PERMISSION_ACTION_REGISTRY_KEYS = PERMISSION_ACTION_REGISTRY.map((action) => action.key) as PermissionRegistryActionKey[];

export function getPermissionRegistryActionClosure(actionKeys: readonly PermissionRegistryActionKey[]): PermissionRegistryActionKey[] {
  const result = new Set<PermissionRegistryActionKey>();
  const pending = [...actionKeys];

  for (let index = 0; index < pending.length; index++) {
    const actionKey = pending[index];
    if (result.has(actionKey)) continue;
    result.add(actionKey);

    for (const impliedActionKey of ACTION_REGISTRY_BY_KEY[actionKey].implies) {
      if (!isPermissionRegistryActionKey(impliedActionKey)) continue;
      pending.push(impliedActionKey);
    }
  }

  return PERMISSION_ACTION_REGISTRY_KEYS.filter((actionKey) => result.has(actionKey));
}

export function isRegisteredActionKey(value: string): value is RegisteredActionKey {
  return value in ACTION_REGISTRY_BY_KEY;
}

export function isPermissionRegistryActionKey(value: string): value is PermissionRegistryActionKey {
  return isRegisteredActionKey(value) && ACTION_REGISTRY_BY_KEY[value].isPermissionAction;
}

export function getRegisteredActionIcon(actionKey: RegisteredActionKey) {
  return ACTION_REGISTRY_BY_KEY[actionKey].icon;
}

export function registeredActionImplies(grantedActionKey: RegisteredActionKey, requiredActionKey: RegisteredActionKey) {
  return ACTION_REGISTRY_BY_KEY[grantedActionKey].implies.includes(requiredActionKey);
}

function assertActionRegistryValid() {
  const keys = new Set<string>();
  const permissionIcons = new Map<ActionGlyphKind, string>();

  for (const action of ACTION_REGISTRY_DEFINITIONS) {
    if (keys.has(action.key)) throw new Error(`Duplicate action registry key: ${action.key}`);
    keys.add(action.key);

    for (const implied of action.implies) {
      if (!ACTION_REGISTRY_DEFINITIONS.some((candidate) => candidate.key === implied)) {
        throw new Error(`Action ${action.key} implies unknown action ${implied}`);
      }
    }

    if (!action.isPermissionAction) continue;

    const existing = permissionIcons.get(action.icon);
    if (existing) throw new Error(`Permission actions ${existing} and ${action.key} share icon ${action.icon}`);
    permissionIcons.set(action.icon, action.key);
  }
}

assertActionRegistryValid();
