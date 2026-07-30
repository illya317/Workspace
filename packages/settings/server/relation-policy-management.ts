import "server-only";
import type { BusinessRequiredPolicy } from "@workspace/platform/relation-registration-contract";
import { registeredModuleDefinitions, type RelationAwareWorkspacePackageRegistration } from "@workspace/platform/module-registry";
import {
  RelationPolicyConfigConflictError,
  listRelationPolicyConfigs,
  resetRelationPolicyConfig,
  writeRelationPolicyConfig,
  type RelationPolicyConfigSnapshot,
  type RelationPolicyWriteSettings,
} from "@workspace/platform/server/relation-policy-config";
import { findRelationPolicyRuntimeGroup, listRelationPolicyRuntimeGroups, type RelationPolicyRuntimeGroup } from "@workspace/platform/server/relation-policy-runtime";
import { preflightPhysicalRelationNulls } from "./domain/relation-policy-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { relationMetadataFromRegistration } from "@workspace/platform/server/relation-targets";
import type { DatabaseSchemaCatalog } from "../database-schema-contract";
import type {
  RelationPolicyCatalog,
  RelationPolicyMutationCommand,
} from "../relation-policy-contract";
import { listDatabaseSchemaCatalog } from "./database-catalog";
import {
  asRecord,
  businessRequiredPolicy,
  canSkipRequiredResetPreflight,
  configuredBusinessRequired,
  flattenSchemaModules,
  hasPersistedSettings,
  legacyLifecycleFields,
  moduleCatalog,
  orphanPhysicalItem,
  physicalEvidence,
  physicalKey,
  policyPreset,
  registeredRelationItem,
  registrationMatchesPolicy,
  retiredPolicyRelationKey,
  requiredSpec,
  targetDeleteChoices,
  unregisteredRetiredPolicyItem,
  type ModuleDescriptor,
  type RegisteredRelationEntry,
} from "./relation-policy-catalog";
export type RelationPolicyManagementErrorCode = "RELATION_POLICY_NOT_FOUND" | "RELATION_POLICY_INVALID" | "RELATION_POLICY_CONFLICT";

export class RelationPolicyManagementNotFoundError extends Error {
  readonly code: RelationPolicyManagementErrorCode = "RELATION_POLICY_NOT_FOUND";
  constructor(readonly policyKey: string) {
    super(`关系策略不存在：${policyKey}`);
    this.name = "RelationPolicyManagementNotFoundError";
  }
}
export class RelationPolicyManagementValidationError extends Error {
  readonly code: RelationPolicyManagementErrorCode = "RELATION_POLICY_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "RelationPolicyManagementValidationError";
  }
}
export class RelationPolicyManagementConflictError extends Error {
  readonly code: RelationPolicyManagementErrorCode = "RELATION_POLICY_CONFLICT";
  constructor(message: string, readonly policyKey: string, readonly actualVersion?: number) {
    super(message);
    this.name = "RelationPolicyManagementConflictError";
  }
}

interface BusinessRequiredPreflightResult { ok: boolean; blockingCount?: number; message?: string }
interface RelationPolicyWriteCommitOptions { beforePersist?: (client: object) => Promise<void> }

interface RelationPolicyManagementDependencies {
  listRuntimeGroups(): RelationPolicyRuntimeGroup[];
  findRuntimeGroup(policyKey: string): RelationPolicyRuntimeGroup | null;
  listConfigs(): Promise<RelationPolicyConfigSnapshot[]>;
  listDatabaseSchema(): Promise<DatabaseSchemaCatalog>;
  listRegisteredRelations(): RegisteredRelationEntry[];
  listModules(): ModuleDescriptor[];
  writeConfig(
    input: Parameters<typeof writeRelationPolicyConfig>[0],
    options?: RelationPolicyWriteCommitOptions,
  ): Promise<RelationPolicyConfigSnapshot>;
  resetConfig(
    input: Parameters<typeof resetRelationPolicyConfig>[0],
    options?: RelationPolicyWriteCommitOptions,
  ): Promise<RelationPolicyConfigSnapshot>;
  preflightBusinessRequired(input: {
    relationKey: string;
    policyKey: string;
    client?: object;
  }): Promise<BusinessRequiredPreflightResult>;
  now(): Date;
}

function registryDefinitions() {
  return registeredModuleDefinitions as readonly RelationAwareWorkspacePackageRegistration[];
}

function registeredRelations(): RegisteredRelationEntry[] {
  return registryDefinitions().flatMap((definition) => {
    const moduleKey = definition.moduleDef?.key ?? definition.packageName;
    return (definition.relationRegistrations ?? []).map((registration) => ({ moduleKey, registration }));
  });
}

