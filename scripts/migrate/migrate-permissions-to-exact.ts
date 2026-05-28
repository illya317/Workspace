import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "../../prisma/dev.db";

const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

async function getResourceDescendants(resourceId: number): Promise<number[]> {
  const ids: number[] = [resourceId];
  const children = await prisma.resource.findMany({
    where: { parentId: resourceId },
    select: { id: true },
  });
  for (const child of children) {
    const childDescendants = await getResourceDescendants(child.id);
    ids.push(...childDescendants);
  }
  return ids;
}

async function migrateUserRoles() {
  console.log("[migrate] UserResourceRole...");
  const grants = await prisma.userResourceRole.findMany({
    select: { id: true, userId: true, resourceId: true, roleId: true, scopeId: true },
  });
  let created = 0;
  for (const g of grants) {
    const descendantIds = await getResourceDescendants(g.resourceId);
    for (const rid of descendantIds) {
      if (rid === g.resourceId) continue; // skip self
      const existing = await prisma.userResourceRole.findFirst({
        where: { userId: g.userId, resourceId: rid, roleId: g.roleId, scopeId: g.scopeId },
      });
      if (!existing) {
        await prisma.userResourceRole.create({
          data: { userId: g.userId, resourceId: rid, roleId: g.roleId, scopeId: g.scopeId },
        });
        created++;
      }
    }
  }
  console.log(`[migrate] UserResourceRole: ${created} descendant grants created`);
}

async function migratePositionRoles() {
  console.log("[migrate] PositionResourceRole...");
  const grants = await prisma.positionResourceRole.findMany({
    select: { id: true, positionId: true, resourceId: true, roleId: true },
  });
  let created = 0;
  for (const g of grants) {
    const descendantIds = await getResourceDescendants(g.resourceId);
    for (const rid of descendantIds) {
      if (rid === g.resourceId) continue;
      const existing = await prisma.positionResourceRole.findFirst({
        where: { positionId: g.positionId, resourceId: rid, roleId: g.roleId },
      });
      if (!existing) {
        await prisma.positionResourceRole.create({
          data: { positionId: g.positionId, resourceId: rid, roleId: g.roleId },
        });
        created++;
      }
    }
  }
  console.log(`[migrate] PositionResourceRole: ${created} descendant grants created`);
}

async function migrateDepartmentRoles() {
  console.log("[migrate] DepartmentResourceRole...");
  const grants = await prisma.departmentResourceRole.findMany({
    select: { id: true, departmentId: true, resourceId: true, roleId: true },
  });
  let created = 0;
  for (const g of grants) {
    const descendantIds = await getResourceDescendants(g.resourceId);
    for (const rid of descendantIds) {
      if (rid === g.resourceId) continue;
      const existing = await prisma.departmentResourceRole.findFirst({
        where: { departmentId: g.departmentId, resourceId: rid, roleId: g.roleId },
      });
      if (!existing) {
        await prisma.departmentResourceRole.create({
          data: { departmentId: g.departmentId, resourceId: rid, roleId: g.roleId },
        });
        created++;
      }
    }
  }
  console.log(`[migrate] DepartmentResourceRole: ${created} descendant grants created`);
}

async function main() {
  console.log("Starting permission migration to exact-match model...");
  await migrateUserRoles();
  await migratePositionRoles();
  await migrateDepartmentRoles();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
