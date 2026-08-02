import type { MutationImpactAdapter, MutationImpactRecord } from "@workspace/platform/server/mutation-impact";
import { Prisma } from "@workspace/platform/server/prisma";

type WorkProjectMutationImpactContext = { tx: Prisma.TransactionClient };

type WorkItemRevision = (item: {
  updatedAt: Date;
  status: string | null;
  isArchived: boolean;
  planId: number | null;
  parentWorkItemId: number | null;
}) => string;

function projectWorkReferenceAdapter(input: {
  relationKey: string;
  source: "item" | "plan";
  viaPhase: boolean;
  workItemRevision: WorkItemRevision;
}): MutationImpactAdapter<WorkProjectMutationImpactContext> {
  return {
    relationKey: input.relationKey,
    sourceEntity: "Project",
    intents: ["archive", "delete"],
    async inspect({ context, current }) {
      const projectId = Number(current.id);
      if (input.source === "item") {
        const items = await context.tx.workItem.findMany({
          where: input.viaPhase ? { linkedProjectPhase: { projectId } } : { linkedProjectId: projectId },
          select: {
            id: true, content: true, updatedAt: true, status: true,
            isArchived: true, planId: true, parentWorkItemId: true,
          },
          orderBy: { id: "asc" },
        });
        return items.length ? {
          policy: "block",
          records: items.map((item) => ({
            entity: "WorkItem",
            id: String(item.id),
            label: item.content,
            expectedVersion: input.workItemRevision(item),
          })),
          reason: "项目仍被工作项引用，请先解除业务关联",
        } : null;
      }
      const plans = await context.tx.workPlan.findMany({
        where: input.viaPhase ? { linkedProjectPhase: { projectId } } : { linkedProjectId: projectId },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { id: "asc" },
      });
      return plans.length ? {
        policy: "block",
        records: plans.map((plan) => ({
          entity: "WorkPlan",
          id: String(plan.id),
          label: plan.title,
          expectedVersion: plan.updatedAt.toISOString(),
        })),
        reason: "项目仍被工作计划引用，请先解除业务关联",
      } : null;
    },
  };
}

function projectOwnedChildrenAdapter(): MutationImpactAdapter<WorkProjectMutationImpactContext> {
  return {
    relationKey: "work.project.owned-children",
    sourceEntity: "Project",
    intents: ["delete"],
    async inspect({ context, current }) {
      const projectId = Number(current.id);
      const groups = await Promise.all([
        ownedRows(context.tx.projectEnablingDepartment.findMany({ where: { projectId }, select: { id: true } }), "ProjectEnablingDepartment", "赋能部门"),
        ownedRows(context.tx.projectPlanPhase.findMany({ where: { projectId }, select: { id: true } }), "ProjectPlanPhase", "项目阶段"),
        ownedRows(context.tx.projectPlanDependency.findMany({ where: { projectId }, select: { id: true } }), "ProjectPlanDependency", "项目依赖"),
        ownedRows(context.tx.projectPlanBaseline.findMany({ where: { projectId }, select: { id: true } }), "ProjectPlanBaseline", "计划基线"),
        ownedRows(context.tx.projectWorkAssignee.findMany({ where: { projectId }, select: { id: true } }), "ProjectWorkAssignee", "项目任务责任人"),
      ]);
      const records = groups.flat();
      return records.length ? {
        records,
        reason: "删除项目会同步清理项目自有技术明细",
        requiresPerItemPermission: false,
      } : null;
    },
    cascade() {
      // Physical owned relations cascade with the root Project delete.
    },
  };
}

function projectMembershipsAdapter(): MutationImpactAdapter<WorkProjectMutationImpactContext> {
  return {
    relationKey: "work.project.memberships",
    sourceEntity: "Project",
    intents: ["delete"],
    async inspect({ context, current }) {
      const rows = await context.tx.employeeProject.findMany({
        where: { projectId: Number(current.id) },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      return rows.length ? {
        policy: "block",
        records: rows.map((row) => ({
          entity: "EmployeeProject",
          id: String(row.id),
          label: `项目成员 #${row.id}`,
        })),
        reason: "项目成员是受生命周期保护的事实记录，请先按成员退出流程处理",
        requiresPerItemPermission: false,
      } : null;
    },
  };
}

function projectNotificationGovernanceHistoryAdapter(): MutationImpactAdapter<WorkProjectMutationImpactContext> {
  return {
    relationKey: "work.project.notification-governance-history",
    sourceEntity: "Project",
    intents: ["delete"],
    async inspect({ context, current }) {
      const projectId = Number(current.id);
      const [rule, evaluation, signals] = await Promise.all([
        context.tx.projectNotificationRule.findFirst({
          where: { projectId },
          select: { id: true, key: true },
          orderBy: { id: "asc" },
        }),
        context.tx.projectNotificationEvaluation.findFirst({
          where: { projectId },
          select: { id: true, signalId: true },
          orderBy: { evaluatedAt: "asc" },
        }),
        context.tx.$queryRaw<Array<{ id: string; signalId: string }>>(Prisma.sql`
          SELECT "id", "signalId"
          FROM "ProjectNotificationSignal"
          WHERE "projectId" = ${projectId}
          ORDER BY "createdAt" ASC, "id" ASC
          LIMIT 1
        `),
      ]);
      const signal = signals[0] ?? null;
      const records: MutationImpactRecord[] = [
        ...(rule ? [{
          entity: "ProjectNotificationRule",
          id: String(rule.id),
          label: `通知监管规则 ${rule.key}`,
        }] : []),
        ...(evaluation ? [{
          entity: "ProjectNotificationEvaluation",
          id: evaluation.id,
          label: `通知评估记录 ${evaluation.signalId}`,
        }] : []),
        ...(signal ? [{
          entity: "ProjectNotificationSignal",
          id: signal.id,
          label: `通知事件信号 ${signal.signalId}`,
        }] : []),
      ];
      return records.length ? {
        policy: "block",
        records,
        reason: "项目通知监管信号、规则和评估记录属于审计事实，请归档项目并保留账本，不能硬删除",
        requiresPerItemPermission: false,
      } : null;
    },
  };
}

async function ownedRows(
  rowsPromise: Promise<Array<{ id: number }>>,
  entity: string,
  label: string,
): Promise<MutationImpactRecord[]> {
  const rows = await rowsPromise;
  return rows.map((row) => ({ entity, id: String(row.id), label: `${label} #${row.id}` }));
}

export function projectMutationImpactAdapters(input: {
  workItemRevision: WorkItemRevision;
}): MutationImpactAdapter<WorkProjectMutationImpactContext>[] {
  return [
    projectWorkReferenceAdapter({ ...input, relationKey: "work.tasks.linked.project", source: "item", viaPhase: false }),
    projectWorkReferenceAdapter({ ...input, relationKey: "work.tasks.linked.project-phase", source: "item", viaPhase: true }),
    projectWorkReferenceAdapter({ ...input, relationKey: "work.plan.linked.project", source: "plan", viaPhase: false }),
    projectWorkReferenceAdapter({ ...input, relationKey: "work.plan.linked.project-phase", source: "plan", viaPhase: true }),
    projectMembershipsAdapter(),
    projectNotificationGovernanceHistoryAdapter(),
    projectOwnedChildrenAdapter(),
  ];
}
