import "server-only";

import type { BusinessRequiredPolicy } from "../relation-registration-contract";
import {
  listRelationPolicyConfigs,
  type RelationPolicyConfigSnapshot,
  type RelationPolicyReadClient,
} from "./relation-policy-config";
import {
  applyRelationPolicyOverride,
  findRelationBusinessRequiredRuntimePolicy,
  findRelationPolicyRuntimeGroup,
  type RelationPolicyStoredOverride,
} from "./relation-policy-runtime";
import {
  validateFkValue,
  type LifecycleScope,
  type SelectorRelationRegistry,
} from "./relation-registry";

export class RelationPolicyPhysicalResolutionError extends Error {
  readonly code = "RELATION_POLICY_PHYSICAL_RESOLUTION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "RelationPolicyPhysicalResolutionError";
  }
}

function storedOverride(config: RelationPolicyConfigSnapshot): RelationPolicyStoredOverride {
  return {
    policyKey: config.policyKey,
    settings: config.settings,
    baselineHash: config.baselineHash,
    version: config.version,
  };
}

function uniqueRelationKeys(relationKeys: readonly string[]) {
  return [...new Set(relationKeys.map((relationKey) => relationKey.trim()).filter(Boolean))];
}

export function relationPolicyKeysForBusinessRequiredRelations(
  relationKeys: readonly string[],
) {
  return [...new Set(uniqueRelationKeys(relationKeys).map((relationKey) => {
    const policy = findRelationBusinessRequiredRuntimePolicy(relationKey);
    if (!policy) throw new Error(`关系 ${relationKey} 未注册业务必填运行时策略`);
    return policy.policyKey;
  }))].sort();
}

export async function resolveConfiguredBusinessRequiredByRelation(
  relationKeys: readonly string[],
  client?: RelationPolicyReadClient,
): Promise<Record<string, BusinessRequiredPolicy>> {
  const normalizedKeys = uniqueRelationKeys(relationKeys);
  if (!normalizedKeys.length) return {};
  const policies = normalizedKeys.map((relationKey) => {
    const policy = findRelationBusinessRequiredRuntimePolicy(relationKey);
    if (!policy) throw new Error(`关系 ${relationKey} 未注册业务必填运行时策略`);
    return policy;
  });
  const configs = await listRelationPolicyConfigs(client);
  const configByPolicyKey = new Map(configs.map((config) => [config.policyKey, config]));
  const appliedByPolicyKey = new Map<string, ReturnType<typeof applyRelationPolicyOverride>>();
  const result: Record<string, BusinessRequiredPolicy> = {};

  for (const policy of policies) {
    let applied = appliedByPolicyKey.get(policy.policyKey);
    if (!applied) {
      const group = findRelationPolicyRuntimeGroup(policy.policyKey);
      if (!group) throw new Error(`关系 ${policy.relationKey} 的策略组 ${policy.policyKey} 不存在`);
      const config = configByPolicyKey.get(policy.policyKey);
      applied = applyRelationPolicyOverride(
        group,
        config && Object.keys(config.settings).length > 0 ? storedOverride(config) : null,
      );
      if (applied.stale) {
        throw new Error(`关系策略 ${policy.policyKey} 无法应用：${applied.error ?? "配置已失效"}`);
      }
      appliedByPolicyKey.set(policy.policyKey, applied);
    }
    result[policy.relationKey] = applied.businessRequiredByRelation[policy.relationKey] ?? policy.baseline;
  }
  return result;
}

export async function resolveConfiguredBusinessRequired(
  relationKey: string,
  client?: RelationPolicyReadClient,
): Promise<BusinessRequiredPolicy> {
  const resolved = await resolveConfiguredBusinessRequiredByRelation([relationKey], client);
  const policy = resolved[relationKey];
  if (!policy) throw new Error(`关系 ${relationKey} 未解析到业务必填策略`);
  return policy;
}

export interface ValidateConfiguredFkValueInput {
  fkKey: string;
  value: unknown;
  lifecycleScope?: LifecycleScope;
  requiredLabel?: string;
  policyClient?: RelationPolicyReadClient;
}

