import type { BusinessRequiredPolicy, RelationPolicyPreset } from "@workspace/platform/relation-registration-contract";
import type { RelationPolicyConfigSnapshot } from "@workspace/platform/server/relation-policy-config";
import {
  applyRelationPolicyOverride,
  type RelationPolicyRuntimeGroup,
  type RelationPolicyStoredOverride,
} from "@workspace/platform/server/relation-policy-runtime";
import {
  relationMetadataFromRegistration,
  type RelationRegistration,
} from "@workspace/platform/server/relation-targets";
import type {
  DatabaseRelationCatalogItem,
  DatabaseSchemaCatalog,
  DatabaseSchemaModule,
} from "../database-schema-contract";
import type {
  RelationPolicyCatalogItem,
  RelationPolicyField,
  RelationPolicyGroupCatalogItem,
  RelationPolicyModuleCatalogItem,
  RelationPolicyPhysicalEvidence,
} from "../relation-policy-contract";

export interface RegisteredRelationEntry {
  moduleKey: string;
  registration: RelationRegistration;
}

export interface ModuleDescriptor {
  key: string;
  label: string;
}

export interface BusinessRequiredSpec {
  baseline: BusinessRequiredPolicy | null;
  allowed: BusinessRequiredPolicy[];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function policyPreset(value: unknown): RelationPolicyPreset | null {
  return typeof value === "string" ? value as RelationPolicyPreset : null;
}

export function businessRequiredPolicy(value: unknown): BusinessRequiredPolicy | null {
  return value === "required" || value === "optional" ? value : null;
}

function splitFields(value: string) {
  return value.split(",").map((field) => field.trim()).filter(Boolean);
}

export function physicalKey(input: {
  sourceTable: string;
  sourceColumns: readonly string[];
  targetTable: string;
  targetColumns: readonly string[];
}) {
  return `${input.sourceTable}\u0000${input.sourceColumns.join("\u0000")}\u0001${input.targetTable}\u0000${input.targetColumns.join("\u0000")}`;
}

export function physicalEvidence(
  relation: DatabaseRelationCatalogItem,
  schema: DatabaseSchemaCatalog,
): RelationPolicyPhysicalEvidence {
  const sourceTable = schema.tables.find((table) => table.name === relation.sourceTable);
  const required = new Map(sourceTable?.columns.map((column) => [column.name, column.required]) ?? []);
  return {
    constraintName: relation.constraintName, sourceTable: relation.sourceTable,
    sourceColumns: [...relation.sourceColumns], targetTable: relation.targetTable,
    targetColumns: [...relation.targetColumns],
    sourceRequired: relation.sourceColumns.every((column) => required.get(column) === true), onDelete: relation.onDelete,
  };
}

function storedOverride(config: RelationPolicyConfigSnapshot): RelationPolicyStoredOverride {
  return {
    policyKey: config.policyKey, settings: config.settings as RelationPolicyStoredOverride["settings"],
    baselineHash: config.baselineHash, version: config.version,
  };
}

export function legacyLifecycleFields(config: RelationPolicyConfigSnapshot | null) {
  const settings = asRecord(config?.settings);
  return ["targetArchive", "targetRestore", "sourceRelationChange"].filter((field) => (
    Object.prototype.hasOwnProperty.call(settings, field)
  ));
}

export function hasPersistedSettings(config: RelationPolicyConfigSnapshot | null | undefined) {
  return Boolean(config && Object.keys(config.settings).length > 0);
}

export function registrationMatchesPolicy(entry: RegisteredRelationEntry, policyKey: string) {
  return entry.registration.adapterKey === policyKey || entry.registration.key === policyKey;
}

function retiredPolicyReason(policyKey: string) {
  return `策略组 ${policyKey} 已退出代码运行时，但仍保留历史覆盖；请恢复系统预设`;
}

export function targetDeleteChoices(group: RelationPolicyRuntimeGroup | null) {
  return group ? [...group.configurableTargetDelete] : [];
}

export function requiredSpec(
  group: RelationPolicyRuntimeGroup | null,
  relationKey: string,
  registration?: RelationRegistration,
): BusinessRequiredSpec {
  const explicit = registration?.businessRequired;
  const baseline = explicit ?? (registration && !registration.nullable ? "required" : null);
  if (!baseline) return { baseline: null, allowed: [] };
  const runtimePolicy = group?.businessRequiredByRelation[relationKey];
  const allowed = runtimePolicy?.configurable ?? [baseline];
  return { baseline, allowed: [...new Set(allowed)] };
}

export function configuredBusinessRequired(config: RelationPolicyConfigSnapshot | null, relationKey: string) {
  const settings = asRecord(config?.settings);
  return businessRequiredPolicy(asRecord(settings.businessRequiredByRelation)[relationKey]);
}

export function canSkipRequiredResetPreflight(
  group: RelationPolicyRuntimeGroup,
  config: RelationPolicyConfigSnapshot | null,
  relationKey: string,
) {
  if (!config || config.baselineHash !== group.baselineHash || legacyLifecycleFields(config).length) {
    return false;
  }
  const applied = applyRelationPolicyOverride(group, storedOverride(config));
  return !applied.stale && applied.businessRequiredByRelation[relationKey] === "required";
}

function policyField<T>(input: {
  baseline: T | null;
  effective: T | null;
  allowed: T[];
  overridden: boolean;
  invalidReason?: string | null;
  fixedReason: string;
}): RelationPolicyField<T> {
  if (input.invalidReason || input.baseline === null || input.effective === null) {
    return {
      mode: "invalid", baseline: input.baseline, effective: input.effective,
      allowed: input.allowed, overridden: false,
      reason: input.invalidReason ?? "关系策略缺少可执行代码基线",
    };
  }
  const editable = input.allowed.length > 1;
  return {
    mode: editable ? "editable" : "fixed", baseline: input.baseline, effective: input.effective,
    allowed: input.allowed, overridden: input.overridden, reason: editable ? null : input.fixedReason,
  };
}

function invalidField<T>(reason: string): RelationPolicyField<T> {
  return { mode: "invalid", baseline: null, effective: null, allowed: [], overridden: false, reason };
}

export function flattenSchemaModules(modules: readonly DatabaseSchemaModule[]): ModuleDescriptor[] {
  return modules.flatMap((module) => [
    { key: module.key, label: module.label },
    ...flattenSchemaModules(module.children),
  ]);
}

export function moduleCatalog(
  descriptors: readonly ModuleDescriptor[],
  relations: readonly RelationPolicyCatalogItem[],
): RelationPolicyModuleCatalogItem[] {
  const labels = new Map(descriptors.map((module) => [module.key, module.label]));
  for (const relation of relations) if (!labels.has(relation.moduleKey)) labels.set(relation.moduleKey, relation.moduleKey);
  return [...labels].map(([key, label]) => {
    const owned = relations.filter((relation) => relation.moduleKey === key);
    return {
      key, label, relationCount: owned.length,
      editableRelationCount: owned.filter((relation) => (
        relation.deleteLinkage.mode === "editable" || relation.businessRequired.mode === "editable"
      )).length,
      invalidRelationCount: owned.filter((relation) => (
        relation.deleteLinkage.mode === "invalid" || relation.businessRequired.mode === "invalid"
      )).length,
    };
  }).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

function groupCatalog(
  group: RelationPolicyRuntimeGroup,
  config: RelationPolicyConfigSnapshot | null,
  stale: boolean,
  overridden: boolean,
): RelationPolicyGroupCatalogItem {
  return {
    policyKey: group.policyKey, relationKeys: [...group.relationKeys], baselineHash: group.baselineHash,
    version: config?.version ?? 0, overridden, stale, updatedAt: config?.updatedAt.toISOString() ?? null,
    updatedByUserId: config?.updatedByUserId ?? null,
  };
}

function retiredGroupCatalog(
  config: RelationPolicyConfigSnapshot,
  relationKeys: readonly string[],
): RelationPolicyGroupCatalogItem {
  return {
    policyKey: config.policyKey,
    relationKeys: [...relationKeys],
    baselineHash: config.baselineHash,
    version: config.version,
    overridden: true,
    stale: true,
    updatedAt: config.updatedAt.toISOString(),
    updatedByUserId: config.updatedByUserId,
  };
}

export function retiredPolicyRelationKey(policyKey: string) {
  return policyKey;
}

export function unregisteredRetiredPolicyItem(
  config: RelationPolicyConfigSnapshot,
): RelationPolicyCatalogItem {
  const relationKey = retiredPolicyRelationKey(config.policyKey);
  const reason = retiredPolicyReason(config.policyKey);
  return {
    relationKey,
    moduleKey: "unassigned",
    title: config.policyKey,
    source: { entity: "未登记关系策略", fields: [] },
    target: { entity: "代码运行时", fields: [] },
    nullable: true,
    semantics: "retired_policy",
    policyGroup: retiredGroupCatalog(config, [relationKey]),
    deleteLinkage: invalidField(reason),
    businessRequired: invalidField(reason),
    physicalEvidence: null,
    orphanPhysical: false,
    issues: [reason],
  };
}

export function registeredRelationItem(input: {
  entry: RegisteredRelationEntry;
  group: RelationPolicyRuntimeGroup | null;
  config: RelationPolicyConfigSnapshot | null;
  retiredRelationKeys?: readonly string[];
  evidence: RelationPolicyPhysicalEvidence | null;
}): RelationPolicyCatalogItem {
  const { entry, group, config, evidence, retiredRelationKeys = [] } = input;
  const retired = !group && hasPersistedSettings(config);
  const metadata = relationMetadataFromRegistration(entry.registration);
  const reference = group?.references.find((item) => item.relationKey === entry.registration.key);
  const legacy = legacyLifecycleFields(config);
  const applied = group
    ? applyRelationPolicyOverride(group, config && hasPersistedSettings(config) ? storedOverride(config) : null)
    : null;
  const staleReason = retired
    ? retiredPolicyReason(config!.policyKey)
    : legacy.length
      ? `旧配置仍包含已隐藏生命周期字段：${legacy.join("、")}；请恢复代码基线后重设`
      : applied?.stale ? applied.error ?? "关系策略配置已失效" : null;
  const baselineDelete = group?.baseline.targetDelete ?? metadata.lifecycle.targetDelete;
  const effectiveDelete = applied?.lifecycle.targetDelete ?? baselineDelete;
  const deleteChoices = targetDeleteChoices(group);
  const normalizedDeleteChoices = deleteChoices.length
    ? deleteChoices
    : baselineDelete ? [baselineDelete] : [];
  const required = requiredSpec(group, entry.registration.key, entry.registration);
  const configuredRequired = configuredBusinessRequired(config, entry.registration.key);
  const effectiveRequired = staleReason ? required.baseline : configuredRequired ?? required.baseline;
  const requiredOverridden = Boolean(
    configuredRequired && required.baseline && configuredRequired !== required.baseline && !staleReason,
  );
  const deleteOverridden = Boolean(
    effectiveDelete && baselineDelete && effectiveDelete !== baselineDelete && !staleReason,
  );
  const issues: string[] = [];
  if (staleReason) issues.push(staleReason);
  if (metadata.physical && !evidence) issues.push("注册关系未匹配到数据库物理外键");
  const physicallyRequiredButOptional = evidence?.sourceRequired && effectiveRequired === "optional";
  if (physicallyRequiredButOptional) issues.push("业务可选与数据库 NOT NULL 约束冲突");
  const invalidReason = physicallyRequiredButOptional
    ? "数据库列为 NOT NULL，业务必填不能设为可选"
    : staleReason;
  return {
    relationKey: entry.registration.key,
    moduleKey: entry.moduleKey,
    title: group?.title ?? entry.registration.targetLabel ?? entry.registration.key,
    source: {
      entity: reference?.sourceEntity ?? metadata.physical?.sourceModel ?? entry.registration.source.entity,
      fields: reference ? splitFields(reference.sourceField) : metadata.physical?.sourceFields ?? [entry.registration.source.field],
    },
    target: {
      entity: reference?.targetEntity ?? metadata.physical?.targetModel ?? entry.registration.target,
      fields: reference ? splitFields(reference.targetField) : metadata.physical?.targetFields ?? ["id"],
      label: reference?.targetLabel ?? entry.registration.targetLabel,
    },
    nullable: entry.registration.nullable,
    semantics: metadata.semantics,
    policyGroup: group
      ? groupCatalog(group, config, Boolean(staleReason), deleteOverridden || requiredOverridden)
      : retired && config
        ? retiredGroupCatalog(
            config,
            retiredRelationKeys.length ? retiredRelationKeys : [entry.registration.key],
          )
        : null,
    deleteLinkage: policyField({
      baseline: baselineDelete,
      effective: effectiveDelete,
      allowed: normalizedDeleteChoices,
      overridden: deleteOverridden,
      invalidReason: staleReason,
      fixedReason: group ? "删除联动由代码策略固定" : "未接入可配置删除运行时",
    }),
    businessRequired: policyField({
      baseline: required.baseline,
      effective: effectiveRequired,
      allowed: required.allowed,
      overridden: requiredOverridden,
      invalidReason,
      fixedReason: "业务必填由代码或数据库约束固定",
    }),
    physicalEvidence: evidence,
    orphanPhysical: false,
    issues,
  };
}

export function orphanPhysicalItem(
  relation: DatabaseRelationCatalogItem,
  schema: DatabaseSchemaCatalog,
): RelationPolicyCatalogItem {
  const evidence = physicalEvidence(relation, schema);
  const table = schema.tables.find((item) => item.name === relation.sourceTable);
  const reason = "数据库物理外键未登记到 Relation Catalog";
  return {
    relationKey: `physical:${relation.constraintName}`,
    moduleKey: table?.moduleKey ?? "unassigned",
    title: `${relation.sourceTable}.${relation.sourceColumns.join(", ")} → ${relation.targetTable}`,
    source: { entity: relation.sourceTable, fields: [...relation.sourceColumns] },
    target: { entity: relation.targetTable, fields: [...relation.targetColumns] },
    nullable: !evidence.sourceRequired,
    semantics: "physical",
    policyGroup: null,
    deleteLinkage: invalidField(reason),
    businessRequired: invalidField(reason),
    physicalEvidence: evidence,
    orphanPhysical: true,
    issues: [reason],
  };
}
