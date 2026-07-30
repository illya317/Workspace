import { prisma } from "@workspace/platform/server/prisma";

export async function findCompanyActivationReference(companyId: number) {
  return prisma.company.findUnique({ where: { id: companyId }, select: { id: true, isActive: true } });
}

export async function findManagementDepartmentReference(departmentId: number) {
  return prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      code: true,
      name: true,
      hierarchyKind: true,
      isArchived: true,
      parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
    },
  });
}

export async function findReportOverrideSourcePosition(positionId: number) {
  return prisma.position.findUnique({
    where: { id: positionId },
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      departmentId: true,
      department: { select: { id: true, code: true, name: true, hierarchyKind: true, isArchived: true } },
    },
  });
}

export async function listPositionReportOverrideReferences(positionId: number) {
  return prisma.positionReportOverride.findMany({
    where: { positionId },
    select: { id: true, companyId: true, departmentId: true, version: true, _count: { select: { edps: true } } },
  });
}

export async function findAssignmentPositionReference(positionId: number) {
  return prisma.position.findUnique({
    where: { id: positionId },
    select: {
      id: true,
      departmentId: true,
      isArchived: true,
      department: { select: { id: true, code: true, hierarchyKind: true, isArchived: true } },
    },
  });
}

export async function findActivePositionReportOverride(input: {
  id?: number | null;
  positionId: number;
  companyId: number;
  departmentId: number;
}) {
  return prisma.positionReportOverride.findFirst({
    where: {
      ...(input.id ? { id: input.id } : {}),
      positionId: input.positionId,
      companyId: input.companyId,
      departmentId: input.departmentId,
      isActive: true,
    },
    select: { id: true, companyId: true, departmentId: true },
  });
}
