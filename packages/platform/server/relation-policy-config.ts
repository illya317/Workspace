import "server-only";

import { Prisma, prisma } from "./prisma";
import type {
  RelationLifecyclePolicies,
  RelationPolicyPreset,
} from "./relation-registry";
import type { BusinessRequiredPolicy } from "../relation-registration-contract";

export const RELATION_POLICY_PRESETS = [
  "block",
  "confirm_unlink",
  "confirm_cascade",
  "confirm_unlink_or_cascade",
  "auto_cascade_owned",
  "retain",
  "exempt_with_reason",
] as const satisfies readonly RelationPolicyPreset[];

export const RELATION_POLICY_LIFECYCLE_KEYS = [
  "targetDelete",
  "targetArchive",
  "targetRestore",
  "sourceRelationChange",
] as const satisfies readonly (keyof RelationLifecyclePolicies)[];

export type RelationPolicyBusinessRequiredOverride = Record<string, BusinessRequiredPolicy>;
export type RelationPolicyStoredSettings = Partial<Record<keyof RelationLifecyclePolicies, RelationPolicyPreset>> & {
  businessRequiredByRelation?: RelationPolicyBusinessRequiredOverride;
};
export type RelationPolicyWriteSettings = { targetDelete?: RelationPolicyPreset } & {
  businessRequiredByRelation?: RelationPolicyBusinessRequiredOverride;
};
/** Compatibility alias for callers that inspect persisted legacy lifecycle settings. */
export type RelationPolicySettingsOverride = RelationPolicyStoredSettings;
export type RelationPolicyChangeKind = "upsert" | "reset";

export interface RelationPolicyConfigSnapshot {
  policyKey: string;
  settings: RelationPolicyStoredSettings;
  baselineHash: string;
  version: number;
  updatedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RelationPolicyConfigRow {
  policyKey: string;
  settingsJson: unknown;
  baselineHash: string;
  version: number;
  updatedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RelationPolicyConfigCreateData {
  policyKey: string;
  settingsJson: RelationPolicyStoredSettings;
  baselineHash: string;
  version: number;
  updatedByUserId: number;
}

interface RelationPolicyConfigUpdateData {
  settingsJson: RelationPolicyStoredSettings;
  baselineHash: string;
  version: { increment: 1 };
  updatedByUserId: number;
}

interface RelationPolicyRevisionCreateData {
  policyKey: string;
  version: number;
  changeKind: RelationPolicyChangeKind;
  reason: string;
  settingsJson: RelationPolicyStoredSettings;
  baselineHash: string;
  actorUserId: number;
}

export interface RelationPolicyReadStore {
  relationPolicyConfig: {
    findUnique(input: { where: { policyKey: string } }): Promise<RelationPolicyConfigRow | null>;
    findMany(input: { orderBy: { policyKey: "asc" } }): Promise<RelationPolicyConfigRow[]>;
  };
}

export interface RelationPolicyTransactionStore extends RelationPolicyReadStore {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  relationPolicyConfig: RelationPolicyReadStore["relationPolicyConfig"] & {
    create(input: { data: RelationPolicyConfigCreateData }): Promise<RelationPolicyConfigRow>;
    updateMany(input: {
      where: { policyKey: string; version: number };
      data: RelationPolicyConfigUpdateData;
    }): Promise<{ count: number }>;
  };
  relationPolicyRevision: {
    create(input: { data: RelationPolicyRevisionCreateData }): Promise<unknown>;
  };
}

export interface RelationPolicyWriteStore extends RelationPolicyReadStore {
  $transaction<T>(action: (transaction: RelationPolicyTransactionStore) => Promise<T>): Promise<T>;
}

export type RelationPolicyReadClient = RelationPolicyReadStore | Prisma.TransactionClient | typeof prisma;
export type RelationPolicyWriteClient = RelationPolicyWriteStore | typeof prisma;

export interface RelationPolicyMutationContext {
  transaction: RelationPolicyTransactionStore;
  current: RelationPolicyConfigSnapshot | null;
}

export interface RelationPolicyMutationOptions {
  beforePersist?: (context: RelationPolicyMutationContext) => Promise<void>;
}

export class RelationPolicyConfigValidationError extends Error {
  readonly code = "RELATION_POLICY_CONFIG_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "RelationPolicyConfigValidationError";
  }
}

export class RelationPolicyConfigConflictError extends Error {
  readonly code = "RELATION_POLICY_CONFIG_VERSION_CONFLICT";

