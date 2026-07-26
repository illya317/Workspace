import type { ImpactResolutionInput } from "@workspace/platform/mutation-impact-contract";
import {
  createHmacMutationImpactTokenCodec,
  createMutationImpactEngine,
  type MutationImpactAdapter,
  type MutationImpactEngine,
  type MutationImpactRecord,
} from "@workspace/platform/server/mutation-impact";
import {
  recordMutationImpactAttempt,
  recordMutationImpactLedger,
} from "@workspace/platform/server/mutation-impact-ledger";
import { Prisma } from "@workspace/platform/server/prisma";
import { validateWorkPlanItemCascade } from "./domain/work-mutation-impact-validation";
import { workKpiMutationImpactAdapters } from "./work-kpi-mutation-impact-adapters";
import {
  resolveWorkMutationImpactPolicy,
  WorkImpactConcurrencyError,
  workItemRevision,
} from "./work-mutation-impact-runtime";
import { workPilotInboundImpactAdapters } from "./work-pilot-inbound-impact-adapters";
import { projectMutationImpactAdapters } from "./work-project-mutation-impact-adapters";
import { projectMembershipHistoryImpactAdapters } from "./project-membership-mutation-impact-adapters";

export const WORK_MUTATION_IMPACT_POLICY_REVISION = "work-mutation-impact-v1";
export const WORK_PLAN_ITEMS_RELATION = "work.plan.items";

type ArchiveSource = {
  batchId: string;
  itemRevisions: ReadonlyMap<number, string | null>;
};

export type WorkMutationImpactContext = {
  tx: Prisma.TransactionClient;
  actorUserId: number | null;
  scopeType: string;
  scopeId: string;
  requestId?: string;
  archiveSource?: ArchiveSource;
  pendingEvidenceTaskIds?: readonly number[];
};

export type WorkImpactResolution = ImpactResolutionInput;

export function buildWorkMutationImpactEngine(input: {
  secret: string;
  audit?: Parameters<typeof createMutationImpactEngine<WorkMutationImpactContext>>[0]["audit"];
  auditAttempt?: Parameters<typeof createMutationImpactEngine<WorkMutationImpactContext>>[0]["auditAttempt"];
}): MutationImpactEngine<WorkMutationImpactContext> {
  return createMutationImpactEngine({
    adapters: workMutationImpactAdapters(),
    resolvePolicy: ({ relationKey, intent }) => resolveWorkMutationImpactPolicy(relationKey, intent),
    tokenCodec: createHmacMutationImpactTokenCodec(input.secret),
    getPolicyRevision: () => WORK_MUTATION_IMPACT_POLICY_REVISION,
    audit: input.audit,
    auditAttempt: input.auditAttempt,
  });
}

export function buildAuditedWorkMutationImpactEngine(context: WorkMutationImpactContext) {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for Work mutation impact confirmations");
  return buildWorkMutationImpactEngine({
    secret,
    auditAttempt: async (audit) => {
      await recordMutationImpactAttempt({
        audit,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
      });
    },
    audit: async (audit) => {
      await recordMutationImpactLedger({
        transaction: context.tx,
        audit,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        sourceBatchId: audit.root.intent === "restore" ? context.archiveSource?.batchId : undefined,
        resolveAfterState: (entity, entityId) => resolveWorkMutationImpactAfterState(context, entity, entityId),
      });
    },
  });
}

export async function resolveWorkPlanArchiveSource(
  tx: Prisma.TransactionClient,
  planId: number,
): Promise<ArchiveSource | undefined> {
  const batch = await tx.mutationImpactBatch.findFirst({
    where: {
      rootEntityType: "WorkPlan",
      rootEntityId: String(planId),
      intent: "archive",
      status: "succeeded",
    },
    orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
    select: {
      id: true,
      effects: {
        where: { relationKey: WORK_PLAN_ITEMS_RELATION, changedInBatch: true },
        select: { entityId: true, afterRevision: true },
      },
    },
  });
  if (!batch) return undefined;
  return {
    batchId: batch.id,
    itemRevisions: new Map(batch.effects.map((effect) => [Number(effect.entityId), effect.afterRevision])),
  };
}

