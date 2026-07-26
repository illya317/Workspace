import { getOperatingCommitteeDepartmentContext } from "@workspace/platform/server/business-space-permissions";
import { prisma } from "@workspace/platform/server/prisma";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { expandProjectMemberDepartmentScopeIds } from "./project-member-department-scope-utils";
import { listRecursiveSuperiorEmployeeIdsForUser } from "./work-superior-employees";

type ProjectMemberDepartmentScopeInput = {
  projectType?: string | null;
  departmentIds: number[];
};

export async function resolveProjectMemberDepartmentScopeIds(input: ProjectMemberDepartmentScopeInput) {
  const selectedDepartmentIds = Array.from(new Set(input.departmentIds.filter((id) => Number.isInteger(id) && id > 0)));
  const [departments, operatingCommittee] = await Promise.all([
    prisma.department.findMany({
      where: { isArchived: false },
      select: { id: true, parentId: true, hierarchyKind: true, code: true },
    }),
    getOperatingCommitteeDepartmentContext(),
  ]);
  return expandProjectMemberDepartmentScopeIds({
    departments,
    selectedDepartmentIds,
    operatingCommitteeId: operatingCommittee?.id,
  });
}

export async function employeesFitProjectMemberDepartmentScope(input: ProjectMemberDepartmentScopeInput & {
  employeeIds: number[];
  actorUserId?: number | null;
}) {
  const employeeIds = Array.from(new Set(input.employeeIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (employeeIds.length === 0) return true;
  const departmentIds = await resolveProjectMemberDepartmentScopeIds(input);
  if (departmentIds.length === 0) return false;
  if (input.actorUserId) {
    const superiorIds = new Set(await listRecursiveSuperiorEmployeeIdsForUser(input.actorUserId));
    if (employeeIds.some((employeeId) => superiorIds.has(employeeId))) return false;
  }

  const memberships = await prisma.eDP.findMany({
    where: currentOpenEndedDateWhere({
      employeeId: { in: employeeIds },
      departmentId: { in: departmentIds },
    }),
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  return new Set(memberships.map((membership) => membership.employeeId)).size === employeeIds.length;
}
