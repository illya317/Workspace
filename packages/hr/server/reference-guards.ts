import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { guardActiveReferences } from "@workspace/platform/server/reference-guards";

export async function guardDepartmentArchive(departmentId: number, actionLabel = "归档部门") {
  return guardActiveReferences(actionLabel, [
    { label: "现用下级部门", count: () => prisma.department.count({ where: { parentId: departmentId, isArchived: false } }) },
    { label: "现用岗位", count: () => prisma.position.count({ where: { departmentId, isArchived: false } }) },
    { label: "现用员工岗位记录", count: () => prisma.eDP.count({ where: currentOpenEndedDateWhere({ departmentId }) }) },
    { label: "现用主导项目", count: () => prisma.project.count({ where: { leadingDepartmentId: departmentId, isArchived: false } }) },
    { label: "工作指派配置", count: () => prisma.departmentWorkAssignee.count({ where: { departmentId } }) },
  ]);
}

export async function guardPositionArchive(positionId: number, actionLabel = "归档岗位") {
  return guardActiveReferences(actionLabel, [
    { label: "现用员工岗位记录", count: () => prisma.eDP.count({ where: currentOpenEndedDateWhere({ positionId }) }) },
  ]);
}

export async function guardEmployeeInactive(employeeId: number, actionLabel = "办理离职") {
  return guardActiveReferences(actionLabel, [
    { label: "现用部门岗位记录", count: () => prisma.eDP.count({ where: currentOpenEndedDateWhere({ employeeId }) }) },
    { label: "现用项目成员记录", count: () => prisma.employeeProject.count({ where: currentOpenEndedDateWhere({ employeeId }) }) },
  ]);
}
