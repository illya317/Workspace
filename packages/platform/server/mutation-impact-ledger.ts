import { prisma, type Prisma } from "./prisma";
import type {
  MutationImpactAttemptAuditInput,
  MutationImpactAuditEffect,
  MutationImpactAuditInput,
} from "./mutation-impact";

const ROOT_RELATION_KEY = "$root";
const ROOT_POLICY_KEY = "root_intent";

export type MutationImpactLedgerSummaryValue = string | number | boolean | null;

export interface MutationImpactLedgerAfterState {
  revision?: string | number | null;
  /** Caller-owned allowlist of non-sensitive scalar fields. */
  summary?: Readonly<Record<string, MutationImpactLedgerSummaryValue>> | null;
}

export interface RecordMutationImpactLedgerInput<TContext> {
  /** Must be the same caller-owned transaction used by engine.execute(). */
  transaction: Prisma.TransactionClient;
  audit: MutationImpactAuditInput<TContext>;
  actorUserId?: number | null;
  actorLabel?: string | null;
  requestId?: string | null;
  /** Restore-only pointer to the successful archive batch being reversed. */
  sourceBatchId?: string | null;
  /** Must read through the same transaction and return only explicitly allowlisted state. */
  resolveAfterState(
    entity: string,
    id: string,
  ): Promise<MutationImpactLedgerAfterState | null> | MutationImpactLedgerAfterState | null;
}

export interface RecordMutationImpactAttemptInput<TContext> {
  audit: MutationImpactAttemptAuditInput<TContext>;
  database?: Pick<Prisma.TransactionClient, "mutationImpactBatch">;
  actorUserId?: number | null;
  actorLabel?: string | null;
  requestId?: string | null;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function revisionText(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Mutation impact ledger revision 必须是有限数字或字符串");
  }
  return String(value);
}

