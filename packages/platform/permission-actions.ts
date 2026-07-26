import {
  ACTION_REGISTRY_BY_KEY,
  PERMISSION_ACTION_REGISTRY_KEYS,
  getPermissionRegistryActionClosure,
  type PermissionRegistryActionKey,
} from "./action-registry";

export const PERMISSION_ACTION_KEYS = PERMISSION_ACTION_REGISTRY_KEYS;
export type PermissionActionKey = PermissionRegistryActionKey;

export const PERMISSION_GROUP_KEYS = [
  "basic",
  "lifecycle",
  "workflow",
  "exchange",
  "governance",
] as const;

export type PermissionGroupKey = (typeof PERMISSION_GROUP_KEYS)[number];

export type PermissionActionSource =
  | "direct"
  | "position"
  | "department"
  | "ancestor"
  | "implied"
  | "system"
  | "entry"
  | "implicit"
  | "child";

export interface PermissionActionDefinition {
  key: PermissionActionKey;
  label: string;
  shortLabel: string;
  glyph: string;
  glyphAlternatives: readonly string[];
  group: PermissionGroupKey;
  directGrantable: boolean;
  implies: PermissionActionKey[];
}

export interface PermissionGroupDefinition {
  key: PermissionGroupKey;
  label: string;
  summaryLabel: string;
  actions: PermissionActionKey[];
}

function permissionActionDefinition(actionKey: PermissionActionKey): PermissionActionDefinition {
  const action = ACTION_REGISTRY_BY_KEY[actionKey];
  return {
    key: actionKey,
    label: action.label,
    shortLabel: action.shortLabel,
    glyph: action.icon,
    glyphAlternatives: ("iconAlternatives" in action ? action.iconAlternatives : undefined) ?? [],
    group: action.group as PermissionGroupKey,
    directGrantable: true,
    implies: getPermissionRegistryActionClosure([actionKey]),
  };
}

export const PERMISSION_ACTION_DEFS = Object.fromEntries(
  PERMISSION_ACTION_KEYS.map((actionKey) => [actionKey, permissionActionDefinition(actionKey)]),
) as Record<PermissionActionKey, PermissionActionDefinition>;

export const PERMISSION_GROUP_DEFS: PermissionGroupDefinition[] = [
  { key: "basic", label: "基础权限", summaryLabel: "基础", actions: ["entry", "read", "create", "update", "delete"] },
  { key: "lifecycle", label: "生命周期", summaryLabel: "生命周期", actions: ["archive", "revise", "reverse", "lock", "unlock"] },
  { key: "workflow", label: "流程", summaryLabel: "流程", actions: ["submit", "approve", "reject"] },
  { key: "exchange", label: "数据交换", summaryLabel: "数据", actions: ["import", "export", "apiUse", "share"] },
  { key: "governance", label: "治理", summaryLabel: "治理", actions: ["grant", "configure", "audit"] },
];

export function isPermissionActionKey(value: string): value is PermissionActionKey {
  return (PERMISSION_ACTION_KEYS as readonly string[]).includes(value);
}

export function getPermissionActionLabel(actionKey: PermissionActionKey) {
  return PERMISSION_ACTION_DEFS[actionKey].label;
}

export function getPermissionActionGlyph(actionKey: PermissionActionKey) {
  return PERMISSION_ACTION_DEFS[actionKey].glyph;
}

export function getPermissionActionGlyphOptions(actionKey: PermissionActionKey) {
  const action = PERMISSION_ACTION_DEFS[actionKey];
  return [action.glyph, ...action.glyphAlternatives];
}

export function actionImplies(grantedActionKey: PermissionActionKey, requiredActionKey: PermissionActionKey) {
  return PERMISSION_ACTION_DEFS[grantedActionKey].implies.includes(requiredActionKey);
}

export function impliedActionKeys(actionKey: PermissionActionKey): PermissionActionKey[] {
  return PERMISSION_ACTION_DEFS[actionKey].implies;
}
