import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "../../prisma/dev.db";

const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== RBAC v2 Migration ===\n");

  // ─── Step 1: Resources (tree) ─────────────────────────
  console.log("1. Seeding Resources (tree)...");
  const resDefs = [
    { key: "system", name: "系统管理", sortOrder: 0 },
    { key: "system.audit", name: "审计日志", sortOrder: 2, parentKey: "system" },
    { key: "hr", name: "人事管理", sortOrder: 10 },
    { key: "hr.roster", name: "人事基础资料", sortOrder: 11, parentKey: "hr" },
    { key: "hr.performance", name: "考勤绩效", sortOrder: 12, parentKey: "hr" },
    { key: "hr.analytics", name: "人力分析", sortOrder: 13, parentKey: "hr" },
    { key: "docs", name: "文档", sortOrder: 20 },
    { key: "docs.policy", name: "制度", sortOrder: 21, parentKey: "docs" },
    { key: "docs.manual", name: "培训手册", sortOrder: 22, parentKey: "docs" },
    { key: "docs.form", name: "表单", sortOrder: 23, parentKey: "docs" },
    { key: "work", name: "工作", sortOrder: 30 },
    { key: "work.reports", name: "周报", sortOrder: 31, parentKey: "work" },
    { key: "work.tasks", name: "工作清单", sortOrder: 32, parentKey: "work" },
    { key: "finance", name: "财务", sortOrder: 40 },
  ];

  const resourceMap = new Map<string, number>();
  // First pass: create all without parentId
  for (const r of resDefs) {
    const created = await prisma.resource.upsert({
      where: { key: r.key },
      update: { name: r.name, sortOrder: r.sortOrder },
      create: { key: r.key, name: r.name, sortOrder: r.sortOrder },
    });
    resourceMap.set(r.key, created.id);
    console.log(`   ✓ ${r.key} (id=${created.id})`);
  }
  // Second pass: set parentId
  for (const r of resDefs) {
    if (r.parentKey) {
      const parentId = resourceMap.get(r.parentKey);
      if (parentId) {
        await prisma.resource.update({
          where: { key: r.key },
          data: { parentId },
        });
      }
    }
  }
  // Verify: count parents
  const parentCount = await prisma.resource.count({ where: { parentId: { not: null } } });
  console.log(`   Tree: ${resDefs.length - parentCount} parents + ${parentCount} children`);

  // ─── Step 2: Roles ───────────────────────────────────
  console.log("\n2. Seeding Roles...");
  const roleDefs = [
    { key: "access", name: "可进入", sortOrder: 0 },
    { key: "write", name: "编辑", sortOrder: 1 },
    { key: "delete", name: "删除", sortOrder: 2 },
    { key: "admin", name: "管理", sortOrder: 3 },
  ];
  const roleMap = new Map<string, number>();
  for (const r of roleDefs) {
    const created = await prisma.role.upsert({
      where: { key: r.key },
      update: { name: r.name, sortOrder: r.sortOrder },
      create: { key: r.key, name: r.name, sortOrder: r.sortOrder },
    });
    roleMap.set(r.key, created.id);
    console.log(`   ✓ ${r.key} (id=${created.id})`);
  }

  // ─── Step 3: SystemConfig ────────────────────────────
  console.log("\n3. Seeding SystemConfig...");
  await prisma.systemConfig.upsert({
    where: { key: "perm.conflict_strategy" },
    update: { value: "union" },
    create: { key: "perm.conflict_strategy", value: "union" },
  });
  console.log("   ✓ perm.conflict_strategy = union");

  // ─── Step 4: Grant admin permissions ─────────────────
  console.log("\n4. Granting admin permissions...");
  const adminUsers = await prisma.user.findMany({
    where: { username: "admin" },
    select: { id: true, username: true },
  });

  const sysAdminResId = resourceMap.get("system")!;
  const adminRoleId = roleMap.get("admin")!;
  const accessRoleId = roleMap.get("access")!;

  for (const u of adminUsers) {
    // system.admin
    await prisma.userResourceRole.upsert({
      where: { id: 0 },
      update: {},
      create: { userId: u.id, resourceId: sysAdminResId, roleId: adminRoleId, scopeId: null },
    });
    // system.access (deprecated — login now uses User.canLogin)
    await prisma.userResourceRole.upsert({
      where: { id: 0 },
      update: {},
      create: { userId: u.id, resourceId: sysAdminResId, roleId: accessRoleId, scopeId: null },
    });
    console.log(`   ✓ ${u.username} (id=${u.id}) → system.admin + system.access`);
  }

  // Also grant all users system.access (can login) if they had canLogin=true
  const loginUsers = await prisma.user.findMany({
    where: { canLogin: true },
    select: { id: true },
  });
  let accessCount = 0;
  for (const u of loginUsers) {
    const exists = await prisma.userResourceRole.findFirst({
      where: { userId: u.id, resourceId: sysAdminResId, roleId: accessRoleId, scopeId: null },
    });
    if (!exists) {
      await prisma.userResourceRole.create({
        data: { userId: u.id, resourceId: sysAdminResId, roleId: accessRoleId, scopeId: null },
      });
      accessCount++;
    }
  }
  console.log(`   ✓ ${accessCount} additional users granted system.access`);

  // ─── Summary ─────────────────────────────────────────
  console.log("\n=== Migration Complete ===");
  console.log(`   Resources: ${await prisma.resource.count()}`);
  console.log(`   Roles: ${await prisma.role.count()}`);
  console.log(`   UserResourceRole: ${await prisma.userResourceRole.count()}`);
  console.log(`   PositionResourceRole: ${await prisma.positionResourceRole.count()}`);
  console.log(`   DepartmentResourceRole: ${await prisma.departmentResourceRole.count()}`);
  console.log(`   SystemConfig: ${await prisma.systemConfig.count()}`);
}

main()
  .catch((e) => { console.error("Migration failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
