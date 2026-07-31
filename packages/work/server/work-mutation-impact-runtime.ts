import { createHash } from "node:crypto";

import type { MutationImpactPolicy, MutationIntent } from "@workspace/platform/mutation-impact-contract";
import {
  MutationImpactConfigurationError,
  MutationImpactConfirmationError,
  MutationImpactLimitError,
  MutationImpactRequiredError,
} from "@workspace/platform/server/mutation-impact";
import { Prisma } from "@workspace/platform/server/prisma";
import {
  acquireRelationPolicyMutationLocks,
  listRelationPolicyConfigs,
  type RelationPolicyConfigSnapshot,
} from "@workspace/platform/server/relation-policy-config";
import {
  applyRelationPolicyOverride,
  listRelationPolicyRuntimeGroups,
  relationPolicyRuntimeRevision,
  type RelationPolicyRuntimeGroup,
  type RelationPolicyStoredOverride,
} from "@workspace/platform/server/relation-policy-runtime";
import { WORKSPACE_RELATION_CATALOG } from "@workspace/platform/server/relation-registrations";
import type { RelationLifecyclePolicies } from "@workspace/platform/server/relation-registry";
import { SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";

export const WORK_MUTATION_IMPACT_POLICY_REVISION = "work-mutation-impact-v2";

const WORK_VIRTUAL_IMPACT_POLICIES = new Map<string, MutationImpactPolicy>([
  ["work.project.notification-governance-history", "block"],
  ["work.plan.restore-provenance", "block"],
  ["work.plan.restore-stale-items", "block"],
  ["work.plan.incomplete-items", "block"],
  ["work.item.incomplete-children", "block"],
  ["work.item.incomplete-evidence", "block"],
]);

export class WorkImpactConcurrencyError extends Error {}

type WorkMutationImpactPolicyContext = { tx: Prisma.TransactionClient };

interface WorkRelationPolicySnapshot {
  runtimeGroupByKey: ReadonlyMap<string, RelationPolicyRuntimeGroup>;
  configByKey: ReadonlyMap<string, RelationPolicyStoredOverride>;
  revision: string;
}

const relationPolicySnapshots = new WeakMap<object, Promise<WorkRelationPolicySnapshot>>();

function storedOverride(config: RelationPolicyConfigSnapshot): RelationPolicyStoredOverride {
  return {
    policyKey: config.policyKey,
    settings: config.settings as RelationPolicyStoredOverride["settings"],
    baselineHash: config.baselineHash,
    version: config.version,
  };
}

function runtimeConfigurationError(message: string) {
  return new MutationImpactConfigurationError(`Work 关系策略配置无效：${message}`);
}

function hasStoredOverride(stored: RelationPolicyStoredOverride | undefined) {
  return Boolean(stored && Object.keys(stored.settings).length > 0);
}

async function loadWorkRelationPolicySnapshot(
  context: WorkMutationImpactPolicyContext,
): Promise<WorkRelationPolicySnapshot> {
  const existing = relationPolicySnapshots.get(context);
  if (existing) return existing;
  const pending = (async () => {
    let runtimeGroups: RelationPolicyRuntimeGroup[];
    try {
      runtimeGroups = listRelationPolicyRuntimeGroups()
        .filter((group) => group.moduleKey === "work");
    } catch (error) {
      throw runtimeConfigurationError(error instanceof Error ? error.message : "代码基线不可用");
    }
    await acquireRelationPolicyMutationLocks(
      context.tx,
      runtimeGroups
        .filter((group) => group.configurableTargetDelete.length > 1)
        .map((group) => group.policyKey),
    );
    const configs = (await listRelationPolicyConfigs(context.tx)).map(storedOverride);
    return {
      runtimeGroupByKey: new Map(runtimeGroups.map((group) => [group.policyKey, group])),
      configByKey: new Map(configs.map((config) => [config.policyKey, config])),
      revision: relationPolicyRuntimeRevision(runtimeGroups, configs),
    };
  })();
  relationPolicySnapshots.set(context, pending);
  return pending;
}

function lifecyclePolicyForIntent(lifecycle: RelationLifecyclePolicies, intent: MutationIntent) {
  if (intent === "delete") return lifecycle.targetDelete;
  if (intent === "archive") return lifecycle.targetArchive;
  if (intent === "restore") return lifecycle.targetRestore;
  if (intent === "reparent" || intent === "unlink") return lifecycle.sourceRelationChange;
  return null;
}

export async function resolveWorkMutationImpactPolicy(
  context: WorkMutationImpactPolicyContext,
  relationKey: string,
  intent: MutationIntent,
): Promise<MutationImpactPolicy | null> {
  if (intent === "transition") return WORK_VIRTUAL_IMPACT_POLICIES.get(relationKey) ?? null;
  const snapshot = await loadWorkRelationPolicySnapshot(context);
  const runtimeGroup = snapshot.runtimeGroupByKey.get(relationKey);
  const stored = snapshot.configByKey.get(relationKey);
  if (!runtimeGroup && hasStoredOverride(stored)) {
    throw runtimeConfigurationError(
      `${relationKey} 已退出可配置运行时，但仍有历史覆盖；请在 Settings 中恢复系统预设`,
    );
  }
  const definitions = WORKSPACE_RELATION_CATALOG.definitions()
    .filter((definition) => definition.adapterKey === relationKey);
  if (!definitions.length) return WORK_VIRTUAL_IMPACT_POLICIES.get(relationKey) ?? null;
  if (runtimeGroup) {
    // resetRelationPolicyConfig deliberately keeps an empty, audited row. An
    // empty tombstone has no runtime meaning even if its historical hash is old.
    const applied = applyRelationPolicyOverride(runtimeGroup, hasStoredOverride(stored) ? stored : null);
    if (applied.stale) {
      throw runtimeConfigurationError(`${relationKey} ${applied.error ?? "覆盖已失效"}`);
    }
    const policy = lifecyclePolicyForIntent(applied.lifecycle, intent);
    return policy !== "exempt_with_reason" ? policy : null;
  }
  const policies = new Set(definitions.map((definition) => lifecyclePolicyForIntent(definition.lifecycle, intent)));
  if (policies.size !== 1) return null;
  const policy = [...policies][0];
  return policy && policy !== "exempt_with_reason" ? policy : null;
}

export async function getWorkMutationImpactPolicyRevision(
  context: WorkMutationImpactPolicyContext,
) {
  const snapshot = await loadWorkRelationPolicySnapshot(context);
  return `${WORK_MUTATION_IMPACT_POLICY_REVISION}:${snapshot.revision}`;
}

export function workPlanRevision(plan: { updatedAt: Date }) {
  return plan.updatedAt.toISOString();
}

export function workItemRevision(item: {
  updatedAt: Date;
  status: string | null;
  isArchived: boolean;
  planId: number | null;
  parentWorkItemId: number | null;
}) {
  return createHash("sha256").update(JSON.stringify({
    updatedAt: item.updatedAt.toISOString(),
    status: item.status,
    isArchived: item.isArchived,
    planId: item.planId,
    parentWorkItemId: item.parentWorkItemId,
  })).digest("hex");
}

export function mutationImpactServiceError(error: unknown) {
  if (error instanceof WorkImpactConcurrencyError
    || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")) {
    return { ok: false as const, error: "影响对象已被其他人修改，请刷新后重试", status: 409 };
  }
  if (error instanceof SerializableTransactionConflictError) {
    return { ok: false as const, error: error.message, status: 409 };
  }
  if (error instanceof MutationImpactRequiredError || error instanceof MutationImpactConfirmationError) {
    return {
      ok: false as const,
      error: error.message,
      status: 409,
      details: { code: error.code, impact: error.impact },
    };
  }
  if (error instanceof MutationImpactLimitError || error instanceof MutationImpactConfigurationError) {
    return { ok: false as const, error: error.message, status: 409, details: { code: error.code } };
  }
  return null;
}

export function workMutationRoot(input: {
  plan: { id: number; title: string; updatedAt: Date };
  intent: MutationIntent;
}) {
  return {
    entity: "WorkPlan",
    id: String(input.plan.id),
    label: input.plan.title,
    intent: input.intent,
    expectedVersion: workPlanRevision(input.plan),
  };
}

export function workItemMutationRoot(input: {
  item: {
    id: number;
    content: string;
    updatedAt: Date;
    status: string | null;
    isArchived: boolean;
    planId: number | null;
    parentWorkItemId: number | null;
  };
  intent?: "archive" | "restore" | "delete" | "transition";
}) {
  return {
    entity: "WorkItem",
    id: String(input.item.id),
    label: input.item.content,
    intent: input.intent ?? "transition",
    expectedVersion: workItemRevision(input.item),
  };
}

export function projectMutationRoot(input: {
  project: { id: number; name: string; version: number };
  intent: "archive" | "restore" | "delete";
}) {
  return {
    entity: "Project",
    id: String(input.project.id),
    label: input.project.name,
    intent: input.intent,
    expectedVersion: input.project.version,
  };
}
