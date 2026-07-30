import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";

function currentActiveEmployeeEdpWhere<T extends Record<string, unknown>>(extra: T) {
  return currentOpenEndedDateWhere({
    ...extra,
    employee: { employments: { some: currentEmploymentDateWhere() } },
  });
}

export function departmentArchiveReferenceCounts(departmentId: number) {
  return [
    { label: "现用下级部门", count: () => prisma.department.count({ where: { parentId: departmentId, isArchived: false } }) },
    { label: "在职员工岗位记录", count: () => prisma.eDP.count({ where: currentActiveEmployeeEdpWhere({ departmentId }) }) },
    { label: "现用主导项目", count: () => prisma.project.count({ where: { leadingDepartmentId: departmentId, isArchived: false } }) },
    { label: "工作指派配置", count: () => prisma.departmentWorkAssignee.count({ where: { departmentId } }) },
  ];
}

export function positionArchiveReferenceCounts(positionId: number) {
  return [
    { label: "在职员工岗位记录", count: () => prisma.eDP.count({ where: currentActiveEmployeeEdpWhere({ positionId }) }) },
  ];
}
