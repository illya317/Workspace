import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "../../prisma/dev.db";

const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Migrate read → access ===\n");

  const readRole = await prisma.role.findUnique({ where: { key: "read" } });
  const accessRole = await prisma.role.findUnique({ where: { key: "access" } });

  if (!readRole || !accessRole) {
    console.log("✓ No 'read' or 'access' role found, nothing to migrate.");
    return;
  }

  const readRoleId = readRole.id;
  const accessRoleId = accessRole.id;

  let totalMerged = 0;
  let totalDeleted = 0;

  async function migrateTable(
    tableName: string,
    findMany: (args: any) => Promise<any[]>,
    findFirst: (args: any) => Promise<any | null>,
    update: (args: any) => Promise<any>,
    deleteMany: (args: any) => Promise<any>,
    subjectIdField: string
  ) {
    const rows = await findMany({
      where: { roleId: readRoleId },
    });

    let merged = 0;
    let deleted = 0;

    for (const row of rows) {
      const existing = await findFirst({
        where: {
          [subjectIdField]: row[subjectIdField],
          resourceId: row.resourceId,
          roleId: accessRoleId,
          scopeId: row.scopeId ?? null,
        },
      });

      if (existing) {
        // access already exists, delete the read grant
        await deleteMany({
          where: { id: row.id },
        });
        deleted++;
      } else {
        // change read to access
        await update({
          where: { id: row.id },
          data: { roleId: accessRoleId },
        });
        merged++;
      }
    }

    console.log(`   ${tableName}: ${merged} migrated, ${deleted} deleted (duplicate)`);
    return { merged, deleted };
  }

  // UserResourceRole
  const userResult = await migrateTable(
    "UserResourceRole",
    prisma.userResourceRole.findMany.bind(prisma.userResourceRole),
    prisma.userResourceRole.findFirst.bind(prisma.userResourceRole),
    prisma.userResourceRole.update.bind(prisma.userResourceRole),
    prisma.userResourceRole.deleteMany.bind(prisma.userResourceRole),
    "userId"
  );

  // PositionResourceRole
  const posResult = await migrateTable(
    "PositionResourceRole",
    prisma.positionResourceRole.findMany.bind(prisma.positionResourceRole),
    prisma.positionResourceRole.findFirst.bind(prisma.positionResourceRole),
    prisma.positionResourceRole.update.bind(prisma.positionResourceRole),
    prisma.positionResourceRole.deleteMany.bind(prisma.positionResourceRole),
    "positionId"
  );

  // DepartmentResourceRole
  const deptResult = await migrateTable(
    "DepartmentResourceRole",
    prisma.departmentResourceRole.findMany.bind(prisma.departmentResourceRole),
    prisma.departmentResourceRole.findFirst.bind(prisma.departmentResourceRole),
    prisma.departmentResourceRole.update.bind(prisma.departmentResourceRole),
    prisma.departmentResourceRole.deleteMany.bind(prisma.departmentResourceRole),
    "departmentId"
  );

  totalMerged = (userResult?.merged || 0) + (posResult?.merged || 0) + (deptResult?.merged || 0);
  totalDeleted = (userResult?.deleted || 0) + (posResult?.deleted || 0) + (deptResult?.deleted || 0);

  console.log(`\n=== Summary ===`);
  console.log(`   Merged: ${totalMerged}`);
  console.log(`   Deleted (duplicate): ${totalDeleted}`);
}

main()
  .catch((e) => { console.error("Migration failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
