import "server-only";

import { createHash } from "node:crypto";

import { activeModuleDefinitions } from "../effective-module-registry";
import type {
  BusinessRequiredPolicy,
  RelationLifecycleField,
  RelationPolicyPreset,
} from "../relation-registration-contract";
import type { RelationRegistration } from "./relation-targets";

export const RELATION_LIFECYCLE_FIELDS = [
  "targetDelete",
  "targetArchive",
  "targetRestore",
  "sourceRelationChange",
] as const satisfies readonly RelationLifecycleField[];

export type RelationPolicyLifecycle = Record<RelationLifecycleField, RelationPolicyPreset>;
export type RelationPolicyLifecycleOverride = Partial<RelationPolicyLifecycle>;
export type RelationPolicyBusinessRequiredOverride = Record<string, BusinessRequiredPolicy>;
export type RelationPolicyRuntimeStoredSettings = RelationPolicyLifecycleOverride & {
  businessRequiredByRelation?: RelationPolicyBusinessRequiredOverride;
};

export interface RelationPolicyRuntimeReference {
  relationKey: string;
  sourceEntity: string;
  sourceField: string;
  targetEntity: string;
  targetField: string;
  targetLabel: string;
  nullable: boolean;
  semantics: string;
}

export interface RelationBusinessRequiredRuntimePolicy {
  relationKey: string;
  policyKey: string;
  baseline: BusinessRequiredPolicy;
  configurable: readonly BusinessRequiredPolicy[];
  physical: {
    sourceModel: string;
    sourceFields: string[];
  } | null;
}

export interface RelationPolicyRuntimeGroup {
  /** Stable adapter capability key; every relation in the group changes atomically. */
  policyKey: string;
  scope: string;
  moduleKey: string;
  title: string;
  relationKeys: string[];
  references: RelationPolicyRuntimeReference[];
  baseline: RelationPolicyLifecycle;
  /** Internal lifecycle declarations are retained for legacy stored reads and Work execution. */
  configurableLifecycle: Partial<Record<RelationLifecycleField, readonly RelationPolicyPreset[]>>;
  /** Settings may write only this delete field. */
  configurableTargetDelete: readonly RelationPolicyPreset[];
  /** Business-required policy remains relation-specific even when delete behavior is grouped. */
  businessRequiredByRelation: Record<string, RelationBusinessRequiredRuntimePolicy>;
  baselineHash: string;
}

export interface RelationPolicyStoredOverride {
  policyKey: string;
  settings: RelationPolicyRuntimeStoredSettings;
  baselineHash: string;
  version: number;
}

export interface AppliedRelationPolicy {
  lifecycle: RelationPolicyLifecycle;
  businessRequiredByRelation: Record<string, BusinessRequiredPolicy>;
  overridden: boolean;
  stale: boolean;
  error: string | null;
}

