/**
 * 补全资源树。幂等运行。
 * 运行: npx tsx scripts/seed-resources.ts
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

async function upsertResource(key: string, name: string, parentKey?: string, maxRoleKey: string = "admin") {
  const parent = parentKey
    ? await p.resource.findUnique({ where: { key: parentKey }, select: { id: true } })
    : null;

  await p.resource.upsert({
    where: { key },
    update: { name, parentId: parent?.id ?? null, maxRoleKey },
    create: { key, name, parentId: parent?.id ?? null, maxRoleKey },
  });
}

async function main() {
  // ── 清理前：删掉第一次跑出来的重复资源 ──
  const dupProdInv = await p.resource.findUnique({ where: { key: "production.inventory" } });
  if (dupProdInv) {
    await p.userResourceRole.deleteMany({ where: { resourceId: dupProdInv.id } });
    await p.resource.delete({ where: { id: dupProdInv.id } });
  }

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
  await upsertResource("work.task", "工作清单", "work");
  await upsertResource("work.report", "工作汇报", "work");

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

  // inventory 子资源 → production 下
  const prodRes = await p.resource.findUnique({ where: { key: "production" } });
  const invRes = await p.resource.findUnique({ where: { key: "inventory" } });
  if (prodRes && invRes) {
    await p.resource.update({ where: { key: "inventory" }, data: { parentId: prodRes.id } });
    await p.resource.updateMany({ where: { key: { in: ["inventory.raw", "inventory.packaging", "inventory.finished", "inventory.report"] } }, data: { parentId: invRes.id } });
  }

  console.log("✅ Resources seeded");
  const all = await p.resource.findMany({ orderBy: { key: "asc" }, select: { key: true, name: true } });
  all.forEach((r) => console.log(`  ${r.key} — ${r.name}`));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
