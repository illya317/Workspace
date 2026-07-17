import type { MutationImpactAdapter, MutationImpactRecord } from "@workspace/platform/server/mutation-impact";
import type { Prisma } from "@workspace/platform/server/prisma";
import { validateWorkPlanKpiAssignmentCascade } from "./domain/work-mutation-impact-validation";

type WorkKpiMutationImpactContext = { tx: Prisma.TransactionClient };

function assignmentRecord(assignment: {
  id: number;
  version: number;
  workItem: { content: string };
}): MutationImpactRecord {
  return {
    entity: "WorkKpiAssignment",
    id: String(assignment.id),
    label: assignment.workItem.content,
    expectedVersion: assignment.version,
  };
}

export function workKpiMutationImpactAdapters(): MutationImpactAdapter<WorkKpiMutationImpactContext>[] {
  return [
    {
      relationKey: "work.plan.kpi-assignments",
      sourceEntity: "WorkPlan",
      intents: ["delete"],
      executionPriority: -10,
      async inspect({ context, current }) {
        const rows = await context.tx.workKpiAssignment.findMany({
          where: { workPlanId: Number(current.id) },
          select: { id: true, version: true, workItem: { select: { content: true } } },
          orderBy: { id: "asc" },
        });
        return rows.length ? {
          policy: "confirm_cascade",
          records: rows.map(assignmentRecord),
          reason: "删除计划会同时删除其 KPI 分配",
          requiresPerItemPermission: false,
        } : null;
      },
      async cascade({ context, root, effects }) {
        const command = validateWorkPlanKpiAssignmentCascade({
          rootEntity: root.entity,
          rootId: root.id,
          intent: root.intent,
          assignmentIds: effects.map((effect) => Number(effect.target.id)),
        });
        if (!command.ok) throw new Error(command.issue.message);
        for (const effect of effects) {
          const changed = await context.tx.workKpiAssignment.deleteMany({
            where: {
              id: Number(effect.target.id),
              workPlanId: command.data.planId,
              version: Number(effect.target.expectedVersion),
            },
          });
          if (changed.count !== 1) throw new Error(`KPI 分配 ${effect.target.id} 已变化，级联已中止`);
        }
      },
    },
    {
      relationKey: "work.tasks.kpi-assignment.item",
      sourceEntity: "WorkItem",
      intents: ["archive", "delete"],
      async inspect({ context, current, root }) {
        if (root.entity !== "WorkItem" || current.id !== root.id) return null;
        const row = await context.tx.workKpiAssignment.findUnique({
          where: { workItemId: Number(current.id) },
          select: { id: true, version: true, workItem: { select: { content: true } } },
        });
        return row ? {
          policy: "block",
          records: [assignmentRecord(row)],
          reason: "工作项仍承载 KPI 分配，请先在计分卡中处理",
        } : null;
      },
    },
    {
      relationKey: "work.kpi.assignment.results",
      sourceEntity: "WorkKpiAssignment",
      intents: ["delete"],
      async inspect({ context, current }) {
        const rows = await context.tx.workKpiResultSnapshot.findMany({
          where: { assignmentId: Number(current.id) },
          select: { id: true, version: true },
          orderBy: { id: "asc" },
        });
        return rows.length ? {
          policy: "block",
          records: rows.map((row) => ({
            entity: "WorkKpiResultSnapshot",
            id: String(row.id),
            label: `KPI 结果版本 ${row.version}`,
            expectedVersion: row.version,
          })),
          reason: "KPI 分配已有结果快照，不能随计划删除",
        } : null;
      },
    },
    {
      relationKey: "work.kpi.assignment.derived",
      sourceEntity: "WorkKpiAssignment",
      intents: ["delete"],
      async inspect({ context, current, root }) {
        const rows = await context.tx.workKpiAssignment.findMany({
          where: {
            sourceAssignmentId: Number(current.id),
            ...(root.entity === "WorkPlan" ? { workPlanId: { not: Number(root.id) } } : {}),
          },
          select: { id: true, version: true, workItem: { select: { content: true } } },
          orderBy: { id: "asc" },
        });
        return rows.length ? {
          policy: "block",
          records: rows.map(assignmentRecord),
          reason: "KPI 分配仍被后续计分卡承接，请先处理承接关系",
        } : null;
      },
    },
  ];
}