interface RegistrationEntry {
  moduleKey: string;
  registration: RelationRegistration;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function hashValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function equalChoices(left: readonly RelationPolicyPreset[], right: readonly RelationPolicyPreset[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizedChoices(
  policyKey: string,
  field: RelationLifecycleField,
  baseline: RelationPolicyPreset,
  declarations: readonly RelationPolicyPreset[][],
) {
  if (!declarations.length) return undefined;
  const choices = [...new Set(declarations[0])];
  for (const declaration of declarations.slice(1)) {
    const normalized = [...new Set(declaration)];
    if (!equalChoices(choices, normalized)) {
      throw new Error(`关系策略 ${policyKey}.${field} 的可配置选项不一致`);
    }
  }
  if (!choices.includes(baseline)) {
    throw new Error(`关系策略 ${policyKey}.${field} 的选项必须包含代码基线 ${baseline}`);
  }
  if (choices.includes("exempt_with_reason")) {
    throw new Error(`关系策略 ${policyKey}.${field} 不能把代码豁免暴露为运行时配置`);
  }
  return choices;
}

function businessRequiredBaseline(registration: RelationRegistration): BusinessRequiredPolicy {
  // The nullable fallback is an internal compatibility default only. Nullable
  // registrations without an explicit business contract are omitted from the
  // runtime policy map and must not be presented as product-level optionality.
  const baseline = registration.businessRequired ?? (registration.nullable ? "optional" : "required");
  if (baseline === "optional" && !registration.nullable) {
    throw new Error(`关系 ${registration.key} 的物理字段不可空，业务必填不能设为 optional`);
  }
  return baseline;
}

function hasBusinessRequiredRuntimePolicy(registration: RelationRegistration) {
  return !registration.nullable
    || registration.businessRequired !== undefined
    || Boolean(registration.configurableBusinessRequired?.length);
}

function normalizedBusinessRequiredChoices(registration: RelationRegistration) {
  const baseline = businessRequiredBaseline(registration);
  const choices = [...new Set(registration.configurableBusinessRequired ?? [])];
  if (!choices.length) return { baseline, choices: [baseline] as BusinessRequiredPolicy[] };
  if (!choices.includes(baseline)) {
    throw new Error(`关系 ${registration.key} 的业务必填选项必须包含代码基线 ${baseline}`);
  }
  if (!registration.nullable && choices.includes("optional")) {
    throw new Error(`关系 ${registration.key} 的物理字段不可空，不能开放 optional`);
  }
  return { baseline, choices };
}

function physicalSource(registration: RelationRegistration) {
  if (registration.physical === null
    || registration.source.entity === "Any"
    || registration.source.valueKind === "semantic") return null;
  const sourceModel = registration.physical?.sourceModel ?? registration.source.entity;
  const sourceFields = registration.physical?.sourceFields ?? [registration.source.field];
  return sourceModel && sourceFields.length
    ? { sourceModel, sourceFields: [...sourceFields] }
    : null;
}

function registrationEntries(): RegistrationEntry[] {
  const entries: RegistrationEntry[] = [];
  for (const definition of activeModuleDefinitions) {
    const moduleKey = definition.moduleDef?.key ?? definition.packageName;
    for (const registration of definition.relationRegistrations ?? []) {
      entries.push({ moduleKey, registration });
    }
  }
  return entries;
}

function runtimePolicyKey(registration: RelationRegistration) {
  if (registration.adapterKey) return registration.adapterKey;
  return registration.configurableBusinessRequired?.length ? registration.key : null;
}

function completeBaseline(policyKey: string, registrations: readonly RelationRegistration[]) {
  const lifecycle = registrations[0]?.lifecycle;
  if (!lifecycle) throw new Error(`关系策略 ${policyKey} 缺少生命周期代码基线`);
  const baseline = {} as RelationPolicyLifecycle;
  for (const field of RELATION_LIFECYCLE_FIELDS) {
    const policy = lifecycle[field];
    if (!policy) throw new Error(`关系策略 ${policyKey}.${field} 缺少可执行代码基线`);
    baseline[field] = policy;
  }
  for (const registration of registrations.slice(1)) {
    for (const field of RELATION_LIFECYCLE_FIELDS) {
      if (registration.lifecycle?.[field] !== baseline[field]) {
        throw new Error(`关系策略 ${policyKey}.${field} 在共享 adapterKey 内存在不同代码基线`);
      }
    }
  }
  return baseline;
}

function buildRuntimeGroups() {
  const entries = registrationEntries();
  const byAdapter = new Map<string, RegistrationEntry[]>();
  for (const entry of entries) {
    const policyKey = runtimePolicyKey(entry.registration);
    if (!policyKey) continue;
    const group = byAdapter.get(policyKey) ?? [];
    group.push(entry);
    byAdapter.set(policyKey, group);
  }

  const groups: RelationPolicyRuntimeGroup[] = [];
  for (const [policyKey, groupEntries] of byAdapter) {
    const hasConfigurableLifecycle = groupEntries.some(({ registration }) => registration.configurableLifecycle
      && Object.values(registration.configurableLifecycle).some((choices) => choices?.length));
    const hasConfigurableBusinessRequired = groupEntries.some(({ registration }) => (
      Boolean(registration.configurableBusinessRequired?.length)
    ));
    if (!hasConfigurableLifecycle && !hasConfigurableBusinessRequired) {
      continue;
    }
    const registrations = groupEntries.map(({ registration }) => registration)
      .sort((left, right) => left.key.localeCompare(right.key));
    const moduleKeys = new Set(groupEntries.map(({ moduleKey }) => moduleKey));
    const scopes = new Set(registrations.map((registration) => registration.scope));
    if (moduleKeys.size !== 1 || scopes.size !== 1) {
      throw new Error(`关系策略 ${policyKey} 不能跨模块或跨 scope 配置`);
    }
    if (hasConfigurableLifecycle && registrations.some((registration) => !registration.adapterKey)) {
      throw new Error(`关系策略 ${policyKey} 缺少运行时 adapter`);
    }
    if (hasConfigurableBusinessRequired && registrations.some((registration) => !registration.adapterKey)) {
      throw new Error(`关系策略 ${policyKey} 的业务必填配置缺少稳定策略组 adapterKey`);
    }

    const baseline = completeBaseline(policyKey, registrations);
    const configurableLifecycle: RelationPolicyRuntimeGroup["configurableLifecycle"] = {};
    for (const field of RELATION_LIFECYCLE_FIELDS) {
      const declarations = registrations
        .map((registration) => registration.configurableLifecycle?.[field])
        .filter((choices): choices is RelationPolicyPreset[] => Boolean(choices?.length));
      const choices = normalizedChoices(policyKey, field, baseline[field], declarations);
      if (choices) configurableLifecycle[field] = choices;
    }

    for (const field of RELATION_LIFECYCLE_FIELDS) {
      const choices = configurableLifecycle[field] ?? [];
      if (choices.includes("auto_cascade_owned")
        && registrations.some((registration) => registration.semantics !== "owned_child")) {
        throw new Error(`关系策略 ${policyKey}.${field} 仅自有明细可自动级联`);
      }
      if ((choices.includes("confirm_unlink") || choices.includes("confirm_unlink_or_cascade"))
        && registrations.some((registration) => !registration.nullable)) {
        throw new Error(`关系策略 ${policyKey}.${field} 的解除引用选项要求全部关系可空`);
      }
    }

    const businessRequiredByRelation = Object.fromEntries(registrations
      .filter(hasBusinessRequiredRuntimePolicy)
      .map((registration) => {
      const required = normalizedBusinessRequiredChoices(registration);
      return [registration.key, {
        relationKey: registration.key,
        policyKey,
        baseline: required.baseline,
        configurable: required.choices,
        physical: physicalSource(registration),
      } satisfies RelationBusinessRequiredRuntimePolicy];
    }));

    const first = registrations[0];
    const relationKeys = registrations.map((registration) => registration.key);
    const references = registrations.map((registration): RelationPolicyRuntimeReference => ({
      relationKey: registration.key,
      sourceEntity: registration.physical?.sourceModel ?? registration.source.entity,
      sourceField: registration.physical?.sourceFields.join(", ") ?? registration.source.field,
      targetEntity: registration.physical?.targetModel ?? registration.target,
      targetField: registration.physical?.targetFields.join(", ") ?? "id",
      targetLabel: registration.targetLabel ?? registration.target,
      nullable: registration.nullable,
      semantics: registration.semantics ?? "reference",
    }));
    const titleBase = first.targetLabel ?? policyKey;
    const groupWithoutHash = {
      policyKey,
      scope: first.scope,
      moduleKey: [...moduleKeys][0],
      title: registrations.length === 1 ? titleBase : `${titleBase}（${registrations.length} 个引用）`,
      relationKeys,
      references,
      baseline,
      configurableLifecycle,
    };
    const baselineHash = hashValue(hasConfigurableBusinessRequired
      ? {
          ...groupWithoutHash,
          businessRequiredByRelation,
        }
      : groupWithoutHash);
    groups.push({
      ...groupWithoutHash,
      configurableTargetDelete: configurableLifecycle.targetDelete
        ? [...configurableLifecycle.targetDelete]
        : [],
      businessRequiredByRelation,
      baselineHash,
    });
  }
  return groups.sort((left, right) => left.policyKey.localeCompare(right.policyKey));
}

let runtimeGroups: RelationPolicyRuntimeGroup[] | undefined;

export function listRelationPolicyRuntimeGroups(): RelationPolicyRuntimeGroup[] {
  runtimeGroups ??= buildRuntimeGroups();
  return runtimeGroups.map((group) => ({
    ...group,
    relationKeys: [...group.relationKeys],
    references: group.references.map((reference) => ({ ...reference })),
    baseline: { ...group.baseline },
    configurableLifecycle: Object.fromEntries(
      Object.entries(group.configurableLifecycle).map(([field, choices]) => [field, [...choices]]),
    ),
    configurableTargetDelete: [...group.configurableTargetDelete],
    businessRequiredByRelation: Object.fromEntries(
      Object.entries(group.businessRequiredByRelation).map(([relationKey, policy]) => [relationKey, {
        ...policy,
        configurable: [...policy.configurable],
        physical: policy.physical ? {
          sourceModel: policy.physical.sourceModel,
          sourceFields: [...policy.physical.sourceFields],
        } : null,
      }]),
    ),
  }));
}

export function findRelationPolicyRuntimeGroup(policyKey: string) {
  return listRelationPolicyRuntimeGroups().find((group) => group.policyKey === policyKey) ?? null;
}

export function findRelationBusinessRequiredRuntimePolicy(relationKey: string) {
  const matches = listRelationPolicyRuntimeGroups()
    .map((group) => group.businessRequiredByRelation[relationKey])
    .filter((policy): policy is RelationBusinessRequiredRuntimePolicy => Boolean(policy));
  if (matches.length > 1) throw new Error(`关系 ${relationKey} 存在多个业务必填策略组`);
  return matches[0] ?? null;
}

function businessRequiredBaselines(group: RelationPolicyRuntimeGroup) {
  return Object.fromEntries(Object.entries(group.businessRequiredByRelation)
    .map(([relationKey, policy]) => [relationKey, policy.baseline]));
}

export function compactRelationPolicyOverride(
  group: RelationPolicyRuntimeGroup,
  settings: RelationPolicyRuntimeStoredSettings,
): RelationPolicyRuntimeStoredSettings {
  const compacted: RelationPolicyRuntimeStoredSettings = {};
  for (const rawField of Object.keys(settings)) {
    if (rawField !== "targetDelete" && rawField !== "businessRequiredByRelation") {
      throw new Error(`关系策略 ${group.policyKey} 包含未知配置字段 ${rawField}`);
    }
  }
  if (settings.targetDelete) {
    const choices = group.configurableTargetDelete;
    if (!choices.length) {
      if (settings.targetDelete !== group.baseline.targetDelete) {
        throw new Error(`关系策略 ${group.policyKey}.targetDelete 由代码管理，不能覆盖`);
      }
    } else if (!choices.includes(settings.targetDelete)) {
      throw new Error(`关系策略 ${group.policyKey}.targetDelete 不允许设置为 ${settings.targetDelete}`);
    } else if (settings.targetDelete !== group.baseline.targetDelete) {
      compacted.targetDelete = settings.targetDelete;
    }
  }
  const requiredOverride: RelationPolicyBusinessRequiredOverride = {};
  for (const [relationKey, required] of Object.entries(settings.businessRequiredByRelation ?? {})) {
    const policy = group.businessRequiredByRelation[relationKey];
    if (!policy) throw new Error(`关系策略 ${group.policyKey} 不包含关系 ${relationKey}`);
    if (!policy.configurable.includes(required)) {
      throw new Error(`关系 ${relationKey} 的业务必填不允许设置为 ${required}`);
    }
    if (required !== policy.baseline) requiredOverride[relationKey] = required;
  }
  if (Object.keys(requiredOverride).length) compacted.businessRequiredByRelation = requiredOverride;
  return compacted;
}

export function applyRelationPolicyOverride(
  group: RelationPolicyRuntimeGroup,
  stored: RelationPolicyStoredOverride | null | undefined,
): AppliedRelationPolicy {
  const requiredBaselines = businessRequiredBaselines(group);
  if (!stored) {
    return {
      lifecycle: { ...group.baseline },
      businessRequiredByRelation: requiredBaselines,
      overridden: false,
      stale: false,
      error: null,
    };
  }
  if (stored.policyKey !== group.policyKey) {
    return {
      lifecycle: { ...group.baseline },
      businessRequiredByRelation: requiredBaselines,
      overridden: false,
      stale: true,
      error: `配置键 ${stored.policyKey} 与策略组 ${group.policyKey} 不匹配`,
    };
  }
  if (stored.baselineHash !== group.baselineHash) {
    return {
      lifecycle: { ...group.baseline },
      businessRequiredByRelation: requiredBaselines,
      overridden: false,
      stale: true,
      error: "代码基线已变化，请在 Settings 中复核并重新保存",
    };
  }
  let compacted: RelationPolicyRuntimeStoredSettings;
  try {
    compacted = compactRelationPolicyOverride(group, stored.settings);
  } catch (error) {
    return {
      lifecycle: { ...group.baseline },
      businessRequiredByRelation: requiredBaselines,
      overridden: false,
      stale: true,
      error: error instanceof Error ? error.message : "关系策略覆盖无效",
    };
  }
  const lifecycle: RelationPolicyLifecycleOverride = compacted.targetDelete
    ? { targetDelete: compacted.targetDelete }
    : {};
  const required = compacted.businessRequiredByRelation ?? {};
  return {
    lifecycle: { ...group.baseline, ...lifecycle },
    businessRequiredByRelation: { ...requiredBaselines, ...required },
    overridden: Object.keys(lifecycle).length > 0 || Object.keys(required).length > 0,
    stale: false,
    error: null,
  };
}

export function relationPolicyRuntimeRevision(
  groups: readonly RelationPolicyRuntimeGroup[],
  configs: readonly RelationPolicyStoredOverride[],
) {
  const knownPolicyKeys = new Set(groups.map((group) => group.policyKey));
  return `relation-policy-${hashValue({
    baselines: groups.map((group) => [group.policyKey, group.baselineHash]),
    configs: configs
      .filter((config) => knownPolicyKeys.has(config.policyKey))
      .sort((left, right) => left.policyKey.localeCompare(right.policyKey))
      .map((config) => ({
        policyKey: config.policyKey,
        baselineHash: config.baselineHash,
        settings: config.settings,
        version: config.version,
      })),
  })}`;
}