  constructor(
    readonly policyKey: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`关系策略 ${policyKey} 版本冲突：期望 ${expectedVersion}，当前 ${actualVersion}`);
    this.name = "RelationPolicyConfigConflictError";
  }
}

const POLICY_PRESET_SET = new Set<string>(RELATION_POLICY_PRESETS);
const LIFECYCLE_KEY_SET = new Set<string>(RELATION_POLICY_LIFECYCLE_KEYS);
const BUSINESS_REQUIRED_POLICY_SET = new Set<string>(["required", "optional"] satisfies BusinessRequiredPolicy[]);
const BUSINESS_REQUIRED_KEY = "businessRequiredByRelation";

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validationError(message: string): never {
  throw new RelationPolicyConfigValidationError(message);
}

function normalizePolicyKey(value: unknown) {
  if (typeof value !== "string") return validationError("关系策略键无效");
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) {
    return validationError("关系策略键无效");
  }
  return normalized;
}

const RELATION_POLICY_LOCK_NAMESPACE = "workspace-relation-policy-v1";

export function relationPolicyAdvisoryLockKey(policyKey: string) {
  return `${RELATION_POLICY_LOCK_NAMESPACE}:${normalizePolicyKey(policyKey)}`;
}

/**
 * Serializes policy mutation and every domain write that consumes that policy.
 * Multiple locks are always acquired in lexical order to prevent lock-order cycles.
 */
