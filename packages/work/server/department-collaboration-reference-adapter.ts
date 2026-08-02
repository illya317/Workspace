import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";

export async function findCollaborationDepartmentsAndPositions(input: {
  departmentIds: number[];
  positionIds: number[];
}) {
  const [departments, positions] = await Promise.all([
    prisma.department.findMany({
      where: { id: { in: input.departmentIds }, isArchived: false, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      select: { id: true },
    }),
    prisma.position.findMany({
      where: { id: { in: input.positionIds }, isArchived: false, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      select: { id: true, departmentId: true },
    }),
  ]);
  return { departments, positions };
}

export async function findDepartmentCollaborationUpdateReference(collaborationId: number) {
  return prisma.departmentCollaboration.findUnique({
    where: { id: collaborationId },
    select: {
      responsibleDepartmentId: true,
      status: true,
      isArchived: true,
      triggerRule: true,
      scopeDescription: true,
      inputRequirement: true,
      deliverable: true,
      acceptanceCriteria: true,
      responseTargetHours: true,
      deliveryTargetDays: true,
      escalationPolicy: true,
      enablingDepartments: { select: { departmentId: true, responseStatus: true } },
      positions: { where: { kind: "executor" }, select: { positionId: true } },
      workPlans: { where: { isArchived: false, ownerEmployeeId: { not: null } }, select: { ownerEmployeeId: true } },
      workItems: { where: { isArchived: false, ownerEmployeeId: { not: null } }, select: { ownerEmployeeId: true } },
    },
  });
}

export async function findDepartmentCollaborationResponseReference(collaborationId: number, departmentId: number) {
  return prisma.departmentCollaborationDepartment.findUnique({
    where: { collaborationId_departmentId: { collaborationId, departmentId } },
    select: { responseStatus: true, collaboration: { select: { isArchived: true, status: true } } },
  });
}

export async function listEligibleCollaborationOwnerEmployeeIds(input: {
  ownerEmployeeIds: number[];
  executorPositionIds: number[];
  acceptedDepartmentIds: number[];
}) {
  const executorPositions = await prisma.position.findMany({
    where: { id: { in: input.executorPositionIds }, departmentId: { in: input.acceptedDepartmentIds } },
    select: { id: true },
  });
  if (executorPositions.length === 0) return [];
  const assignments = await prisma.eDP.findMany({
    where: {
      employeeId: { in: input.ownerEmployeeIds },
      positionId: { in: executorPositions.map((position) => position.id) },
      ...currentOpenEndedDateWhere(),
      employee: { employments: { some: currentEmploymentDateWhere() } },
    },
    select: { employeeId: true },
  });
  return assignments.map((assignment) => assignment.employeeId);
}
