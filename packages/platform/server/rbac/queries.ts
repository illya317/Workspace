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
    prisma.userResourceActionGrant.findMany({
      where: { userId },
      include: { resource: true },
      orderBy: { resource: { sortOrder: "asc" } },
    }),
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
  ]);

  const toGrantResult = (grant: { resource: GrantResult[number]["resource"]; actionKey: string; scopeId: string | null }) => ({
    resource: grant.resource,
    role: { id: 0, key: grant.actionKey, name: grant.actionKey, description: null, sortOrder: 0 },
    scopeId: grant.scopeId,
  });

  const result: GrantResult = direct.map(toGrantResult);

  if (posIds.length > 0) {
    const posGrants = await prisma.positionResourceActionGrant.findMany({
      where: { positionId: { in: posIds } },
      include: { resource: true },
      orderBy: { resource: { sortOrder: "asc" } },
    });
    for (const g of posGrants)
      result.push(toGrantResult(g));
  }
  if (deptIds.length > 0) {
    const deptGrants = await prisma.departmentResourceActionGrant.findMany({
      where: { departmentId: { in: deptIds } },
      include: { resource: true },
      orderBy: { resource: { sortOrder: "asc" } },
    });
    for (const g of deptGrants)
      result.push(toGrantResult(g));
  }

  return result;
}
