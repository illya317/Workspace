import type { SelectorSurfaceStructuredTreeItemSpec } from "@workspace/core/ui";
import type {
  BusinessRequiredPolicy,
  RelationPolicyPreset,
} from "@workspace/platform/relation-registration-contract";

import type { DatabaseSchemaModule } from "../../../database-schema-contract";
import type {
  RelationPolicyCatalog,
  RelationPolicyCatalogItem,
  RelationPolicyEndpoint,
  RelationPolicyMutationSettings,
} from "../../../relation-policy-contract";

export const DELETE_LINKAGE_LABELS: Record<RelationPolicyPreset, string> = {
  block: "有引用时不允许删除",
  confirm_unlink: "确认后解除引用",
  confirm_cascade: "确认后同步删除关联数据",
  confirm_unlink_or_cascade: "确认后解除或删除",
  auto_cascade_owned: "自动删除自有明细",
  retain: "保留历史引用",
  exempt_with_reason: "按系统例外处理",
};

export const BUSINESS_REQUIRED_LABELS: Record<BusinessRequiredPolicy, string> = {
  required: "必填",
  optional: "选填",
};

export type RelationPolicyViewState = "editable" | "fixed" | "invalid";

export interface RelationPolicyDraft {
  targetDelete: RelationPolicyPreset | null;
  businessRequired: BusinessRequiredPolicy | null;
}

export type RelationPolicyTreeValue =
  | { kind: "module"; moduleKey: string }
  | { kind: "relation"; relationKey: string };

const MODULE_KEY_PREFIX = "module:";
const RELATION_KEY_PREFIX = "relation:";

export function relationPolicyModuleTreeKey(moduleKey: string) {
  return `${MODULE_KEY_PREFIX}${moduleKey}`;
}

export function relationPolicyRelationTreeKey(relationKey: string) {
  return `${RELATION_KEY_PREFIX}${relationKey}`;
}

export function relationPolicyModuleKeyFromTreeKey(treeKey: string | number) {
  const value = String(treeKey);
  return value.startsWith(MODULE_KEY_PREFIX) ? value.slice(MODULE_KEY_PREFIX.length) : null;
}

export function deleteLinkageLabel(value: RelationPolicyPreset | null) {
  return value ? DELETE_LINKAGE_LABELS[value] : "未接入业务规则";
}

export function businessRequiredLabel(value: BusinessRequiredPolicy | null) {
  return value ? BUSINESS_REQUIRED_LABELS[value] : "未接入业务规则";
}

export function relationPolicyState(relation: RelationPolicyCatalogItem): RelationPolicyViewState {
  if (
    relation.orphanPhysical
    || relation.issues.length > 0
    || relation.policyGroup?.stale
    || relation.deleteLinkage.mode === "invalid"
    || relation.businessRequired.mode === "invalid"
  ) return "invalid";
  if (
    relation.deleteLinkage.mode === "editable"
    || relation.businessRequired.mode === "editable"
  ) return "editable";
  return "fixed";
}

export function relationPolicyStatus(relation: RelationPolicyCatalogItem) {
  const state = relationPolicyState(relation);
  if (state === "editable") return { state, label: "可调整", tone: "success" as const };
  if (state === "fixed") return { state, label: "系统规则", tone: "muted" as const };
  return { state, label: "需补规则", tone: "warning" as const };
}

export function relationPolicyDeleteSummary(relation: RelationPolicyCatalogItem) {
  return relation.deleteLinkage.mode === "invalid"
    ? "需补规则"
    : deleteLinkageLabel(relation.deleteLinkage.effective);
}

export function relationPolicyRequiredSummary(relation: RelationPolicyCatalogItem) {
  return relation.businessRequired.mode === "invalid"
    ? "未接入业务规则"
    : businessRequiredLabel(relation.businessRequired.effective);
}

function endpointIdentity(endpoint: RelationPolicyEndpoint) {
  const name = endpoint.label?.trim() || endpoint.entity;
  return endpoint.fields.length > 0 ? `${name}（${endpoint.fields.join("、")}）` : name;
}

export function relationPolicyIdentity(relation: RelationPolicyCatalogItem) {
  return `${endpointIdentity(relation.source)} → ${endpointIdentity(relation.target)}`;
}

function relationTreeItem(
  relation: RelationPolicyCatalogItem,
  level: number,
): SelectorSurfaceStructuredTreeItemSpec<RelationPolicyTreeValue> {
  const status = relationPolicyStatus(relation);
  return {
    key: relationPolicyRelationTreeKey(relation.relationKey),
    value: { kind: "relation", relationKey: relation.relationKey },
    card: {
      title: relation.title,
      subtitle: relationPolicyIdentity(relation),
      meta: [
        `删除联动：${relationPolicyDeleteSummary(relation)}`,
        `业务必填：${relationPolicyRequiredSummary(relation)}`,
      ],
      level,
      status: { label: status.label, tone: status.tone },
      size: "md",
    },
  };
}