export async function validateConfiguredFkValue(
  registry: SelectorRelationRegistry,
  input: ValidateConfiguredFkValueInput,
) {
  const definition = registry.require(input.fkKey);
  let required: BusinessRequiredPolicy = definition.nullable ? "optional" : "required";
  if (findRelationBusinessRequiredRuntimePolicy(input.fkKey)) {
    try {
      required = await resolveConfiguredBusinessRequired(input.fkKey, input.policyClient);
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "关系业务必填策略不可用",
        status: 409,
      };
    }
  }

  // validateFkValue remains the low-level selector validator. The overlay translates
  // the effective business policy without making relation-registry import runtime code.
  const configuredDefinition = { ...definition, nullable: required === "optional" };
  const configuredRegistry: SelectorRelationRegistry = {
    get: (key) => key === input.fkKey ? configuredDefinition : registry.get(key),
    require: (key) => key === input.fkKey ? configuredDefinition : registry.require(key),
    keys: () => registry.keys(),
    definitions: () => registry.definitions().map((item) => item.key === input.fkKey ? configuredDefinition : item),
  };
  return validateFkValue(configuredRegistry, {
    fkKey: input.fkKey,
    value: input.value,
    lifecycleScope: input.lifecycleScope,
    requiredLabel: input.requiredLabel,
  });
}

type CountDelegate = {
  count(input: { where: Record<string, unknown> }): Promise<number>;
};

function isCountDelegate(value: unknown): value is CountDelegate {
  return Boolean(value && typeof value === "object" && "count" in value
    && typeof (value as { count?: unknown }).count === "function");
}

function normalizedModelKey(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function resolveCountDelegate(client: object, sourceModel: string) {
  const record = client as Record<string, unknown>;
  const expectedKey = `${sourceModel.charAt(0).toLowerCase()}${sourceModel.slice(1)}`;
  if (isCountDelegate(record[expectedKey])) return record[expectedKey];
  const matches = Object.entries(record)
    .filter(([key, value]) => normalizedModelKey(key) === normalizedModelKey(sourceModel) && isCountDelegate(value));
  if (matches.length !== 1) {
    throw new RelationPolicyPhysicalResolutionError(
      `关系源模型 ${sourceModel} 无法唯一解析 Prisma delegate（匹配 ${matches.length} 个）`,
    );
  }
  return matches[0][1] as CountDelegate;
}

export interface PhysicalRelationNullPreflightResult {
  relationKey: string;
  sourceModel: string;
  sourceFields: string[];
  nullCount: number;
  safeToRequire: boolean;
}

export async function preflightPhysicalRelationNulls(input: {
  relationKey: string;
  client: object;
}): Promise<PhysicalRelationNullPreflightResult> {
  const policy = findRelationBusinessRequiredRuntimePolicy(input.relationKey);
  if (!policy) {
    throw new RelationPolicyPhysicalResolutionError(`关系 ${input.relationKey} 未注册业务必填运行时策略`);
  }
  if (!policy.physical) {
    throw new RelationPolicyPhysicalResolutionError(`关系 ${input.relationKey} 缺少唯一物理源映射`);
  }
  const fields = [...new Set(policy.physical.sourceFields)];
  if (!fields.length || fields.some((field) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field))) {
    throw new RelationPolicyPhysicalResolutionError(`关系 ${input.relationKey} 的物理源字段无效`);
  }
  const delegate = resolveCountDelegate(input.client, policy.physical.sourceModel);
  const nullCount = await delegate.count({
    where: fields.length === 1
      ? { [fields[0]]: null }
      : { OR: fields.map((field) => ({ [field]: null })) },
  });
  if (!Number.isInteger(nullCount) || nullCount < 0) {
    throw new RelationPolicyPhysicalResolutionError(`关系 ${input.relationKey} 的空值预检返回无效计数`);
  }
  return {
    relationKey: input.relationKey,
    sourceModel: policy.physical.sourceModel,
    sourceFields: fields,
    nullCount,
    safeToRequire: nullCount === 0,
  };
}
