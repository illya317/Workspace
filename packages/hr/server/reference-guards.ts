import { formatReferenceBlockMessage, type ReferenceBlock } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";

function currentEdpWhere(extra: Record<string, unknown>) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...extra,
    OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
  };
}

export async function guardDepartmentArchive(departmentId: number, actionLabel = "归档部门") {
  const [
    childDepartments,
    positions,
    currentEdps,
    leadingPlans,
    workAssignees,
  ] = await Promise.all([
    prisma.department.count({ where: { parentId: departmentId, isArchived: false } }),
    prisma.position.count({ where: { departmentId, isArchived: false } }),
    prisma.eDP.count({ where: currentEdpWhere({ departmentId }) }),
    prisma.project.count({ where: { leadingDepartmentId: departmentId, isArchived: false } }),
    prisma.departmentWorkAssignee.count({ where: { departmentId } }),
  ]);
  const blocks: ReferenceBlock[] = [
    { label: "现用下级部门", count: childDepartments },
    { label: "现用岗位", count: positions },
    { label: "现用员工岗位记录", count: currentEdps },
    { label: "现用主导计划", count: leadingPlans },
    { label: "工作指派配置", count: workAssignees },
  ];
  return formatReferenceBlockMessage(actionLabel, blocks);
}

export async function guardPositionArchive(positionId: number, actionLabel = "归档岗位") {
  const currentEdps = await prisma.eDP.count({ where: currentEdpWhere({ positionId }) });
  const blocks: ReferenceBlock[] = [
    { label: "现用员工岗位记录", count: currentEdps },
  ];
  return formatReferenceBlockMessage(actionLabel, blocks);
}

export async function guardEmployeeInactive(employeeId: number, actionLabel = "办理离职") {
  const [currentEdps, currentPlans] = await Promise.all([
    prisma.eDP.count({ where: currentEdpWhere({ employeeId }) }),
    prisma.employeeProject.count({ where: currentEdpWhere({ employeeId }) }),
  ]);
  const blocks: ReferenceBlock[] = [
    { label: "现用部门岗位记录", count: currentEdps },
    { label: "现用计划成员记录", count: currentPlans },
  ];
  return formatReferenceBlockMessage(actionLabel, blocks);
}
