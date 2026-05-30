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
  scopeInheritanceMode: string = "inherit", sortOrder: number = 0,
) {
  const parent = parentKey
    ? await p.resource.findUnique({ where: { key: parentKey }, select: { id: true } })
    : null;

  const parentConnect = parent ? { parent: { connect: { id: parent.id } } } : {};

  await p.resource.upsert({
    where: { key },
    update: { name, maxRoleKey, scopeTypes: scopeTypes ?? null, scopeInheritanceMode, sortOrder, ...parentConnect },
    create: { key, name, maxRoleKey, scopeTypes: scopeTypes ?? null, scopeInheritanceMode, sortOrder, ...parentConnect },
  });
}

async function main() {
  // Sort order matches nav tab: 工作汇报→人事→行政→财务→生产→外部→文档→资料库→法务→系统
  await upsertResource("work", "工作汇报", undefined, "admin", undefined, "inherit", 0);
  await upsertResource("work.task", "工作清单", "work", "admin", undefined, "inherit", 0);
  await upsertResource("work.report", "工作汇报", "work", "admin", undefined, "inherit", 1);

  await upsertResource("people", "人事管理", undefined, "admin", undefined, "inherit", 1);
  await upsertResource("people.roster", "人事基础资料", "people", "admin", undefined, "inherit", 0);
  await upsertResource("people.performance", "考勤绩效", "people", "admin", undefined, "inherit", 1);
  await upsertResource("people.analytics", "人力分析", "people", "admin", undefined, "inherit", 2);

  await upsertResource("administration", "行政管理", undefined, "admin", undefined, "inherit", 2);
  await upsertResource("administration.contract", "合同台账", "administration", "admin", undefined, "inherit", 0);

  await upsertResource("finance", "财务管理", undefined, "admin", undefined, "inherit", 3);
  await upsertResource("finance.ledger", "总账基础", "finance", "admin", undefined, "inherit", 0);
  await upsertResource("finance.statement", "财务报表", "finance", "admin", undefined, "inherit", 1);
  await upsertResource("finance.budget", "预算管理", "finance", "admin", undefined, "inherit", 2);
  await upsertResource("finance.analysis", "财务分析", "finance", "admin", undefined, "inherit", 3);
  await upsertResource("finance.cost", "成本管理", "finance", "admin", undefined, "inherit", 4);
  await upsertResource("finance.import", "数据导入", "finance", "admin", undefined, "inherit", 5);

  await upsertResource("production", "生产管理", undefined, "admin", undefined, "inherit", 4);
  await upsertResource("production.inventory", "库存管理", "production", "admin", undefined, "inherit", 0);
  await upsertResource("production.inventory.raw", "原辅料", "production.inventory", "admin", undefined, "inherit", 0);
  await upsertResource("production.inventory.packaging", "包装材料", "production.inventory", "admin", undefined, "inherit", 1);
  await upsertResource("production.inventory.finished", "成品", "production.inventory", "admin", undefined, "inherit", 2);
  await upsertResource("production.inventory.report", "库存报表", "production.inventory", "admin", undefined, "inherit", 3);

  await upsertResource("external", "外部关系", undefined, "delete", undefined, "inherit", 5);
  await upsertResource("external.investor", "投资人关系", "external", "delete", undefined, "inherit", 0);
  await upsertResource("external.customer", "客户管理", "external", "delete", undefined, "inherit", 1);
  await upsertResource("external.supplier", "供应商管理", "external", "delete", undefined, "inherit", 2);

  await upsertResource("docs", "文档中心", undefined, "access", undefined, "inherit", 6);
  await upsertResource("docs.positions", "岗位说明书", "docs", "access", undefined, "inherit", 0);
  await upsertResource("docs.company", "公司管理", "docs", "access", undefined, "inherit", 1);
  await upsertResource("docs.expense", "报销规范", "docs", "access", undefined, "inherit", 2);
  await upsertResource("docs.api", "API 接入指南", "docs", "access", undefined, "inherit", 3);

  await upsertResource("library", "资料库", undefined, "access", undefined, "inherit", 7);

  await upsertResource("legal", "法务", undefined, "access", undefined, "inherit", 8);
  await upsertResource("legal.chat", "法务咨询", "legal", "access", undefined, "inherit", 0);
  await upsertResource("legal.document", "法律文书", "legal", "access", undefined, "inherit", 1);

  await upsertResource("system", "系统管理", undefined, "admin", undefined, "inherit", 9);
  await upsertResource("system.audit", "审计日志", "system", "admin", undefined, "inherit", 0);
  await upsertResource("system.agent", "智能体", "system", "access", undefined, "inherit", 1);
  await upsertResource("system.api", "API接入", "system", "access", undefined, "inherit", 2);

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
