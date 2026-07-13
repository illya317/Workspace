/**
 * 补全资源树。幂等运行。
 * 运行: npx tsx scripts/seed-resources.ts
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { RESOURCE_DEFS } from "../packages/platform/resources";
import {
  getPermissionResourceActionPolicy,
  serializePermissionScopeTypes,
} from "../packages/platform/permission-resource-policy";

function requireDatabaseUrl() {
  const databaseUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error("DIRECT_URL or DATABASE_URL must use PostgreSQL");
  }
  return databaseUrl;
}

const databaseUrl = requireDatabaseUrl();
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, application_name: "workspace-resource-seed" }) });
const activeResourceKeys = RESOURCE_DEFS.map((resource) => resource.key);

async function upsertResource(
  key: string, name: string, parentKey?: string,
  scopeTypes?: string | null,
  scopeInheritanceMode: string = "inherit", sortOrder: number = 0,
) {
  const parent = parentKey
    ? await p.resource.findUnique({ where: { key: parentKey }, select: { id: true } })
    : null;

  const parentCreate = parent ? { parent: { connect: { id: parent.id } } } : {};
  const parentUpdate = parentKey
    ? parentCreate
    : { parent: { disconnect: true } };

  await p.resource.upsert({
    where: { key },
    update: { name, scopeTypes: scopeTypes ?? null, scopeInheritanceMode, sortOrder, ...parentUpdate },
    create: { key, name, scopeTypes: scopeTypes ?? null, scopeInheritanceMode, sortOrder, ...parentCreate },
  });
}

async function main() {
  for (const resource of RESOURCE_DEFS) {
    const policy = getPermissionResourceActionPolicy(resource.key);
    await upsertResource(
      resource.key,
      resource.name,
      resource.parentKey,
      serializePermissionScopeTypes(policy?.scopeTypes),
      policy?.scopeInheritanceMode ?? "inherit",
      resource.sortOrder ?? 0,
    );
  }

  const staleResources = await p.resource.findMany({
    where: { key: { notIn: activeResourceKeys } },
    select: { id: true },
  });
  const staleResourceIds = staleResources.map((resource) => resource.id);
  if (staleResourceIds.length > 0) {
    await p.userResourceActionGrant.deleteMany({ where: { resourceId: { in: staleResourceIds } } });
    await p.positionResourceActionGrant.deleteMany({ where: { resourceId: { in: staleResourceIds } } });
    await p.departmentResourceActionGrant.deleteMany({ where: { resourceId: { in: staleResourceIds } } });
    for (;;) {
      const deleted = await p.resource.deleteMany({
        where: {
          key: { notIn: activeResourceKeys },
          children: { none: {} },
        },
      });
      if (deleted.count === 0) break;
    }
  }

  console.log("✅ Resources seeded in PostgreSQL");
  const all = await p.resource.findMany({ orderBy: { key: "asc" }, select: { key: true, name: true } });
  all.forEach((r) => console.log(`  ${r.key} — ${r.name}`));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => p.$disconnect());
