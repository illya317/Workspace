import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { guardActiveReferences } from "@workspace/platform/server/reference-guards";

export async function guardProjectArchive(projectId: number, actionLabel = "归档工作计划") {
  return guardActiveReferences(actionLabel, [
    { label: "现用下级计划", count: () => prisma.project.count({ where: { parentId: projectId, isArchived: false } }) },
    { label: "现用计划成员", count: () => prisma.employeeProject.count({ where: currentOpenEndedDateWhere({ projectId }) }) },
    { label: "工作指派配置", count: () => prisma.projectWorkAssignee.count({ where: { projectId } }) },
  ]);
}
