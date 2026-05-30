/**
 * 补全资源树。幂等运行。
 * 运行: npx tsx scripts/seed-resources.ts
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

async function upsertResource(key: string, name: string, parentKey?: string) {
  const parent = parentKey
    ? await p.resource.findUnique({ where: { key: parentKey }, select: { id: true } })
    : null;

  await p.resource.upsert({
    where: { key },
    update: { name, parentId: parent?.id ?? null },
    create: { key, name, parentId: parent?.id ?? null },
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

  await upsertResource("docs", "文档中心");
  await upsertResource("docs.positions", "岗位说明书", "docs");
  await upsertResource("docs.company", "公司管理", "docs");
  await upsertResource("docs.expense", "报销规范", "docs");
  await upsertResource("docs.api", "API 接入指南", "docs");

  await upsertResource("library", "资料库");

  await upsertResource("external", "外部关系");
  await upsertResource("external.investor", "投资人关系", "external");
  await upsertResource("external.customer", "客户管理", "external");
  await upsertResource("external.supplier", "供应商管理", "external");

  await upsertResource("work", "工作");
  await upsertResource("work.task", "工作清单", "work");
  await upsertResource("work.report", "工作汇报", "work");

  await upsertResource("legal", "法务");
  await upsertResource("legal.chat", "法务咨询", "legal");
  await upsertResource("legal.document", "法律文书", "legal");

  // ── 清理旧资源（先删关联 grants，再删资源） ──
  const OLD_KEYS = ["contract", "contract.list", "contract.edit", "docs.policy", "docs.manual", "docs.form", "people.employee", "people.org"];
  const oldIds = (await p.resource.findMany({ where: { key: { in: OLD_KEYS } }, select: { id: true } })).map((r) => r.id);

  if (oldIds.length > 0) {
    await p.userResourceRole.deleteMany({ where: { resourceId: { in: oldIds } } });
    await p.positionResourceRole.deleteMany({ where: { resourceId: { in: oldIds } } });
    await p.departmentResourceRole.deleteMany({ where: { resourceId: { in: oldIds } } });
    await p.resource.deleteMany({ where: { id: { in: oldIds } } });
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
