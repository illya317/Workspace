import { createHash } from "node:crypto";

import type { MutationImpactPolicy, MutationIntent } from "@workspace/platform/mutation-impact-contract";
import {
  MutationImpactConfigurationError,
  MutationImpactConfirmationError,
  MutationImpactLimitError,
  MutationImpactRequiredError,
} from "@workspace/platform/server/mutation-impact";
import { Prisma } from "@workspace/platform/server/prisma";
import { WORKSPACE_RELATION_CATALOG } from "@workspace/platform/server/relation-registrations";
import type { RelationLifecyclePolicies } from "@workspace/platform/server/relation-registry";
import { SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";

const WORK_VIRTUAL_IMPACT_POLICIES = new Map<string, MutationImpactPolicy>([
  ["work.plan.restore-provenance", "block"],
  ["work.plan.restore-stale-items", "block"],
  ["work.plan.incomplete-items", "block"],
  ["work.item.incomplete-children", "block"],
  ["work.item.incomplete-evidence", "block"],
]);

export class WorkImpactConcurrencyError extends Error {}

function lifecyclePolicyForIntent(lifecycle: RelationLifecyclePolicies, intent: MutationIntent) {
  if (intent === "delete") return lifecycle.targetDelete;
  if (intent === "archive") return lifecycle.targetArchive;
  if (intent === "restore") return lifecycle.targetRestore;
  if (intent === "reparent" || intent === "unlink") return lifecycle.sourceRelationChange;
  return null;
}

export function resolveWorkMutationImpactPolicy(
  relationKey: string,
  intent: MutationIntent,
): MutationImpactPolicy | null {
  if (intent === "transition") return WORK_VIRTUAL_IMPACT_POLICIES.get(relationKey) ?? null;
  const definitions = WORKSPACE_RELATION_CATALOG.definitions()
    .filter((definition) => definition.adapterKey === relationKey);
  if (!definitions.length) return WORK_VIRTUAL_IMPACT_POLICIES.get(relationKey) ?? null;
  const policies = new Set(definitions.map((definition) => lifecyclePolicyForIntent(definition.lifecycle, intent)));
  if (policies.size !== 1) return null;
  const policy = [...policies][0];
  return policy && policy !== "exempt_with_reason" ? policy : null;
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
