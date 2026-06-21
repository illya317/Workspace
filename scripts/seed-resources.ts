/**
 * 补全资源树。幂等运行。
 * 运行: npx tsx scripts/seed-resources.ts
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { RESOURCE_DEFS } from "@workspace/platform/resources";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");

function resolveDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const rawPath = databaseUrl
    ? databaseUrl.replace(/^file:/, "")
    : path.resolve(workspaceRoot, "../.workspace/data/dev.db");

  const databasePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspaceRoot, rawPath);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  return databasePath;
}

const databasePath = resolveDatabasePath();
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });

async function upsertResource(
  key: string, name: string, parentKey?: string,
  maxRoleKey: string = "admin", scopeTypes?: string | null,
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
    update: { name, maxRoleKey, scopeTypes: scopeTypes ?? null, scopeInheritanceMode, sortOrder, ...parentUpdate },
    create: { key, name, maxRoleKey, scopeTypes: scopeTypes ?? null, scopeInheritanceMode, sortOrder, ...parentCreate },
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

  await p.resource.deleteMany({ where: { key: { startsWith: "system." } } });
  await p.resource.deleteMany({ where: { key: "system" } });

  console.log(`✅ Resources seeded: ${databasePath}`);
  const all = await p.resource.findMany({ orderBy: { key: "asc" }, select: { key: true, name: true } });
  all.forEach((r) => console.log(`  ${r.key} — ${r.name}`));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
