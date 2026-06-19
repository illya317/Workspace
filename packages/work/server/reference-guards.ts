import { formatReferenceBlockMessage, type ReferenceBlock } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";

function currentEmployeeProjectWhere(projectId: number) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    projectId,
    OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
  };
}

export async function guardProjectArchive(projectId: number, actionLabel = "归档工作计划") {
  const [children, currentMembers, workAssignees] = await Promise.all([
    prisma.project.count({ where: { parentId: projectId, isArchived: false } }),
    prisma.employeeProject.count({ where: currentEmployeeProjectWhere(projectId) }),
    prisma.projectWorkAssignee.count({ where: { projectId } }),
  ]);
  const blocks: ReferenceBlock[] = [
    { label: "现用下级计划", count: children },
    { label: "现用计划成员", count: currentMembers },
    { label: "工作指派配置", count: workAssignees },
  ];
  return formatReferenceBlockMessage(actionLabel, blocks);
}
