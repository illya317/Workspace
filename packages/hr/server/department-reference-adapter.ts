import { prisma } from "@workspace/platform/server/prisma";

export async function findActiveDepartmentByCode(code: string, hierarchyKind?: "G" | "M") {
  return prisma.department.findFirst({
    where: { code, ...(hierarchyKind ? { hierarchyKind } : {}), isArchived: false },
    select: { id: true },
  });
}

export async function findDepartmentParentReference(id: number) {
  return prisma.department.findUnique({
    where: { id },
    select: { code: true, hierarchyKind: true, level: true },
  });
}

export async function findPositionDepartmentReference(id: number) {
  return prisma.position.findUnique({ where: { id }, select: { departmentId: true } });
}

export async function findDepartmentParentId(id: number) {
  return prisma.department.findUnique({ where: { id }, select: { parentId: true } });
}

export async function findDepartmentUpdateReference(id: number) {
  return prisma.department.findUnique({
    where: { id },
    select: { code: true, hierarchyKind: true, level: true, parentId: true, managerPositionId: true },
  });
}

export async function findDepartmentIdByCode(code: string) {
  return prisma.department.findFirst({ where: { code }, select: { id: true } });
}
