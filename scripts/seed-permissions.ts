import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Seeding Permission System ===\n");

  // ─── Step 1: Insert PermissionCategories ───────────────────────────
  console.log("1. Seeding PermissionCategories...");
  const categories = [
    { key: "system", name: "系统权限", sortOrder: 0 },
    { key: "module", name: "模块权限", sortOrder: 1 },
    { key: "report", name: "周报权限", sortOrder: 2 },
    { key: "dept",   name: "部门权限", sortOrder: 3 },
    { key: "field",  name: "字段权限", sortOrder: 4 },
  ];

  const categoryMap = new Map<string, number>();
  for (const cat of categories) {
    const created = await prisma.permissionCategory.upsert({
      where: { key: cat.key },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: cat,
    });
    categoryMap.set(cat.key, created.id);
    console.log(`   ✓ category: ${cat.key} (id=${created.id})`);
  }

  // ─── Step 2: Insert Permissions ────────────────────────────────────
  console.log("\n2. Seeding Permissions...");
  const permissions = [
    // System
    { key: "system.login",     categoryKey: "system", name: "可登录",     description: "是否允许登录系统" },
    { key: "system.admin",     categoryKey: "system", name: "超级管理员", description: "管理后台全部权限，可查看所有数据" },
    { key: "system.any_week",  categoryKey: "system", name: "补填周报",   description: "可补填任意历史周的周报" },
    // Module
    { key: "module.hr",        categoryKey: "module", name: "人事行政",   description: "访问人事行政管理" },
    { key: "module.works",     categoryKey: "module", name: "工作清单",   description: "访问工作清单模块" },
    // Report
    { key: "report.admin",     categoryKey: "report", name: "分组管理员", description: "管理分组设置、成员和查看者" },
    { key: "report.member",    categoryKey: "report", name: "分组填写",   description: "填写和提交该分组的周报" },
    { key: "report.viewer",    categoryKey: "report", name: "分组查看",   description: "查看该分组的周报" },
    // Dept
    { key: "dept.admin",       categoryKey: "dept",   name: "部门管理员", description: "管理部门的花名册和岗位信息" },
    // Field
    { key: "field.read",       categoryKey: "field",  name: "字段读取",   description: "可查看受保护的字段" },
    { key: "field.edit",       categoryKey: "field",  name: "字段编辑",   description: "可编辑受保护的字段" },
  ];

  const permMap = new Map<string, number>();
  for (const perm of permissions) {
    const categoryId = categoryMap.get(perm.categoryKey);
    if (!categoryId) {
      console.log(`   ✗ SKIP ${perm.key}: category "${perm.categoryKey}" not found`);
      continue;
    }
    const created = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { name: perm.name, description: perm.description, categoryId },
      create: { key: perm.key, name: perm.name, description: perm.description, categoryId },
    });
    permMap.set(perm.key, created.id);
    console.log(`   ✓ permission: ${perm.key} (id=${created.id})`);
  }

  // ─── Step 3: Migrate User booleans → UserPermission ────────────────
  console.log("\n3. Migrating User booleans → UserPermission...");
  const allUsers = await prisma.user.findMany();

  const userPermMap: Record<string, string[]> = {
    isWorkListAdmin:  ["system.admin"],
    canLogin:         ["system.login"],
    canSelectAnyWeek: ["system.any_week"],
    canAccessHR:      ["module.hr"],
    canAccessWorks:   ["module.works"],
  };

  let totalGrants = 0;
  for (const user of allUsers) {
    for (const [boolField, permKeys] of Object.entries(userPermMap)) {
      const value = (user as any)[boolField];
      if (value === true) {
        for (const permKey of permKeys) {
          const permId = permMap.get(permKey);
          if (!permId) continue;
          try {
            await prisma.userPermission.create({
              data: { userId: user.id, permissionId: permId },
            });
            totalGrants++;
          } catch (e: any) {
            // Ignore duplicate unique constraint violations
            if (!e.message?.includes("Unique constraint")) {
              console.log(`   ✗ Failed for user ${user.id} permission ${permKey}: ${e.message}`);
            }
          }
        }
      }
    }
  }
  console.log(`   ✓ Created ${totalGrants} UserPermission grants from ${allUsers.length} users`);

  // ─── Step 4: Migrate DepartmentAdmin (old) → new DepartmentAdmin ───
  console.log("\n4. Migrating DepartmentAdmin (old dept1/company → departmentId)...");
  const oldDataPath = path.join(__dirname, ".old_dept_admins.json");
  if (!fs.existsSync(oldDataPath)) {
    console.log("   ⚠ No .old_dept_admins.json found — skipping DepartmentAdmin migration");
  } else {
    const oldAdmins: Array<{ id: number; dept1: string; company: string; userId: number }> =
      JSON.parse(fs.readFileSync(oldDataPath, "utf-8"));

    const allDepartments = await prisma.department.findMany({
      select: { id: true, name: true, company: true },
    });

    let matched = 0;
    let skipped = 0;
    for (const old of oldAdmins) {
      const dept = allDepartments.find(
        (d) => d.name === old.dept1 && d.company === old.company
      );
      if (!dept) {
        console.log(`   ⚠ No match: dept1="${old.dept1}" company="${old.company}" userId=${old.userId}`);
        skipped++;
        continue;
      }
      // Update the existing row (kept by db push with departmentId=null)
      await prisma.departmentAdmin.update({
        where: { id: old.id },
        data: { departmentId: dept.id },
      });
      matched++;
    }
    console.log(`   ✓ Matched ${matched} DepartmentAdmin, skipped ${skipped}`);
  }

  // ─── Step 5: Migrate ReportGroupAdmin/Member/Viewer → ReportGroupMembership ──
  console.log("\n5. Migrating ReportGroupAdmin/Member/Viewer → ReportGroupMembership...");
  const oldAdmins = await prisma.reportGroupAdmin.findMany();
  const oldMembers = await prisma.reportGroupMember.findMany();
  const oldViewers = await prisma.reportGroupViewer.findMany();

  let membershipCount = 0;

  for (const row of oldAdmins) {
    try {
      await prisma.reportGroupMembership.create({
        data: { userId: row.userId, reportGroupId: row.reportGroupId, role: "admin" },
      });
      membershipCount++;
    } catch (e: any) {
      if (!e.message?.includes("Unique constraint")) {
        console.log(`   ✗ Failed admin migrate: ${e.message}`);
      }
    }
  }
  for (const row of oldMembers) {
    try {
      await prisma.reportGroupMembership.create({
        data: { userId: row.userId, reportGroupId: row.reportGroupId, role: "member" },
      });
      membershipCount++;
    } catch (e: any) {
      if (!e.message?.includes("Unique constraint")) {
        console.log(`   ✗ Failed member migrate: ${e.message}`);
      }
    }
  }
  for (const row of oldViewers) {
    try {
      await prisma.reportGroupMembership.create({
        data: { userId: row.userId, reportGroupId: row.reportGroupId, role: "viewer" },
      });
      membershipCount++;
    } catch (e: any) {
      if (!e.message?.includes("Unique constraint")) {
        console.log(`   ✗ Failed viewer migrate: ${e.message}`);
      }
    }
  }
  console.log(`   ✓ Created ${membershipCount} ReportGroupMemberships (${oldAdmins.length} admins, ${oldMembers.length} members, ${oldViewers.length} viewers)`);

  // ─── Summary ───────────────────────────────────────────────────────
  console.log("\n=== Seed Complete ===");
  const permCount = await prisma.permission.count();
  const catCount = await prisma.permissionCategory.count();
  const upCount = await prisma.userPermission.count();
  const daCount = await prisma.departmentAdmin.count();
  const rmCount = await prisma.reportGroupMembership.count();
  console.log(`   PermissionCategories: ${catCount}`);
  console.log(`   Permissions: ${permCount}`);
  console.log(`   UserPermissions: ${upCount}`);
  console.log(`   DepartmentAdmins (migrated): ${daCount}`);
  console.log(`   ReportGroupMemberships: ${rmCount}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
