#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const args = process.argv.slice(2);
const allowPending = args.includes("--allow-pending");

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function databasePathFromUrl(databaseUrl) {
  if (!databaseUrl) fail("DATABASE_URL is required, or pass --database-url file:/absolute/path.db");
  if (!databaseUrl.startsWith("file:")) fail(`DATABASE_URL must be a SQLite file: URL, got: ${databaseUrl}`);
  const rawPath = databaseUrl.slice("file:".length).replace(/^["']|["']$/g, "");
  if (!path.isAbsolute(rawPath)) fail(`DATABASE_URL must point to an absolute path for deploy checks: ${rawPath}`);
  return rawPath;
}

const repoRoot = path.resolve(__dirname, "../..");
const migrationsDir = path.resolve(valueAfter("--migrations-dir") || path.join(repoRoot, "prisma/migrations"));
const databaseUrl = valueAfter("--database-url") || process.env.DATABASE_URL;
const databasePath = databasePathFromUrl(databaseUrl);

if (!fs.existsSync(migrationsDir)) fail(`migrations directory not found: ${migrationsDir}`);

const migrationDirs = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (migrationDirs.length === 0) fail(`no Prisma migrations found in ${migrationsDir}`);

if (!fs.existsSync(databasePath)) {
  if (allowPending) {
    console.warn(`⚠ database does not exist yet: ${databasePath}`);
    console.warn("  prisma migrate deploy will create it if this is an intended first deploy.");
    process.exit(0);
  }
  fail(`database does not exist: ${databasePath}`);
}

const db = new Database(databasePath, { readonly: true });
try {
  const hasMigrationTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'")
    .get();

  if (!hasMigrationTable) {
    if (allowPending) {
      console.warn("⚠ _prisma_migrations table does not exist yet; migrate deploy has not initialized this database.");
      process.exit(0);
    }
    fail("_prisma_migrations table does not exist");
  }

  const rows = db
    .prepare("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name")
    .all();
  const failed = rows.filter((row) => row.finished_at == null && row.rolled_back_at == null);
  if (failed.length > 0) {
    console.error("Failed Prisma migrations are present:");
    for (const row of failed) console.error(`  - ${row.migration_name}`);
    console.error("");
    console.error("Resolve or roll back the failed migration before deploying again, then rerun prisma migrate deploy.");
    process.exit(1);
  }

  const finished = new Set(rows.filter((row) => row.finished_at != null).map((row) => row.migration_name));
  const pending = migrationDirs.filter((migrationName) => !finished.has(migrationName));
  if (pending.length > 0 && !allowPending) {
    console.error("Pending Prisma migrations:");
    for (const migrationName of pending) console.error(`  - ${migrationName}`);
    process.exit(1);
  }

  ok(`Prisma deploy status ok (${finished.size} applied, ${pending.length} pending)`);
} finally {
  db.close();
}