export async function resolveWorkMutationImpactAfterState(
  context: WorkMutationImpactContext,
  entity: string,
  id: string,
) {
  const entityId = Number(id);
  if (!Number.isInteger(entityId) || entityId <= 0) return null;
  if (entity === "WorkPlan") {
    const plan = await context.tx.workPlan.findUnique({
      where: { id: entityId },
      select: { updatedAt: true, status: true, isArchived: true },
    });
    return plan ? {
      revision: plan.updatedAt.toISOString(),
      summary: { status: plan.status, isArchived: plan.isArchived },
    } : null;
  }
  if (entity === "WorkItem") {
    const item = await context.tx.workItem.findUnique({
      where: { id: entityId },
      select: {
        updatedAt: true, status: true, isArchived: true,
        planId: true, parentWorkItemId: true,
      },
    });
    return item ? {
      revision: workItemRevision(item),
      summary: { status: item.status, isArchived: item.isArchived },
    } : null;
  }
  if (entity === "Project") {
    const project = await context.tx.project.findUnique({
      where: { id: entityId },
      select: { version: true, status: true, isArchived: true },
    });
    return project ? {
      revision: project.version,
      summary: { status: project.status, isArchived: project.isArchived },
    } : null;
  }
  return null;
}

function workItemRecord(item: {
  id: number;
  content: string;
  updatedAt: Date;
  status: string | null;
  isArchived: boolean;
  planId: number | null;
  parentWorkItemId: number | null;
}): MutationImpactRecord {
  return {
    entity: "WorkItem",
    id: String(item.id),
    label: item.content,
    expectedVersion: workItemRevision(item),
    payload: { updatedAt: item.updatedAt, planId: item.planId, isArchived: item.isArchived },
  };
}

function planItemsAdapter(): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: WORK_PLAN_ITEMS_RELATION,
    sourceEntity: "WorkPlan",
    intents: ["archive", "delete", "restore"],
    async inspect({ context, current }) {
      const planId = Number(current.id);
      const sourceIds = current.intent === "restore"
        ? [...(context.archiveSource?.itemRevisions.keys() ?? [])]
        : undefined;
      if (current.intent === "restore" && !sourceIds?.length) return null;
      const rows = await context.tx.workItem.findMany({
        where: {
          planId,
          ...(current.intent === "archive" ? { isArchived: false } : {}),
          ...(current.intent === "restore" ? { id: { in: sourceIds }, isArchived: true } : {}),
        },
        select: {
          id: true, content: true, updatedAt: true, status: true,
          isArchived: true, planId: true, parentWorkItemId: true,
        },
        orderBy: { id: "asc" },
      });
      const matchedRows = current.intent === "restore"
        ? rows.filter((row) => context.archiveSource?.itemRevisions.get(row.id) === workItemRevision(row))
        : rows;
      if (!matchedRows.length) return null;
      return {
        policy: current.intent === "restore" ? "auto_cascade_owned" : "confirm_cascade",
        records: matchedRows.map(workItemRecord),
        reason: current.intent === "delete"
          ? "删除计划会同时删除其工作项"
          : current.intent === "archive"
            ? "归档计划会同时归档其现用工作项"
            : "恢复计划只恢复本次归档批次实际归档且未被再次修改的工作项",
        requiresPerItemPermission: true,
      };
    },
    async cascade({ context, root, effects }) {
      const command = validateWorkPlanItemCascade({
        rootEntity: root.entity,
        rootId: root.id,
        intent: root.intent,
        itemIds: effects.map((effect) => Number(effect.target.id)),
      });
      if (!command.ok) throw new Error(command.issue.message);
      for (const effect of effects) {
        const payload = effect.record.payload;
        if (!isWorkItemCascadePayload(payload)) throw new Error("计划项影响缺少事务版本信息");
        const changed = command.data.intent === "delete"
          ? await context.tx.workItem.deleteMany({
            where: { id: Number(effect.target.id), planId: command.data.planId, updatedAt: payload.updatedAt },
          })
          : await context.tx.workItem.updateMany({
            where: {
              id: Number(effect.target.id),
              planId: command.data.planId,
              updatedAt: payload.updatedAt,
              isArchived: payload.isArchived,
            },
            data: { isArchived: command.data.intent === "archive" },
          });
        if (changed.count !== 1) throw new WorkImpactConcurrencyError(`计划项 ${effect.target.id} 已变化，级联已中止`);
      }
    },
  };
}