export function relationPolicyTreeItems(
  catalog: RelationPolicyCatalog,
  schemaModules: readonly DatabaseSchemaModule[],
): SelectorSurfaceStructuredTreeItemSpec<RelationPolicyTreeValue>[] {
  const relationsByModule = new Map<string, RelationPolicyCatalogItem[]>();
  for (const relation of catalog.relations) {
    const relations = relationsByModule.get(relation.moduleKey) ?? [];
    relations.push(relation);
    relationsByModule.set(relation.moduleKey, relations);
  }
  for (const relations of relationsByModule.values()) {
    relations.sort((left, right) => (
      left.title.localeCompare(right.title, "zh-CN")
      || left.relationKey.localeCompare(right.relationKey)
    ));
  }

  const catalogModules = new Map(catalog.modules.map((moduleItem) => [moduleItem.key, moduleItem]));
  const seenModuleKeys = new Set<string>();
  const createModuleItem = (
    moduleItem: Pick<DatabaseSchemaModule, "key" | "label" | "children">,
    level: number,
  ): SelectorSurfaceStructuredTreeItemSpec<RelationPolicyTreeValue> => {
    seenModuleKeys.add(moduleItem.key);
    const directRelations = relationsByModule.get(moduleItem.key) ?? [];
    const metadata = catalogModules.get(moduleItem.key);
    const invalidCount = metadata?.invalidRelationCount
      ?? directRelations.filter((relation) => relationPolicyState(relation) === "invalid").length;
    const children = [
      ...moduleItem.children.map((child) => createModuleItem(child, level + 1)),
      ...directRelations.map((relation) => relationTreeItem(relation, level + 1)),
    ];
    return {
      key: relationPolicyModuleTreeKey(moduleItem.key),
      value: { kind: "module", moduleKey: moduleItem.key },
      card: {
        title: metadata?.label ?? moduleItem.label,
        subtitle: `${metadata?.relationCount ?? directRelations.length} 项关系`,
        level,
        status: invalidCount > 0
          ? { label: `${invalidCount} 项需补规则`, tone: "warning" }
          : undefined,
      },
      children: children.length > 0 ? children : undefined,
    };
  };

  const items = schemaModules.map((moduleItem) => createModuleItem(moduleItem, 1));
  const remainingModules = catalog.modules
    .filter((moduleItem) => !seenModuleKeys.has(moduleItem.key))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));

  for (const moduleItem of remainingModules) {
    items.push(createModuleItem({ ...moduleItem, children: [] }, 1));
  }

  const remainingModuleKeys = [...relationsByModule.keys()]
    .filter((moduleKey) => !seenModuleKeys.has(moduleKey))
    .sort((left, right) => left.localeCompare(right));
  for (const moduleKey of remainingModuleKeys) {
    items.push(createModuleItem({ key: moduleKey, label: moduleKey, children: [] }, 1));
  }
  return items;
}

export function relationPolicyModulePath(
  modules: readonly DatabaseSchemaModule[],
  moduleKey: string,
  path: string[] = [],
): string[] {
  for (const moduleItem of modules) {
    const nextPath = [...path, moduleItem.key];
    if (moduleItem.key === moduleKey) return nextPath;
    const childPath = relationPolicyModulePath(moduleItem.children, moduleKey, nextPath);
    if (childPath.length > 0) return childPath;
  }
  return [];
}

export function relationPolicyDraftFromRelation(
  relation: RelationPolicyCatalogItem,
): RelationPolicyDraft {
  return {
    targetDelete: relation.deleteLinkage.effective,
    businessRequired: relation.businessRequired.effective,
  };
}

export function relationPolicyDraftValid(
  relation: RelationPolicyCatalogItem,
  draft: RelationPolicyDraft | null,
) {
  if (!draft) return false;
  if (
    relation.deleteLinkage.mode === "editable"
    && (!draft.targetDelete || !relation.deleteLinkage.allowed.includes(draft.targetDelete))
  ) return false;
  if (
    relation.businessRequired.mode === "editable"
    && (!draft.businessRequired || !relation.businessRequired.allowed.includes(draft.businessRequired))
  ) return false;
  return true;
}

export function relationPolicyDraftChanged(
  relation: RelationPolicyCatalogItem,
  draft: RelationPolicyDraft | null,
) {
  if (!draft) return false;
  return (
    relation.deleteLinkage.mode === "editable"
    && draft.targetDelete !== relation.deleteLinkage.effective
  ) || (
    relation.businessRequired.mode === "editable"
    && draft.businessRequired !== relation.businessRequired.effective
  );
}

export function editableRelationPolicySettings(
  relation: RelationPolicyCatalogItem,
  draft: RelationPolicyDraft,
): RelationPolicyMutationSettings {
  const settings: RelationPolicyMutationSettings = {};
  if (relation.deleteLinkage.mode === "editable" && draft.targetDelete) {
    settings.targetDelete = draft.targetDelete;
  }
  if (relation.businessRequired.mode === "editable" && draft.businessRequired) {
    settings.businessRequired = draft.businessRequired;
  }
  return settings;
}

export function relationPolicyHasEditableField(relation: RelationPolicyCatalogItem) {
  return Boolean(relation.policyGroup) && !relation.policyGroup?.stale && (
    relation.deleteLinkage.mode === "editable"
    || relation.businessRequired.mode === "editable"
  );
}

export function relationPolicyInvalidMessages(relation: RelationPolicyCatalogItem) {
  const messages = new Set<string>();
  if (relation.policyGroup?.stale) {
    messages.add("系统预设已更新，请刷新后复核。");
  }
  if (relation.deleteLinkage.mode === "invalid") {
    messages.add(relation.deleteLinkage.reason || "未找到删除联动规则，当前关系不能调整。");
  }
  if (relation.businessRequired.mode === "invalid") {
    messages.add(relation.businessRequired.reason || "未找到业务必填规则，不能从数据库可空性推断。");
  }
  for (const issue of relation.issues) {
    if (issue.trim()) messages.add(issue.trim());
  }
  return [...messages];
}
