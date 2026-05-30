/**
 * 补全资源树。幂等运行。
 * 运行: npx tsx scripts/seed-resources.ts
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

async function upsertResource(
  key: string, name: string, parentKey?: string,
  maxRoleKey: string = "admin", scopeTypes?: string | null,
  scopeInheritanceMode: string = "inherit",
) {
  const parent = parentKey
    ? await p.resource.findUnique({ where: { key: parentKey }, select: { id: true } })
    : null;

  const parentConnect = parent ? { parent: { connect: { id: parent.id } } } : {};

  await p.resource.upsert({
    where: { key },
    update: { name, maxRoleKey, scopeTypes: scopeTypes ?? null, scopeInheritanceMode, ...parentConnect },
    create: { key, name, maxRoleKey, scopeTypes: scopeTypes ?? null, scopeInheritanceMode, ...parentConnect },
  });
}

async function main() {
  // ── 顶层根资源 ──
  await upsertResource("system", "系统管理");
  await upsertResource("system.user", "用户管理", "system");
  await upsertResource("system.permission", "权限管理", "system");
  await upsertResource("system.audit", "审计日志", "system");
  await upsertResource("system.config", "系统配置", "system");

  await upsertResource("people", "人事管理");
  await upsertResource("people.roster", "人事基础资料", "people");
  await upsertResource("people.performance", "考勤绩效", "people");
  await upsertResource("people.analytics", "人力分析", "people");

  await upsertResource("finance", "财务管理");
  await upsertResource("finance.ledger", "总账基础", "finance");
  await upsertResource("finance.statement", "财务报表", "finance");
  await upsertResource("finance.budget", "预算管理", "finance");
  await upsertResource("finance.analysis", "财务分析", "finance");
  await upsertResource("finance.cost", "成本管理", "finance");
  await upsertResource("finance.import", "数据导入", "finance");

  await upsertResource("administration", "行政管理");
  await upsertResource("administration.contract", "合同台账", "administration");

  await upsertResource("production", "生产管理");
  await upsertResource("production.inventory", "库存管理", "production");
  await upsertResource("production.inventory.raw", "原辅料", "production.inventory");
  await upsertResource("production.inventory.packaging", "包装材料", "production.inventory");
  await upsertResource("production.inventory.finished", "成品", "production.inventory");
  await upsertResource("production.inventory.report", "库存报表", "production.inventory");

  await upsertResource("docs", "文档中心", undefined, "access");
  await upsertResource("docs.positions", "岗位说明书", "docs");
  await upsertResource("docs.company", "公司管理", "docs");
  await upsertResource("docs.expense", "报销规范", "docs");
  await upsertResource("docs.api", "API 接入指南", "docs");

  await upsertResource("library", "资料库", undefined, "access");

  await upsertResource("external", "外部关系", undefined, "delete");
  await upsertResource("external.investor", "投资人关系", "external");
  await upsertResource("external.customer", "客户管理", "external");
  await upsertResource("external.supplier", "供应商管理", "external");

  await upsertResource("work", "工作");
  // Work — entry/grouping only, data permissions on leaf resources
  await upsertResource("work.task", "工作清单", "work");
  await upsertResource("work.report", "工作汇报", "work");

  // Work leaf resources — self_only scoped data permissions
  await upsertResource("work.task.department", "部门工作清单", "work.task", "admin", "department", "self_only");
  await upsertResource("work.task.personal", "个人工作清单", "work.task");

  await upsertResource("work.report.department", "部门工作汇报", "work.report", "admin", "department", "self_only");
  await upsertResource("work.report.project", "项目工作汇报", "work.report", "admin", "project", "self_only");
  await upsertResource("work.report.personal", "个人工作汇报", "work.report");

  await upsertResource("legal", "法务", undefined, "access");
  await upsertResource("legal.chat", "法务咨询", "legal");
  await upsertResource("legal.document", "法律文书", "legal");

  // ── 迁移旧 grants 到新资源 ──
  const MIGRATIONS: Record<string, string> = {
    "contract": "administration",
    "contract.list": "administration.contract",
    "contract.edit": "administration.contract",
    "docs.policy": "docs",
    "docs.manual": "docs",
    "docs.form": "docs",
    "people.employee": "people.roster",
    "people.org": "people",
  };

  for (const [oldKey, newKey] of Object.entries(MIGRATIONS)) {
    const oldRes = await p.resource.findUnique({ where: { key: oldKey }, select: { id: true } });
    const newRes = await p.resource.findUnique({ where: { key: newKey }, select: { id: true } });
    if (!oldRes || !newRes) continue;

    // 迁移 grants（保留 scopeId，唯一键: userId/resourceId/roleId/scopeId）
    const oldGrants = await p.userResourceRole.findMany({ where: { resourceId: oldRes.id } });
    for (const g of oldGrants) {
      const exists = await p.userResourceRole.findFirst({
        where: { userId: g.userId, resourceId: newRes.id, roleId: g.roleId, scopeId: g.scopeId ?? null },
      });
      if (!exists) {
        await p.userResourceRole.create({ data: { userId: g.userId, resourceId: newRes.id, roleId: g.roleId, scopeId: g.scopeId } });
      }
    }
    const oldPosGrants = await p.positionResourceRole.findMany({ where: { resourceId: oldRes.id } });
    for (const g of oldPosGrants) {
      const exists = await p.positionResourceRole.findFirst({
        where: { positionId: g.positionId, resourceId: newRes.id, roleId: g.roleId, scopeId: g.scopeId ?? null },
      });
      if (!exists) {
        await p.positionResourceRole.create({ data: { positionId: g.positionId, resourceId: newRes.id, roleId: g.roleId, scopeId: g.scopeId } });
      }
    }
    const oldDeptGrants = await p.departmentResourceRole.findMany({ where: { resourceId: oldRes.id } });
    for (const g of oldDeptGrants) {
      const exists = await p.departmentResourceRole.findFirst({
        where: { departmentId: g.departmentId, resourceId: newRes.id, roleId: g.roleId, scopeId: g.scopeId ?? null },
      });
      if (!exists) {
        await p.departmentResourceRole.create({ data: { departmentId: g.departmentId, resourceId: newRes.id, roleId: g.roleId, scopeId: g.scopeId } });
      }
    }

    // 删旧 grants + 旧资源
    await p.userResourceRole.deleteMany({ where: { resourceId: oldRes.id } });
    await p.positionResourceRole.deleteMany({ where: { resourceId: oldRes.id } });
    await p.departmentResourceRole.deleteMany({ where: { resourceId: oldRes.id } });
    await p.resource.delete({ where: { id: oldRes.id } });
  }

  // Repair orphaned production.inventory children (from old buggy seed)
  await p.$executeRawUnsafe(`
    UPDATE Resource SET parentId = (SELECT id FROM Resource WHERE key = 'production.inventory')
    WHERE key IN ('production.inventory.raw', 'production.inventory.packaging', 'production.inventory.finished', 'production.inventory.report')
      AND parentId IS NULL
  `);

  console.log("✅ Resources seeded");
  const all = await p.resource.findMany({ orderBy: { key: "asc" }, select: { key: true, name: true } });
  all.forEach((r) => console.log(`  ${r.key} — ${r.name}`));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
