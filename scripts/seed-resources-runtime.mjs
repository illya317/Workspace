#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

try {
  await import("dotenv/config");
} catch {
  // Production sources .env before invoking this standalone helper.
}

function requireDatabaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) throw new Error("DIRECT_URL or DATABASE_URL must use PostgreSQL");
  return value;
}

function loadManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.resources) || manifest.resources.length === 0) {
    throw new Error(`Invalid resource manifest: ${manifestPath}`);
  }
  return manifest.resources.map((resource) => {
    if (!resource.key || !resource.name) throw new Error(`Invalid resource entry: ${JSON.stringify(resource)}`);
    return {
      key: resource.key,
      name: resource.name,
      parentKey: resource.parentKey || null,
      scopeTypes: resource.scopeTypes || null,
      scopeInheritanceMode: resource.scopeInheritanceMode || "inherit",
      sortOrder: Number.isFinite(resource.sortOrder) ? resource.sortOrder : 0,
    };
  });
}

async function seedResources(client, resources) {
  const activeKeys = resources.map((resource) => resource.key);
  for (const resource of resources) {
    let parentId = null;
    if (resource.parentKey) {
      const parent = await client.query('SELECT id FROM "Resource" WHERE key = $1', [resource.parentKey]);
      if (parent.rowCount !== 1) throw new Error(`Parent resource not found: ${resource.parentKey}`);
      parentId = parent.rows[0].id;
    }
    await client.query(`
      INSERT INTO "Resource" (key, name, "parentId", "scopeTypes", "scopeInheritanceMode", "sortOrder")
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        "parentId" = EXCLUDED."parentId",
        "scopeTypes" = EXCLUDED."scopeTypes",
        "scopeInheritanceMode" = EXCLUDED."scopeInheritanceMode",
        "sortOrder" = EXCLUDED."sortOrder"
    `, [resource.key, resource.name, parentId, resource.scopeTypes, resource.scopeInheritanceMode, resource.sortOrder]);
  }

  const stale = await client.query('SELECT id FROM "Resource" WHERE NOT (key = ANY($1::text[]))', [activeKeys]);
  const staleIds = stale.rows.map((row) => row.id);
  if (staleIds.length > 0) {
    for (const table of ["UserResourceActionGrant", "PositionResourceActionGrant", "DepartmentResourceActionGrant"]) {
      await client.query(`DELETE FROM "${table}" WHERE "resourceId" = ANY($1::int[])`, [staleIds]);
    }
    for (;;) {
      const deleted = await client.query(`
        DELETE FROM "Resource" AS candidate
        WHERE NOT (candidate.key = ANY($1::text[]))
          AND NOT EXISTS (SELECT 1 FROM "Resource" AS child WHERE child."parentId" = candidate.id)
      `, [activeKeys]);
      if (deleted.rowCount === 0) break;
    }
  }
}

async function main() {
  const manifestPath = path.resolve(process.argv[2] || "resource-defs.json");
  const resources = loadManifest(manifestPath);
  const client = new pg.Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-resource-seed-runtime" });
  await client.connect();
  try {
    await client.query("BEGIN");
    await seedResources(client, resources);
    await client.query("COMMIT");
    const rows = await client.query('SELECT key, name FROM "Resource" ORDER BY key');
    console.log(`Resources seeded in PostgreSQL: ${rows.rowCount}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