function isWorkItemCascadePayload(value: unknown): value is {
  updatedAt: Date;
  planId: number | null;
  isArchived: boolean;
} {
  if (!value || typeof value !== "object") return false;
  const payload = value as { updatedAt?: unknown; planId?: unknown; isArchived?: unknown };
  return payload.updatedAt instanceof Date
    && (payload.planId === null || typeof payload.planId === "number")
    && typeof payload.isArchived === "boolean";
}

function restoreProvenanceAdapter(): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: "work.plan.restore-provenance",
    sourceEntity: "WorkPlan",
    intents: ["restore"],
    inspect({ context, current }) {
      if (context.archiveSource) return null;
      return {
        policy: "block",
        records: [{ entity: "WorkPlan", id: current.id, label: current.label }],
        reason: "找不到可验证的计划归档批次，不能恢复关联工作项",
      };
    },
  };
}

function staleRestoreItemsAdapter(): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: "work.plan.restore-stale-items",
    sourceEntity: "WorkPlan",
    intents: ["restore"],
    async inspect({ context }) {
      if (!context.archiveSource?.itemRevisions.size) return null;
      const ids = [...context.archiveSource.itemRevisions.keys()];
      const rows = await context.tx.workItem.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, content: true, updatedAt: true, status: true,
          isArchived: true, planId: true, parentWorkItemId: true,
        },
        orderBy: { id: "asc" },
      });
      const stale = rows.filter((row) => (
        !row.isArchived
        || context.archiveSource?.itemRevisions.get(row.id) !== workItemRevision(row)
      ));
      const foundIds = new Set(rows.map((row) => row.id));
      const missing = ids.filter((id) => !foundIds.has(id));
      if (!stale.length && !missing.length) return null;
      return {
        policy: "block",
        records: [
          ...stale.map(workItemRecord),
          ...missing.map((id) => ({
            entity: "WorkItem",
            id: String(id),
            label: `已删除工作项 #${id}`,
            expectedVersion: context.archiveSource?.itemRevisions.get(id) ?? undefined,
          })),
        ],
        reason: "归档后的工作项状态已变化，请先处理冲突再恢复计划",
      };
    },
  };
}

function planReferenceBlocker(
  input: {
    relationKey: string;
    field: "sourcePlanId" | "parentPeriodPlanId" | "previousPeriodPlanId";
    reason: string;
  },
): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: input.relationKey,
    sourceEntity: "WorkPlan",
    intents: ["archive", "delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.workPlan.findMany({
        where: { [input.field]: Number(current.id) } as Prisma.WorkPlanWhereInput,
        select: { id: true, title: true, updatedAt: true },
        orderBy: { id: "asc" },
      });
      if (!rows.length) return null;
      return {
        policy: "block",
        records: rows.map((row) => ({
          entity: "WorkPlan",
          id: String(row.id),
          label: row.title,
          expectedVersion: row.updatedAt.toISOString(),
        })),
        reason: input.reason,
      };
    },
  };
}

function incompletePlanItemsAdapter(): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: "work.plan.incomplete-items",
    sourceEntity: "WorkPlan",
    intents: ["transition"],
    async inspect({ context, current }) {
      const rows = await context.tx.workItem.findMany({
        where: {
          planId: Number(current.id),
          isArchived: false,
          OR: [{ status: null }, { status: { not: "done" } }],
        },
        select: {
          id: true, content: true, updatedAt: true, status: true,
          isArchived: true, planId: true, parentWorkItemId: true,
        },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map(workItemRecord),
        reason: "计划仍有未完成工作项，不能完成",
      } : null;
    },
  };
}

function incompleteChildItemsAdapter(): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: "work.item.incomplete-children",
    sourceEntity: "WorkItem",
    intents: ["transition"],
    async inspect({ context, current }) {
      const rows = await context.tx.workItem.findMany({
        where: {
          parentWorkItemId: Number(current.id),
          isArchived: false,
          OR: [{ status: null }, { status: { not: "done" } }],
        },
        select: {
          id: true, content: true, updatedAt: true, status: true,
          isArchived: true, planId: true, parentWorkItemId: true,
        },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map(workItemRecord),
        reason: "工作项仍有未完成子项，不能完成",
      } : null;
    },
  };
}

