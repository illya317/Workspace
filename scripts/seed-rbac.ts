import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== RBAC Migration Seed ===\n");

  // ─── Step 1: Resource ───────────────────────────────────
  console.log("1. Seeding Resource...");
  const resources = [
    { key: "system", name: "系统功能", description: "登录、用户权限等系统级功能" },
    { key: "module.hr", name: "人事行政", description: "访问人事行政管理 /hr" },
    { key: "module.works", name: "工作清单", description: "访问工作清单 /works" },
    { key: "department", name: "部门", description: "部门管理权限" },
    { key: "report", name: "周报", description: "周报填写、补填与查看权限" },
    { key: "report_group", name: "周报分组", description: "周报分组管理权限" },
  ];
  const resourceMap = new Map<string, number>();
  for (const r of resources) {
    const created = await prisma.resource.upsert({
      where: { key: r.key },
      update: r,
      create: r,
    });
    resourceMap.set(r.key, created.id);
    console.log(`   ✓ ${r.key} (id=${created.id})`);
  }

  // ─── Step 2: Role ───────────────────────────────────────
  console.log("\n2. Seeding Role...");
  const roles = [
    { key: "access", name: "可进入", description: "系统/模块级别开关" },
    { key: "admin", name: "管理", description: "编辑数据 + 分配该资源权限给他人" },
    { key: "write", name: "编辑", description: "可修改数据" },
    { key: "read", name: "只读", description: "可查看数据" },
    { key: "write_any_week", name: "补填任意周报", description: "可填写/补填任意周的周报" },
  ];
  const roleMap = new Map<string, number>();
  for (const r of roles) {
    const created = await prisma.role.upsert({
      where: { key: r.key },
      update: r,
      create: r,
    });
    roleMap.set(r.key, created.id);
    console.log(`   ✓ ${r.key} (id=${created.id})`);
  }

  // ─── Step 3: WorkItem migration ──────────────────────────
  console.log("\n4. Migrating WorkItem departmentId → targetType/targetId...");
  const workItems = await prisma.workItem.findMany();
  let wiCount = 0;
  for (const wi of workItems) {
    const oldDeptId = (wi as any).departmentId as number | undefined;
    await prisma.workItem.update({
      where: { id: wi.id },
      data: {
        targetType: oldDeptId ? "department" : "personal",
        targetId: oldDeptId || undefined,
      },
    });
    wiCount++;
  }
  console.log(`   ✓ ${wiCount} work items`);

  // ─── Step 4: UserPermission → UserResourceRole ──────────
  console.log("\n5. Migrating User booleans → UserResourceRole (scopeId=null)...");
  const backupPath = require("path").join(__dirname, ".rbac-migration-backup.json");
  let backup: any;
  try {
    backup = JSON.parse(require("fs").readFileSync(backupPath, "utf-8"));
  } catch {
    console.log("   ⚠ No backup file, skipping boolean migration");
    backup = { users: [] };
  }

  const userIdToPerms = new Map<number, string[]>();
  const fieldMap: Record<string, string> = {
    isWorkListAdmin: "system",
    canLogin: "system",
    canSelectAnyWeek: "report",
    canAccessHR: "module.hr",
    canAccessWorks: "module.works",
  };

  // Also load from backup's userPermissions
  const backupPermKeyToResource = new Map<string, string>();
  // Map old Permission keys → new Resource keys
  for (const [old, res] of Object.entries({
    "system.login": "system",
    "system.admin": "system",
    "system.any_week": "system",
    "module.hr": "module.hr",
    "module.works": "module.works",
    "report.admin": "report_group",
    "report.member": "report_group",
    "report.viewer": "report_group",
    "dept.admin": "department",
    "field.read": "field",
    "field.edit": "field",
  })) {
    backupPermKeyToResource.set(old, res);
  }

  const backupPermKeyToRole = new Map<string, string>();
  for (const [old, role] of Object.entries({
    "system.login": "access",
    "system.admin": "access",  // admin means both access + admin on system
    "system.any_week": "access",
    "module.hr": "access",
    "module.works": "access",
    "report.admin": "admin",
    "report.write": "write",
    "report.read": "read",
    "dept.admin": "admin",
    "field.read": "read",
    "field.edit": "write",
  })) {
    backupPermKeyToRole.set(old, role);
  }

  const boolToRole: Record<string, string> = {
    isWorkListAdmin: "admin",
    canLogin: "access",
    canSelectAnyWeek: "write_any_week",
    canAccessHR: "access",
    canAccessWorks: "access",
  };

  let urrCount = 0;

  // Migrate from User booleans
  for (const user of backup.users || []) {
    for (const [boolField, resourceKey] of Object.entries(fieldMap)) {
      if ((user as any)[boolField] === true) {
        const resId = resourceMap.get(resourceKey);
        const roleId = roleMap.get(boolToRole[boolField] || "access");
        if (!resId || !roleId) continue;
        try {
          await prisma.userResourceRole.create({
            data: { userId: user.id, resourceId: resId, roleId, scopeId: null },
          });
          urrCount++;
        } catch { /* skip duplicates */ }
      }
    }
  }

  // Also migrate old UserPermission records from backup
  if (backup.userPermissions) {
    for (const up of backup.userPermissions) {
      const oldPerm = backup.permissions?.find((p: any) => p.id === up.permissionId);
      const permKey = oldPerm?.key;
      if (!permKey) continue;

      const resourceKey = backupPermKeyToResource.get(permKey);
      const roleKey = backupPermKeyToRole.get(permKey);
      if (!resourceKey || !roleKey) continue;

      const resId = resourceMap.get(resourceKey);
      const roleId = roleMap.get(roleKey);
      if (!resId || !roleId) continue;

      try {
        await prisma.userResourceRole.create({
          data: { userId: up.userId, resourceId: resId, roleId, scopeId: null },
        });
        urrCount++;
      } catch { /* skip duplicates */ }
    }
  }
  console.log(`   ✓ ${urrCount} UserResourceRole grants`);

  // ─── Step 5: DepartmentAdmin → UserResourceRole ──────────
  console.log("\n6. Migrating DepartmentAdmin → UserResourceRole...");
  const deptResId = resourceMap.get("department")!;
  const adminRoleId = roleMap.get("admin")!;
  let daCount = 0;

  if (backup.departmentAdmins) {
    for (const da of backup.departmentAdmins) {
      try {
        await prisma.userResourceRole.create({
          data: {
            userId: da.userId,
            resourceId: deptResId,
            roleId: adminRoleId,
            scopeId: String(da.departmentId || da.id),
          },
        });
        daCount++;
      } catch { /* skip */ }
    }
  }
  console.log(`   ✓ ${daCount} department admins`);

  // ─── Step 6: ReportGroupMembership → UserResourceRole ────
  console.log("\n7. Migrating ReportGroupMembership → UserResourceRole...");
  const rgResId = resourceMap.get("report_group")!;
  let rgCount = 0;

  if (backup.reportGroupMemberships) {
    for (const rm of backup.reportGroupMemberships) {
      const roleKey = rm.role || "write";
      const roleId = roleMap.get(roleKey);
      if (!roleId) continue;
      try {
        await prisma.userResourceRole.create({
          data: {
            userId: rm.userId,
            resourceId: rgResId,
            roleId,
            scopeId: String(rm.reportGroupId),
          },
        });
        rgCount++;
      } catch { /* skip */ }
    }
  }
  console.log(`   ✓ ${rgCount} report group memberships`);

  // ─── Step 7: FieldPermission → UserResourceRole ──────────
  console.log("\n8. Migrating FieldPermission → UserResourceRole...");
  const fieldResId = resourceMap.get("field")!;
  let fpCount = 0;

  if (backup.fieldPermissions) {
    for (const fp of backup.fieldPermissions) {
      const roleKey = fp.canEdit ? "write" : "read";
      const roleId = roleMap.get(roleKey);
      if (!roleId) continue;
      try {
        await prisma.userResourceRole.create({
          data: {
            userId: fp.userId,
            resourceId: fieldResId,
            roleId,
            scopeId: fp.field,
          },
        });
        fpCount++;
      } catch { /* skip */ }
    }
  }

  if (backup.globalFieldPermissions) {
    for (const gfp of backup.globalFieldPermissions) {
      const roleKey = gfp.canEdit ? "write" : "read";
      const roleId = roleMap.get(roleKey);
      if (!roleId) continue;
      try {
        await prisma.userResourceRole.create({
          data: {
            userId: 0, // global default
            resourceId: fieldResId,
            roleId,
            scopeId: gfp.field,
          },
        });
        fpCount++;
      } catch { /* skip */ }
    }
  }
  console.log(`   ✓ ${fpCount} field permissions`);

  // ─── Summary ────────────────────────────────────────────
  console.log("\n=== Migration Complete ===");
  console.log(`   Resources: ${await prisma.resource.count()}`);
  console.log(`   Roles: ${await prisma.role.count()}`);
  console.log(`   UserResourceRoles: ${await prisma.userResourceRole.count()}`);
}

main()
  .catch((e) => { console.error("Migration failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
