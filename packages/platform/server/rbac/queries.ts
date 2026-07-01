import { prisma } from "@workspace/platform/server/prisma";
import { getUserPositionIds, getUserDepartmentIds } from "./helpers";

type GrantResult = Array<{
  resource: {
    id: number;
    key: string;
    name: string;
    description: string | null;
    sortOrder: number;
    parentId: number | null;
  };
  role: {
    id: number;
    key: string;
    name: string;
    description: string | null;
    sortOrder: number;
  };
  scopeId: string | null;
}>;


export async function getUserPermissions(userId: number): Promise<GrantResult> {
  const [direct, posIds, deptIds] = await Promise.all([
    prisma.userResourceRole.findMany({
      where: { userId },
      include: { resource: true, role: true },
      orderBy: { resource: { sortOrder: "asc" } },
    }),
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
  ]);

  const result: GrantResult = [...direct];

  if (posIds.length > 0) {
    const posGrants = await prisma.positionResourceRole.findMany({
      where: { positionId: { in: posIds } },
      include: { resource: true, role: true },
      orderBy: { resource: { sortOrder: "asc" } },
    });
    for (const g of posGrants)
      result.push({ resource: g.resource, role: g.role, scopeId: g.scopeId });
  }
  if (deptIds.length > 0) {
    const deptGrants = await prisma.departmentResourceRole.findMany({
      where: { departmentId: { in: deptIds } },
      include: { resource: true, role: true },
      orderBy: { resource: { sortOrder: "asc" } },
    });
    for (const g of deptGrants)
      result.push({ resource: g.resource, role: g.role, scopeId: g.scopeId });
  }

  return result;
}
