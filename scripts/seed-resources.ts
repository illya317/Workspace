/**
 * 补全资源树。幂等运行。
 * 运行: npx tsx scripts/seed-resources.ts
 */
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { RESOURCE_DEFS } from "@workspace/platform/resources";

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
  for (const resource of RESOURCE_DEFS) {
    await upsertResource(
      resource.key,
      resource.name,
      resource.parentKey,
      resource.maxRoleKey ?? "admin",
      undefined,
      "inherit",
      resource.sortOrder ?? 0,
    );
  }

  console.log("✅ Resources seeded");
  const all = await p.resource.findMany({ orderBy: { key: "asc" }, select: { key: true, name: true } });
  all.forEach((r) => console.log(`  ${r.key} — ${r.name}`));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