export async function acquireRelationPolicyMutationLocks(
  client: Pick<RelationPolicyTransactionStore, "$queryRaw">,
  policyKeys: readonly string[],
) {
  const lockKeys = [...new Set(policyKeys.map(relationPolicyAdvisoryLockKey))].sort();
  for (const lockKey of lockKeys) {
    await client.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS lock_result`,
    );
  }
}

function normalizeRelationKey(value: unknown) {
  if (typeof value !== "string") return validationError("关系键无效");
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) return validationError("关系键无效");
  return normalized;
}

function normalizeBaselineHash(value: unknown) {
  if (typeof value !== "string") return validationError("关系策略基线摘要无效");
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) return validationError("关系策略基线摘要无效");
  return normalized;
}

function normalizeExpectedVersion(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0) return validationError("关系策略期望版本无效");
  return Number(value);
}

function normalizeActorUserId(value: unknown) {
  if (!Number.isInteger(value) || Number(value) <= 0) return validationError("关系策略操作人无效");
  return Number(value);
}

function normalizeStoredActorUserId(value: unknown) {
  return value === null ? null : normalizeActorUserId(value);
}

function normalizeStoredVersion(value: unknown) {
  if (!Number.isInteger(value) || Number(value) <= 0) return validationError("关系策略存储版本无效");
  return Number(value);
}

function normalizeReason(value: unknown) {
  if (typeof value !== "string") return validationError("请填写关系策略修改理由");
  const normalized = value.trim();
  if (!normalized) return validationError("请填写关系策略修改理由");
  if (normalized.length > 500) return validationError("关系策略修改理由不能超过 500 个字符");
  return normalized;
}

function normalizeStoredDate(value: unknown, field: string) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return validationError(`关系策略 ${field} 无效`);
  }
  return value;
}

function normalizeBusinessRequiredByRelation(value: unknown) {
  if (!isRecord(value)) return validationError("业务必填配置必须是 relationKey 到策略的对象");
  const normalized: RelationPolicyBusinessRequiredOverride = {};
  for (const [rawRelationKey, rawPolicy] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const relationKey = normalizeRelationKey(rawRelationKey);
    if (typeof rawPolicy !== "string" || !BUSINESS_REQUIRED_POLICY_SET.has(rawPolicy)) {
      return validationError(`关系 ${relationKey} 的业务必填策略无效`);
    }
    normalized[relationKey] = rawPolicy as BusinessRequiredPolicy;
  }
  return normalized;
}

export function normalizeStoredRelationPolicySettings(value: unknown): RelationPolicyStoredSettings {
  if (!isRecord(value)) return validationError("关系策略配置必须是对象");
  const unknownKey = Object.keys(value).find((key) => key !== BUSINESS_REQUIRED_KEY && !LIFECYCLE_KEY_SET.has(key));
  if (unknownKey) return validationError(`关系策略配置包含未知字段：${unknownKey}`);

  const normalized: RelationPolicyStoredSettings = {};
  for (const key of RELATION_POLICY_LIFECYCLE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const policy = value[key];
    if (typeof policy !== "string" || !POLICY_PRESET_SET.has(policy)) {
      return validationError(`关系策略 ${key} 无效`);
    }
    normalized[key] = policy as RelationPolicyPreset;
  }
  if (Object.prototype.hasOwnProperty.call(value, BUSINESS_REQUIRED_KEY)) {
    const required = normalizeBusinessRequiredByRelation(value[BUSINESS_REQUIRED_KEY]);
    if (Object.keys(required).length) normalized.businessRequiredByRelation = required;
  }
  return normalized;
}

/** Normalizes new Settings writes. Legacy lifecycle fields remain readable but cannot be newly persisted. */
export function normalizeRelationPolicySettings(value: unknown): RelationPolicyWriteSettings {
  if (!isRecord(value)) return validationError("关系策略配置必须是对象");
  const unknownKey = Object.keys(value).find((key) => key !== "targetDelete" && key !== BUSINESS_REQUIRED_KEY);
  if (unknownKey) return validationError(`关系策略新写配置包含未知字段：${unknownKey}`);
  const normalized: RelationPolicyWriteSettings = {};
  if (Object.prototype.hasOwnProperty.call(value, "targetDelete")) {
    const policy = value.targetDelete;
    if (typeof policy !== "string" || !POLICY_PRESET_SET.has(policy)) {
      return validationError("关系策略 targetDelete 无效");
    }
    normalized.targetDelete = policy as RelationPolicyPreset;
  }
  if (Object.prototype.hasOwnProperty.call(value, BUSINESS_REQUIRED_KEY)) {
    const required = normalizeBusinessRequiredByRelation(value[BUSINESS_REQUIRED_KEY]);
    if (Object.keys(required).length) normalized.businessRequiredByRelation = required;
  }
  return normalized;
}

function toSnapshot(row: RelationPolicyConfigRow): RelationPolicyConfigSnapshot {
  return {
    policyKey: normalizePolicyKey(row.policyKey),
    settings: normalizeStoredRelationPolicySettings(row.settingsJson),
    baselineHash: normalizeBaselineHash(row.baselineHash),
    version: normalizeStoredVersion(row.version),
    updatedByUserId: normalizeStoredActorUserId(row.updatedByUserId),
    createdAt: normalizeStoredDate(row.createdAt, "createdAt"),
    updatedAt: normalizeStoredDate(row.updatedAt, "updatedAt"),
  };
}

function readStore(client: RelationPolicyReadClient): RelationPolicyReadStore {
  return client as unknown as RelationPolicyReadStore;
}

function writeStore(client: RelationPolicyWriteClient): RelationPolicyWriteStore {
  return client as unknown as RelationPolicyWriteStore;
}

export async function readRelationPolicyConfig(
  policyKey: string,
  client: RelationPolicyReadClient = prisma,
): Promise<RelationPolicyConfigSnapshot | null> {
  const normalizedPolicyKey = normalizePolicyKey(policyKey);
  const row = await readStore(client).relationPolicyConfig.findUnique({
    where: { policyKey: normalizedPolicyKey },
  });
  return row ? toSnapshot(row) : null;
}

export async function listRelationPolicyConfigs(
  client: RelationPolicyReadClient = prisma,
): Promise<RelationPolicyConfigSnapshot[]> {
  const rows = await readStore(client).relationPolicyConfig.findMany({
    orderBy: { policyKey: "asc" },
  });
  return rows.map(toSnapshot);
}

export interface WriteRelationPolicyConfigInput {
  policyKey: string;
  settings: RelationPolicyWriteSettings;
  baselineHash: string;
  expectedVersion: number;
  actorUserId: number;
  reason: string;
}

export interface ResetRelationPolicyConfigInput {
  policyKey: string;
  baselineHash: string;
  expectedVersion: number;
  actorUserId: number;
  reason: string;
}

interface NormalizedMutationInput {
  policyKey: string;
  settings: RelationPolicyWriteSettings;
  baselineHash: string;
  expectedVersion: number;
  actorUserId: number;
  reason: string;
}

function normalizeMutationInput(
  input: WriteRelationPolicyConfigInput | ResetRelationPolicyConfigInput,
  settings: unknown,
): NormalizedMutationInput {
  return {
    policyKey: normalizePolicyKey(input.policyKey),
    settings: normalizeRelationPolicySettings(settings),
    baselineHash: normalizeBaselineHash(input.baselineHash),
    expectedVersion: normalizeExpectedVersion(input.expectedVersion),
    actorUserId: normalizeActorUserId(input.actorUserId),
    reason: normalizeReason(input.reason),
  };
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

async function currentVersion(policyKey: string, client: RelationPolicyReadClient) {
  const current = await readStore(client).relationPolicyConfig.findUnique({ where: { policyKey } });
  return current ? normalizeStoredVersion(current.version) : 0;
}

async function mutateRelationPolicyConfig(
  input: NormalizedMutationInput,
  changeKind: RelationPolicyChangeKind,
  client: RelationPolicyWriteClient,
  options: RelationPolicyMutationOptions = {},
) {
  try {
    return await writeStore(client).$transaction(async (transaction) => {
      await acquireRelationPolicyMutationLocks(transaction, [input.policyKey]);
      const current = await transaction.relationPolicyConfig.findUnique({
        where: { policyKey: input.policyKey },
      });
      const actualVersion = current ? normalizeStoredVersion(current.version) : 0;
      if (actualVersion !== input.expectedVersion) {
        throw new RelationPolicyConfigConflictError(input.policyKey, input.expectedVersion, actualVersion);
      }
      await options.beforePersist?.({
        transaction,
        current: current ? toSnapshot(current) : null,
      });

      let nextRow: RelationPolicyConfigRow;
      if (!current) {
        nextRow = await transaction.relationPolicyConfig.create({
          data: {
            policyKey: input.policyKey,
            settingsJson: input.settings,
            baselineHash: input.baselineHash,
            version: 1,
            updatedByUserId: input.actorUserId,
          },
        });
      } else {
        const updated = await transaction.relationPolicyConfig.updateMany({
          where: { policyKey: input.policyKey, version: input.expectedVersion },
          data: {
            settingsJson: input.settings,
            baselineHash: input.baselineHash,
            version: { increment: 1 },
            updatedByUserId: input.actorUserId,
          },
        });
        if (updated.count !== 1) {
          const concurrentVersion = await currentVersion(input.policyKey, transaction);
          throw new RelationPolicyConfigConflictError(
            input.policyKey,
            input.expectedVersion,
            concurrentVersion,
          );
        }
        const updatedRow = await transaction.relationPolicyConfig.findUnique({
          where: { policyKey: input.policyKey },
        });
        if (!updatedRow) throw new Error(`关系策略 ${input.policyKey} 更新后不存在`);
        nextRow = updatedRow;
      }

      const snapshot = toSnapshot(nextRow);
      await transaction.relationPolicyRevision.create({
        data: {
          policyKey: snapshot.policyKey,
          version: snapshot.version,
          changeKind,
          reason: input.reason,
          settingsJson: snapshot.settings,
          baselineHash: snapshot.baselineHash,
          actorUserId: input.actorUserId,
        },
      });
      return snapshot;
    });
  } catch (error) {
    if (error instanceof RelationPolicyConfigConflictError) throw error;
    if (isUniqueConstraintError(error)) {
      throw new RelationPolicyConfigConflictError(
        input.policyKey,
        input.expectedVersion,
        await currentVersion(input.policyKey, client),
      );
    }
    throw error;
  }
}

export async function writeRelationPolicyConfig(
  input: WriteRelationPolicyConfigInput,
  client: RelationPolicyWriteClient = prisma,
  options: RelationPolicyMutationOptions = {},
) {
  const normalized = normalizeMutationInput(input, input.settings);
  if (Object.keys(normalized.settings).length === 0) {
    return validationError("关系策略写入至少需要一个覆盖字段；恢复基线请使用 resetRelationPolicyConfig");
  }
  return mutateRelationPolicyConfig(normalized, "upsert", client, options);
}

export async function resetRelationPolicyConfig(
  input: ResetRelationPolicyConfigInput,
  client: RelationPolicyWriteClient = prisma,
  options: RelationPolicyMutationOptions = {},
) {
  return mutateRelationPolicyConfig(normalizeMutationInput(input, {}), "reset", client, options);
}