function serializeSummary(
  summary: Readonly<Record<string, MutationImpactLedgerSummaryValue>> | null | undefined,
) {
  if (summary === null || summary === undefined) return null;
  const prototype = typeof summary === "object" ? Object.getPrototypeOf(summary) : null;
  if (
    Array.isArray(summary)
    || typeof summary !== "object"
    || (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new Error("Mutation impact ledger summary 必须是白名单标量字段对象");
  }
  const entries = Object.entries(summary).sort(([left], [right]) => compareText(left, right));
  for (const [key, value] of entries) {
    const scalar = value === null || ["string", "number", "boolean"].includes(typeof value);
    if (!key.trim() || !scalar || (typeof value === "number" && !Number.isFinite(value))) {
      throw new Error("Mutation impact ledger summary 只允许命名的有限标量字段");
    }
  }
  return JSON.stringify(Object.fromEntries(entries));
}

function scopeParts(scopeKey: string) {
  const separator = scopeKey.indexOf(":");
  if (separator < 0) return { scopeType: nullableText(scopeKey), scopeId: null };
  return {
    scopeType: nullableText(scopeKey.slice(0, separator)),
    scopeId: nullableText(scopeKey.slice(separator + 1)),
  };
}

function relationPolicies<TContext>(audit: MutationImpactAuditInput<TContext>) {
  const groups = [
    ...audit.plan.blockers,
    ...audit.plan.confirmableEffects,
    ...audit.plan.informationalEffects,
  ];
  const policies = new Map<string, string>();
  for (const group of groups) {
    const existing = policies.get(group.relationKey);
    if (existing && existing !== group.policy) {
      throw new Error(`Mutation impact relation ${group.relationKey} 的 policy 不一致`);
    }
    policies.set(group.relationKey, group.policy);
  }
  return policies;
}

function compareEffects(left: MutationImpactAuditEffect, right: MutationImpactAuditEffect) {
  const depthOrder = left.depth - right.depth;
  if (depthOrder) return depthOrder;
  const leftKey = [left.relationPath.join("\u0000"), left.relationKey, left.entity, left.id, left.resolution].join("\u0001");
  const rightKey = [right.relationPath.join("\u0000"), right.relationKey, right.entity, right.id, right.resolution].join("\u0001");
  return compareText(leftKey, rightKey);
}

function relatedOperation<TContext>(
  audit: MutationImpactAuditInput<TContext>,
  effect: MutationImpactAuditEffect,
) {
  if (effect.resolution === "unlink") return "unlink";
  if (effect.resolution === "transition_related") return "transition";
  return audit.root.intent;
}

function resolutionsJson<TContext>(audit: MutationImpactAuditInput<TContext>) {
  return JSON.stringify(
    [...audit.selectedResolutions]
      .sort((left, right) => compareText(
        `${left.relationKey}\u0000${left.resolution}`,
        `${right.relationKey}\u0000${right.resolution}`,
      ))
      .map(({ relationKey, resolution }) => ({ relationKey, resolution })),
  );
}

export async function recordMutationImpactLedger<TContext>(
  input: RecordMutationImpactLedgerInput<TContext>,
) {
  const { audit } = input;
  if (nullableText(input.sourceBatchId) && audit.root.intent !== "restore") {
    throw new Error("Mutation impact sourceBatchId 只能用于 restore provenance");
  }
  const policies = relationPolicies(audit);
  const relatedEffects = [...audit.executedEffects].sort(compareEffects);
  const afterStateCache = new Map<string, Promise<MutationImpactLedgerAfterState | null>>();
  const afterState = (entity: string, id: string) => {
    const key = `${entity}\u0000${id}`;
    const cached = afterStateCache.get(key);
    if (cached) return cached;
    const resolved = Promise.resolve(input.resolveAfterState(entity, id));
    afterStateCache.set(key, resolved);
    return resolved;
  };

  const effectRows = [];
  const rootAfter = await afterState(audit.root.entity, audit.root.id);
  effectRows.push({
    sequence: 0,
    relationKey: ROOT_RELATION_KEY,
    relationPathJson: "[]",
    policyKey: ROOT_POLICY_KEY,
    entityType: audit.root.entity,
    entityId: audit.root.id,
    operation: audit.root.intent,
    beforeRevision: revisionText(audit.root.expectedVersion),
    afterRevision: revisionText(rootAfter?.revision),
    beforeSummaryJson: null,
    afterSummaryJson: serializeSummary(rootAfter?.summary),
    changedInBatch: true,
  });

  for (const [index, effect] of relatedEffects.entries()) {
    const policyKey = policies.get(effect.relationKey);
    if (!policyKey) {
      throw new Error(`Mutation impact relation ${effect.relationKey} 缺少 plan policy`);
    }
    const resolved = await afterState(effect.entity, effect.id);
    effectRows.push({
      sequence: index + 1,
      relationKey: effect.relationKey,
      relationPathJson: JSON.stringify(effect.relationPath),
      policyKey,
      entityType: effect.entity,
      entityId: effect.id,
      operation: relatedOperation(audit, effect),
      beforeRevision: revisionText(effect.beforeRevision),
      afterRevision: revisionText(resolved?.revision),
      beforeSummaryJson: null,
      afterSummaryJson: serializeSummary(resolved?.summary),
      changedInBatch: true,
    });
  }

  const committedAt = new Date();
  const scope = scopeParts(audit.scopeKey);
  return input.transaction.mutationImpactBatch.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      actorLabel: nullableText(input.actorLabel),
      ...scope,
      requestId: nullableText(input.requestId),
      rootEntityType: audit.root.entity,
      rootEntityId: audit.root.id,
      intent: audit.root.intent,
      policyRevision: audit.plan.policyRevision,
      impactFingerprint: audit.plan.fingerprint,
      resolutionsJson: resolutionsJson(audit),
      status: "succeeded",
      sourceBatchId: nullableText(input.sourceBatchId),
      startedAt: committedAt,
      finishedAt: committedAt,
      effects: { create: effectRows },
    },
    select: { id: true },
  });
}

/** Non-success attempts intentionally use a separate transaction so the fact survives business rollback. */
export async function recordMutationImpactAttempt<TContext>(
  input: RecordMutationImpactAttemptInput<TContext>,
) {
  const { audit } = input;
  const finishedAt = new Date();
  const scope = scopeParts(audit.scopeKey);
  return (input.database ?? prisma).mutationImpactBatch.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      actorLabel: nullableText(input.actorLabel),
      ...scope,
      requestId: nullableText(input.requestId),
      rootEntityType: audit.root.entity,
      rootEntityId: audit.root.id,
      intent: audit.root.intent,
      policyRevision: audit.plan?.policyRevision ?? "unavailable",
      impactFingerprint: audit.plan?.fingerprint ?? "unavailable",
      resolutionsJson: "[]",
      status: audit.status === "stale_confirmation" ? "stale_confirmation" : "failed",
      resultCode: audit.resultCode,
      resultMessage: audit.resultMessage.slice(0, 1_000),
      startedAt: finishedAt,
      finishedAt,
    },
    select: { id: true },
  });
}
