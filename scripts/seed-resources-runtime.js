#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function resolveDatabasePath() {
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!databaseUrl.startsWith("file:")) throw new Error(`DATABASE_URL must use file: ${databaseUrl}`);
  const databasePath = databaseUrl.replace(/^file:/, "").replace(/^"|"$/g, "");
  if (!path.isAbsolute(databasePath)) throw new Error(`DATABASE_URL must be absolute: ${databasePath}`);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  return databasePath;
}

function loadManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.resources)) throw new Error(`Invalid resource manifest: ${manifestPath}`);
  return manifest.resources.map((resource) => {
    if (!resource.key || !resource.name) throw new Error(`Invalid resource entry: ${JSON.stringify(resource)}`);
    return {
      key: resource.key,
      name: resource.name,
      parentKey: resource.parentKey || null,
      maxRoleKey: resource.maxRoleKey || "admin",
      sortOrder: Number.isFinite(resource.sortOrder) ? resource.sortOrder : 0,
    };
  });
}

function placeholders(values) {
  return values.map(() => "?").join(",");
}

function seedResources(db, resources) {
  const activeKeys = resources.map((resource) => resource.key);
  const selectResource = db.prepare("SELECT id FROM Resource WHERE key = ?");
  const insertResource = db.prepare(`
    INSERT INTO Resource (key, name, parentId, maxRoleKey, scopeTypes, scopeInheritanceMode, sortOrder)
    VALUES (?, ?, ?, ?, NULL, 'inherit', ?)
  `);
  const updateResource = db.prepare(`
    UPDATE Resource
    SET name = ?, parentId = ?, maxRoleKey = ?, scopeTypes = NULL, scopeInheritanceMode = 'inherit', sortOrder = ?
    WHERE key = ?
  `);

  for (const resource of resources) {
    const parentId = resource.parentKey ? selectResource.get(resource.parentKey)?.id : null;
    if (resource.parentKey && !parentId) throw new Error(`Parent resource not found: ${resource.parentKey}`);

    const existing = selectResource.get(resource.key);
    if (existing) {
      updateResource.run(resource.name, parentId, resource.maxRoleKey, resource.sortOrder, resource.key);
    } else {
      insertResource.run(resource.key, resource.name, parentId, resource.maxRoleKey, resource.sortOrder);
    }
  }

  const activeKeySql = placeholders(activeKeys);
  const staleResources = db.prepare(`SELECT id FROM Resource WHERE key NOT IN (${activeKeySql})`).all(...activeKeys);
  const staleIds = staleResources.map((resource) => resource.id);
  if (staleIds.length > 0) {
    const staleIdSql = placeholders(staleIds);
    db.prepare(`DELETE FROM UserResourceRole WHERE resourceId IN (${staleIdSql})`).run(...staleIds);
    db.prepare(`DELETE FROM PositionResourceRole WHERE resourceId IN (${staleIdSql})`).run(...staleIds);
    db.prepare(`DELETE FROM DepartmentResourceRole WHERE resourceId IN (${staleIdSql})`).run(...staleIds);

    for (;;) {
      const deleted = db.prepare(`
        DELETE FROM Resource
        WHERE key NOT IN (${activeKeySql})
          AND id NOT IN (SELECT DISTINCT parentId FROM Resource WHERE parentId IS NOT NULL)
      `).run(...activeKeys);
      if (deleted.changes === 0) break;
    }
  }
}

function main() {
  const manifestPath = path.resolve(process.argv[2] || "resource-defs.json");
  const resources = loadManifest(manifestPath);
  const databasePath = resolveDatabasePath();
  const db = new Database(databasePath);

  try {
    db.transaction(() => seedResources(db, resources))();
    console.log(`Resources seeded: ${databasePath}`);
    for (const row of db.prepare("SELECT key, name FROM Resource ORDER BY key ASC").all()) {
      console.log(`  ${row.key} - ${row.name}`);
    }
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