function registeredModules(): ModuleDescriptor[] {
  return registryDefinitions().flatMap((definition) => definition.moduleDef
    ? [{ key: definition.moduleDef.key, label: definition.moduleDef.label }]
    : []);
}

async function defaultBusinessRequiredPreflight(input: {
  relationKey: string;
  client?: object;
}): Promise<BusinessRequiredPreflightResult> {
  try {
    const result = await preflightPhysicalRelationNulls({
      relationKey: input.relationKey,
      client: input.client ?? prisma,
    });
    return {
      ok: result.safeToRequire,
      blockingCount: result.nullCount,
      message: result.safeToRequire ? undefined : `仍有 ${result.nullCount} 条空值记录，不能设为业务必填`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "业务必填空值预检失败" };
  }
}

const defaultDependencies: RelationPolicyManagementDependencies = {
  listRuntimeGroups: listRelationPolicyRuntimeGroups,
  findRuntimeGroup: findRelationPolicyRuntimeGroup,
  listConfigs: () => listRelationPolicyConfigs(),
  listDatabaseSchema: () => listDatabaseSchemaCatalog(),
  listRegisteredRelations: registeredRelations,
  listModules: registeredModules,
  writeConfig: (input, options) => writeRelationPolicyConfig(input, prisma, {
    beforePersist: options?.beforePersist
      ? ({ transaction }) => options.beforePersist!(transaction)
      : undefined,
  }),
  resetConfig: (input, options) => resetRelationPolicyConfig(input, prisma, {
    beforePersist: options?.beforePersist
      ? ({ transaction }) => options.beforePersist!(transaction)
      : undefined,
  }),
  preflightBusinessRequired: defaultBusinessRequiredPreflight,
  now: () => new Date(),
};

function validateReason(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RelationPolicyManagementValidationError("请填写关系策略修改理由");
  }
  const normalized = value.trim();
  if (normalized.length > 500) {
    throw new RelationPolicyManagementValidationError("关系策略修改理由不能超过 500 个字符");
  }
  return normalized;
}

function existingRequiredMap(config: RelationPolicyConfigSnapshot | null) {
  const value = asRecord(asRecord(config?.settings).businessRequiredByRelation);
  const result: Record<string, BusinessRequiredPolicy> = {};
  for (const [relationKey, rawPolicy] of Object.entries(value)) {
    const policy = businessRequiredPolicy(rawPolicy);
    if (!policy) throw new RelationPolicyManagementValidationError(`关系策略包含无效业务必填配置：${relationKey}`);
    result[relationKey] = policy;
  }
  return result;
}

