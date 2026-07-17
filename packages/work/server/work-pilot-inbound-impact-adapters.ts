import type { MutationImpactAdapter, MutationImpactRecord } from "@workspace/platform/server/mutation-impact";
import type { Prisma } from "@workspace/platform/server/prisma";

type PilotImpactContext = { tx: Prisma.TransactionClient };

function meetingBacklinkAdapter(input: {
  relationKey: string;
  sourceEntity: "WorkItem" | "WorkPlan";
  field: "linkedWorkItemId" | "linkedWorkPlanId";
}): MutationImpactAdapter<PilotImpactContext> {
  return {
    relationKey: input.relationKey,
    sourceEntity: input.sourceEntity,
    intents: ["archive", "delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.meetingActionCandidate.findMany({
        where: { [input.field]: Number(current.id) },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map((row) => ({
          entity: "MeetingActionCandidate",
          id: String(row.id),
          label: row.title,
          expectedVersion: row.updatedAt.toISOString(),
        })),
        reason: "会议行动候选仍关联该执行对象，请先处理会议侧关联",
      } : null;
    },
  };
}

function alignmentSourceAdapter(input: {
  relationKey: string;
  sourceEntity: "WorkItem" | "WorkPlan";
  field: "sourceWorkItemId" | "sourcePlanId";
  reason: string;
}): MutationImpactAdapter<PilotImpactContext> {
  return {
    relationKey: input.relationKey,
    sourceEntity: input.sourceEntity,
    intents: ["archive", "delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.workPlanAlignment.findMany({
        where: { [input.field]: Number(current.id) },
        select: { id: true, note: true, updatedAt: true },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map((row) => ({
          entity: "WorkPlanAlignment",
          id: String(row.id),
          label: row.note || `计划承接关系 #${row.id}`,
          expectedVersion: row.updatedAt.toISOString(),
        })),
        reason: input.reason,
      } : null;
    },
  };
}

function workItemOwnedDetailsAdapter(): MutationImpactAdapter<PilotImpactContext> {
  return {
    relationKey: "work.item.owned-details",
    sourceEntity: "WorkItem",
    intents: ["delete"],
    async inspect({ context, current }) {
      const workItemId = Number(current.id);
      const [participants, responsibilities] = await Promise.all([
        context.tx.workParticipant.findMany({
          where: { workItemId },
          select: { id: true, name: true, createdAt: true },
          orderBy: { id: "asc" },
        }),
        context.tx.workResponsibilityReference.findMany({
          where: { workItemId },
          select: { id: true, titleSnapshot: true, updatedAt: true },
          orderBy: { id: "asc" },
        }),
      ]);
      const records: MutationImpactRecord[] = [
        ...participants.map((row) => ({
          entity: "WorkParticipant",
          id: String(row.id),
          label: row.name,
          expectedVersion: row.createdAt.toISOString(),
        })),
        ...responsibilities.map((row) => ({
          entity: "WorkResponsibilityReference",
          id: String(row.id),
          label: row.titleSnapshot,
          expectedVersion: row.updatedAt.toISOString(),
        })),
      ];
      return records.length ? {
        policy: "auto_cascade_owned",
        records,
        reason: "工作项的参与人和当前职责快照会随工作项删除",
        requiresPerItemPermission: false,
      } : null;
    },
    cascade() {
      // These rows have no independent lifecycle and are physically owned by WorkItem.
    },
  };
}

function workPlanOwnedDetailsAdapter(): MutationImpactAdapter<PilotImpactContext> {
  return {
    relationKey: "work.plan.owned-details",
    sourceEntity: "WorkPlan",
    intents: ["delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.workPlanAlignment.findMany({
        where: { childPlanId: Number(current.id) },
        select: { id: true, note: true, updatedAt: true },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "auto_cascade_owned",
        records: rows.map((row) => ({
          entity: "WorkPlanAlignment",
          id: String(row.id),
          label: row.note || `计划承接明细 #${row.id}`,
          expectedVersion: row.updatedAt.toISOString(),
        })),
        reason: "计划自身的承接明细会随计划删除",
        requiresPerItemPermission: false,
      } : null;
    },
    cascade() {
      // WorkPlanAlignment.childPlanId is an owned technical detail with database cascade.
    },
  };
}

function reportSnapshotAdapter(input: {
  relationKey: string;
  sourceEntity: "WorkItem" | "WorkPlan";
  field: "workItemId" | "workPlanId";
}): MutationImpactAdapter<PilotImpactContext> {
  return {
    relationKey: input.relationKey,
    sourceEntity: input.sourceEntity,
    intents: ["archive", "delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.workReportItem.findMany({
        where: { [input.field]: Number(current.id) },
        select: { id: true, title: true },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "retain",
        records: rows.map((row) => ({
          entity: "WorkReportItem",
          id: String(row.id),
          label: row.title,
        })),
        reason: "已提交报告保留业务快照；删除时只解除可空引用",
        requiresPerItemPermission: false,
      } : null;
    },
  };
}

function planGovernanceHistoryAdapter(): MutationImpactAdapter<PilotImpactContext> {
  return {
    relationKey: "work.plan.governance-history",
    sourceEntity: "WorkPlan",
    intents: ["delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.workPlanGovernanceEvent.findMany({
        where: { workPlanId: Number(current.id) },
        select: { id: true, reason: true, createdAt: true },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map((row) => ({
          entity: "WorkPlanGovernanceEvent",
          id: String(row.id),
          label: row.reason,
          expectedVersion: row.createdAt.toISOString(),
        })),
        reason: "计划已有治理历史，不能删除；可改为归档",
      } : null;
    },
  };
}

export function workPilotInboundImpactAdapters(): MutationImpactAdapter<PilotImpactContext>[] {
  return [
    meetingBacklinkAdapter({ relationKey: "work.meeting-action.work-item", sourceEntity: "WorkItem", field: "linkedWorkItemId" }),
    meetingBacklinkAdapter({ relationKey: "work.meeting-action.work-plan", sourceEntity: "WorkPlan", field: "linkedWorkPlanId" }),
    alignmentSourceAdapter({
      relationKey: "work.plan-alignment.source-item",
      sourceEntity: "WorkItem",
      field: "sourceWorkItemId",
      reason: "工作项仍作为计划承接来源，请先调整承接关系",
    }),
    alignmentSourceAdapter({
      relationKey: "work.tasks.plan.alignment",
      sourceEntity: "WorkPlan",
      field: "sourcePlanId",
      reason: "计划仍作为其他计划的承接来源，请先调整承接关系",
    }),
    workItemOwnedDetailsAdapter(),
    workPlanOwnedDetailsAdapter(),
    reportSnapshotAdapter({ relationKey: "work.report-item.work-item", sourceEntity: "WorkItem", field: "workItemId" }),
    reportSnapshotAdapter({ relationKey: "work.report-item.work-plan", sourceEntity: "WorkPlan", field: "workPlanId" }),
    planGovernanceHistoryAdapter(),
  ];
}
