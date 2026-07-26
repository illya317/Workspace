import type { MutationImpactAdapter, MutationImpactRecord } from "@workspace/platform/server/mutation-impact";
import type { Prisma } from "@workspace/platform/server/prisma";

type Context = { tx: Prisma.TransactionClient };

function lifecycleHistoryBlocker(input: {
  relationKey: string;
  sourceEntity: string;
  reason: string;
  load: (tx: Prisma.TransactionClient, targetId: number) => Promise<MutationImpactRecord[]>;
}): MutationImpactAdapter<Context> {
  return {
    relationKey: input.relationKey,
    sourceEntity: input.sourceEntity,
    intents: ["delete"],
    async inspect({ context, current }) {
      const records = await input.load(context.tx, Number(current.id));
      return records.length ? { policy: "block", records, reason: input.reason } : null;
    },
  };
}

const records = (entity: string, label: string, rows: Array<{ id: number }>): MutationImpactRecord[] => (
  rows.map((row) => ({ entity, id: String(row.id), label: `${label} #${row.id}` }))
);

export function projectMembershipHistoryImpactAdapters(): MutationImpactAdapter<Context>[] {
  return [
    lifecycleHistoryBlocker({
      relationKey: "work.projects.member.supersedes", sourceEntity: "EmployeeProject", reason: "该成员版本已被后续版本引用，不能删除",
      load: async (tx, id) => records("EmployeeProject", "后续成员版本", await tx.employeeProject.findMany({ where: { supersedesId: id }, select: { id: true } })),
    }),
    lifecycleHistoryBlocker({
      relationKey: "work.projects.member.created-by-change", sourceEntity: "ProjectMembershipChange", reason: "该命令已生成成员版本，不能删除",
      load: async (tx, id) => records("EmployeeProject", "生成成员版本", await tx.employeeProject.findMany({ where: { createdByChangeId: id }, select: { id: true } })),
    }),
    lifecycleHistoryBlocker({
      relationKey: "work.projects.member.terminal-change", sourceEntity: "ProjectMembershipChange", reason: "该命令已终结成员版本，不能删除",
      load: async (tx, id) => records("EmployeeProject", "终结成员版本", await tx.employeeProject.findMany({ where: { terminalChangeId: id }, select: { id: true } })),
    }),
    lifecycleHistoryBlocker({
      relationKey: "work.projects.member-change.employee", sourceEntity: "Employee", reason: "员工已有项目成员生命周期证据，不能物理删除",
      load: async (tx, id) => records("ProjectMembershipChange", "成员变更", await tx.projectMembershipChange.findMany({ where: { employeeId: id }, select: { id: true } })),
    }),
    lifecycleHistoryBlocker({
      relationKey: "work.projects.member-change.project", sourceEntity: "Project", reason: "项目已有成员生命周期证据，不能物理删除",
      load: async (tx, id) => records("ProjectMembershipChange", "成员变更", await tx.projectMembershipChange.findMany({ where: { projectId: id }, select: { id: true } })),
    }),
  ];
}