export function buildRelationPolicyManagementService(
  dependencies: RelationPolicyManagementDependencies = defaultDependencies,
) {
  function requiredPreflightOptions(
    relationKeys: readonly string[],
    policyKey: string,
  ): RelationPolicyWriteCommitOptions | undefined {
    if (!relationKeys.length) return undefined;
    return {
      beforePersist: async (client) => {
        for (const requiredRelationKey of relationKeys) {
          const preflight = await dependencies.preflightBusinessRequired({
            relationKey: requiredRelationKey,
            policyKey,
            client,
          });
          if (!preflight.ok) {
            throw new RelationPolicyManagementValidationError(
              preflight.message ?? `仍有 ${preflight.blockingCount ?? ""} 条空值记录，不能设为业务必填`,
            );
          }
        }
      },
    };
  }

  async function listCatalog(): Promise<RelationPolicyCatalog> {
    const [groups, configs, schema] = await Promise.all([
      Promise.resolve(dependencies.listRuntimeGroups()),
      dependencies.listConfigs(),
      dependencies.listDatabaseSchema(),
    ]);
    const configByKey = new Map(configs.map((config) => [config.policyKey, config]));
    const groupByRelation = new Map(groups.flatMap((group) => (
      group.relationKeys.map((relationKey) => [relationKey, group] as const)
    )));
    const registeredRelations = dependencies.listRegisteredRelations();
    const runtimePolicyKeys = new Set(groups.map((group) => group.policyKey));
    const retiredConfigs = configs.filter((config) => (
      !runtimePolicyKeys.has(config.policyKey) && hasPersistedSettings(config)
    ));
    const retiredRelationKeysByPolicy = new Map(retiredConfigs.map((config) => [
      config.policyKey,
      registeredRelations
        .filter((entry) => registrationMatchesPolicy(entry, config.policyKey))
        .map((entry) => entry.registration.key),
    ]));
    const unregisteredRetiredConfigs = retiredConfigs.filter((config) => (
      (retiredRelationKeysByPolicy.get(config.policyKey) ?? []).length === 0
    ));
    const retiredConfigByRelation = new Map(retiredConfigs.flatMap((config) => (
      (retiredRelationKeysByPolicy.get(config.policyKey) ?? [])
        .map((relationKey) => [relationKey, config] as const)
    )));
    const physicalByKey = new Map(schema.relations.map((relation) => [physicalKey(relation), relation]));
    const consumedPhysical = new Set<string>();
    const relations = registeredRelations.map((entry) => {
      const metadata = relationMetadataFromRegistration(entry.registration);
      const key = metadata.physical ? physicalKey({
        sourceTable: metadata.physical.sourceModel,
        sourceColumns: metadata.physical.sourceFields,
        targetTable: metadata.physical.targetModel,
        targetColumns: metadata.physical.targetFields,
      }) : null;
      const physical = key ? physicalByKey.get(key) ?? null : null;
      if (physical) consumedPhysical.add(physical.key);
      const retiredConfig = retiredConfigByRelation.get(entry.registration.key) ?? null;
      const group = retiredConfig ? null : groupByRelation.get(entry.registration.key) ?? null;
      return registeredRelationItem({
        entry,
        group,
        config: retiredConfig ?? (group ? configByKey.get(group.policyKey) ?? null : null),
        retiredRelationKeys: retiredConfig
          ? retiredRelationKeysByPolicy.get(retiredConfig.policyKey)
          : undefined,
        evidence: physical ? physicalEvidence(physical, schema) : null,
      });
    });
    relations.push(...unregisteredRetiredConfigs.map(unregisteredRetiredPolicyItem));
    relations.push(...schema.relations
      .filter((relation) => !consumedPhysical.has(relation.key))
      .map((relation) => orphanPhysicalItem(relation, schema)));
    relations.sort((left, right) => (
      left.moduleKey.localeCompare(right.moduleKey)
      || left.title.localeCompare(right.title, "zh-CN")
      || left.relationKey.localeCompare(right.relationKey)
    ));
    return {
      generatedAt: dependencies.now().toISOString(),
      modules: moduleCatalog([
        ...dependencies.listModules(),
        ...flattenSchemaModules(schema.modules),
        { key: "unassigned", label: "未归属" },
      ], relations),
      relations,
    };
  }

  async function mutate(command: RelationPolicyMutationCommand, actorUserId: number) {
    const policyKey = typeof command.policyKey === "string" ? command.policyKey.trim() : "";
    const relationKey = typeof command.relationKey === "string" ? command.relationKey.trim() : "";
    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
      throw new RelationPolicyManagementValidationError("关系策略操作人无效");
    }
    if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) {
      throw new RelationPolicyManagementValidationError("关系策略期望版本无效");
    }
    const reason = validateReason(command.reason);
    const configs = await dependencies.listConfigs();
    const current = configs.find((config) => config.policyKey === policyKey) ?? null;
    const group = dependencies.findRuntimeGroup(policyKey);
    if (!group || !group.relationKeys.includes(relationKey)) {
      const registered = dependencies.listRegisteredRelations()
        .some((entry) => entry.registration.key === relationKey
          && registrationMatchesPolicy(entry, policyKey));
      const syntheticRetired = !group && relationKey === retiredPolicyRelationKey(policyKey);
      if ((!registered && !syntheticRetired) || !hasPersistedSettings(current)) {
        throw new RelationPolicyManagementNotFoundError(policyKey || relationKey);
      }
      if (command.reset !== true) {
        throw new RelationPolicyManagementValidationError(
          `已退役关系策略 ${policyKey} 只允许恢复系统预设`,
        );
      }
      if (command.settings !== undefined) {
        throw new RelationPolicyManagementValidationError("恢复代码基线时不能同时提交关系策略字段");
      }
      if (command.baselineHash !== current!.baselineHash) {
        throw new RelationPolicyManagementConflictError(
          "已退役关系策略已变化，请刷新后重新提交",
          policyKey,
          current!.version,
        );
      }
      try {
        await dependencies.resetConfig({
          policyKey,
          baselineHash: current!.baselineHash,
          expectedVersion: command.expectedVersion,
          actorUserId,
          reason,
        });
      } catch (error) {
        if (error instanceof RelationPolicyConfigConflictError) {
          throw new RelationPolicyManagementConflictError(error.message, error.policyKey, error.actualVersion);
        }
        throw error;
      }
      return listCatalog();
    }
    if (command.baselineHash !== group.baselineHash) {
      throw new RelationPolicyManagementConflictError("关系策略代码基线已变化，请刷新后重新提交", group.policyKey);
    }
    const mutation = {
      policyKey: group.policyKey,
      baselineHash: group.baselineHash,
      expectedVersion: command.expectedVersion,
      actorUserId,
      reason,
    };
    if (command.reset === true) {
      if (command.settings !== undefined) {
        throw new RelationPolicyManagementValidationError("恢复代码基线时不能同时提交关系策略字段");
      }
      try {
        const requiredOnReset = group.relationKeys.filter((key) => {
          const itemRegistration = dependencies.listRegisteredRelations()
            .find((entry) => entry.registration.key === key)?.registration;
          const itemSpec = requiredSpec(group, key, itemRegistration);
          return itemSpec.baseline === "required"
            && !canSkipRequiredResetPreflight(group, current, key);
        });
        await dependencies.resetConfig(
          mutation,
          requiredPreflightOptions(requiredOnReset, group.policyKey),
        );
      } catch (error) {
        if (error instanceof RelationPolicyConfigConflictError) {
          throw new RelationPolicyManagementConflictError(error.message, error.policyKey, error.actualVersion);
        }
        throw error;
      }
      return listCatalog();
    }
    if (!command.settings || Object.keys(command.settings).length === 0) {
      throw new RelationPolicyManagementValidationError("保存关系策略时至少提交一个可配置字段");
    }
    const unsupported = Object.keys(command.settings).filter((key) => key !== "targetDelete" && key !== "businessRequired");
    if (unsupported.length) throw new RelationPolicyManagementValidationError(`关系策略包含不可写字段：${unsupported.join("、")}`);
    const legacy = legacyLifecycleFields(current);
    if (legacy.length) {
      throw new RelationPolicyManagementValidationError(
        `旧配置仍包含已隐藏生命周期字段：${legacy.join("、")}；请先恢复代码基线`,
      );
    }
    if (current && current.baselineHash !== group.baselineHash) {
      throw new RelationPolicyManagementConflictError("现有关系策略基线已失效，请先恢复代码基线", group.policyKey);
    }
    const targetChoices = targetDeleteChoices(group);
    if (command.settings.targetDelete !== undefined) {
      if (targetChoices.length < 2 || !targetChoices.includes(command.settings.targetDelete)) {
        throw new RelationPolicyManagementValidationError(
          `关系策略 ${group.policyKey}.targetDelete 不允许设置为 ${command.settings.targetDelete}`,
        );
      }
    }
    const registration = dependencies.listRegisteredRelations()
      .find((entry) => entry.registration.key === relationKey)?.registration;
    const required = requiredSpec(group, relationKey, registration);
    const currentEffectiveRequired = configuredBusinessRequired(current, relationKey) ?? required.baseline;
    if (command.settings.businessRequired !== undefined) {
      if (required.allowed.length < 2 || !required.allowed.includes(command.settings.businessRequired)) {
        throw new RelationPolicyManagementValidationError(
          `关系策略 ${relationKey}.businessRequired 不允许设置为 ${command.settings.businessRequired}`,
        );
      }
    }
    const currentSettings = asRecord(current?.settings);
    const nextTargetDelete = command.settings.targetDelete
      ?? policyPreset(currentSettings.targetDelete)
      ?? group.baseline.targetDelete;
    const requiredMap = existingRequiredMap(current);
    if (command.settings.businessRequired !== undefined) {
      requiredMap[relationKey] = command.settings.businessRequired;
    }
    for (const key of Object.keys(requiredMap)) {
      if (!group.relationKeys.includes(key)) {
        throw new RelationPolicyManagementValidationError(`关系策略包含未知业务必填关系：${key}`);
      }
      const itemRegistration = dependencies.listRegisteredRelations()
        .find((entry) => entry.registration.key === key)?.registration;
      const itemSpec = requiredSpec(group, key, itemRegistration);
      if (requiredMap[key] === itemSpec.baseline) delete requiredMap[key];
      else if (!itemSpec.allowed.includes(requiredMap[key]!)) {
        throw new RelationPolicyManagementValidationError(`关系策略 ${key}.businessRequired 配置无效`);
      }
    }
    const settings: RelationPolicyWriteSettings = {};
    if (nextTargetDelete && nextTargetDelete !== group.baseline.targetDelete) {
      settings.targetDelete = nextTargetDelete;
    }
    if (Object.keys(requiredMap).length) settings.businessRequiredByRelation = requiredMap;
    const commitOptions = command.settings.businessRequired === "required"
      && currentEffectiveRequired !== "required"
      ? requiredPreflightOptions([relationKey], group.policyKey)
      : undefined;
    try {
      if (Object.keys(settings).length === 0) await dependencies.resetConfig(mutation, commitOptions);
      else await dependencies.writeConfig({ ...mutation, settings }, commitOptions);
    } catch (error) {
      if (error instanceof RelationPolicyConfigConflictError) {
        throw new RelationPolicyManagementConflictError(error.message, error.policyKey, error.actualVersion);
      }
      throw error;
    }
    return listCatalog();
  }

  return { listCatalog, mutate };
}

const relationPolicyManagementService = buildRelationPolicyManagementService();

export const listRelationPolicyManagementCatalog = relationPolicyManagementService.listCatalog;
export const mutateRelationPolicyManagement = relationPolicyManagementService.mutate;