function incompleteEvidenceAdapter(): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: "work.item.incomplete-evidence",
    sourceEntity: "WorkItem",
    intents: ["transition"],
    async inspect({ context, current }) {
      const pendingIds = context.pendingEvidenceTaskIds;
      const rows = await context.tx.workItem.findMany({
        where: {
          ...(pendingIds
            ? { id: { in: [...pendingIds] } }
            : { taskEvidenceForKrs: { some: { krWorkItemId: Number(current.id) } } }),
          isArchived: false,
          OR: [{ status: null }, { status: { not: "done" } }],
        },
        select: {
          id: true, content: true, updatedAt: true, status: true,
          isArchived: true, planId: true, parentWorkItemId: true,
        },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map(workItemRecord),
        reason: "KR 仍有未完成证据任务，不能完成",
      } : null;
    },
  };
}

function workItemReferenceBlocker(input: {
  relationKey: string;
  field: "parentWorkItemId" | "parentPeriodWorkItemId" | "previousPeriodWorkItemId";
  reason: string;
}): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: input.relationKey,
    sourceEntity: "WorkItem",
    intents: ["archive", "delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.workItem.findMany({
        where: { [input.field]: Number(current.id) } as Prisma.WorkItemWhereInput,
        select: {
          id: true, content: true, updatedAt: true, status: true,
          isArchived: true, planId: true, parentWorkItemId: true,
        },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map(workItemRecord),
        reason: input.reason,
      } : null;
    },
  };
}

function workItemEvidenceBlocker(input: {
  relationKey: string;
  field: "krWorkItemId" | "taskWorkItemId";
  reason: string;
}): MutationImpactAdapter<WorkMutationImpactContext> {
  return {
    relationKey: input.relationKey,
    sourceEntity: "WorkItem",
    intents: ["archive", "delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.workKrEvidence.findMany({
        where: { [input.field]: Number(current.id) },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map((row) => ({
          entity: "WorkKrEvidence",
          id: String(row.id),
          label: `KR 证据关系 #${row.id}`,
        })),
        reason: input.reason,
      } : null;
    },
  };
}

function workMutationImpactAdapters(): MutationImpactAdapter<WorkMutationImpactContext>[] {
  return [
    planItemsAdapter(),
    incompletePlanItemsAdapter(),
    incompleteChildItemsAdapter(),
    incompleteEvidenceAdapter(),
    workItemReferenceBlocker({ relationKey: "work.tasks.item.parent", field: "parentWorkItemId", reason: "工作项仍有直接子项" }),
    workItemReferenceBlocker({ relationKey: "work.tasks.parent.item", field: "parentPeriodWorkItemId", reason: "工作项仍被跨周期下级引用" }),
    workItemReferenceBlocker({ relationKey: "work.tasks.previous.item", field: "previousPeriodWorkItemId", reason: "工作项仍被后续周期事项引用" }),
    workItemEvidenceBlocker({ relationKey: "work.tasks.kr-evidence.kr", field: "krWorkItemId", reason: "工作项仍有 KR 证据关系" }),
    workItemEvidenceBlocker({ relationKey: "work.tasks.kr-evidence.task", field: "taskWorkItemId", reason: "工作项仍被 KR 引用为证据" }),
    ...workKpiMutationImpactAdapters(),
    ...workPilotInboundImpactAdapters(),
    ...projectMutationImpactAdapters({ workItemRevision }),
    ...projectMembershipHistoryImpactAdapters(),
    restoreProvenanceAdapter(),
    staleRestoreItemsAdapter(),
    planReferenceBlocker({ relationKey: "work.tasks.source.plan", field: "sourcePlanId", reason: "存在由该计划派生的计划" }),
    planReferenceBlocker({ relationKey: "work.tasks.parent.plan", field: "parentPeriodPlanId", reason: "存在下级周期计划" }),
    planReferenceBlocker({ relationKey: "work.tasks.previous.plan", field: "previousPeriodPlanId", reason: "存在后续周期计划" }),
  ];
}

export {
  mutationImpactServiceError,
  projectMutationRoot,
  workItemMutationRoot,
  workItemRevision,
  workMutationRoot,
  workPlanRevision,
} from "./work-mutation-impact-runtime";
