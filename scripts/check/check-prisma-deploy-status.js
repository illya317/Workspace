#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const args = process.argv.slice(2);
const allowPending = args.includes("--allow-pending");

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function fail(message) {
  throw new Error(message);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function requirePostgresqlUrl(databaseUrl) {
  if (!databaseUrl) fail("DATABASE_URL is required, or pass --database-url postgresql://...");
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) fail("DATABASE_URL must use postgresql:// or postgres://");
  return databaseUrl;
}

async function main() {
  const repoRoot = path.resolve(__dirname, "../..");
  const migrationsDir = path.resolve(valueAfter("--migrations-dir") || path.join(repoRoot, "prisma/migrations"));
  const databaseUrl = requirePostgresqlUrl(valueAfter("--database-url") || process.env.DIRECT_URL || process.env.DATABASE_URL);
  if (!fs.existsSync(migrationsDir)) fail(`migrations directory not found: ${migrationsDir}`);

  const migrationDirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (migrationDirs.length === 0) fail(`no Prisma migrations found in ${migrationsDir}`);

  const client = new Client({ connectionString: databaseUrl, application_name: "workspace-prisma-deploy-status" });
  await client.connect();
  try {
    const migrationTable = await client.query("SELECT to_regclass('public._prisma_migrations') AS name");
    if (!migrationTable.rows[0].name) {
      if (allowPending) {
        console.warn("⚠ _prisma_migrations does not exist; migrate deploy must initialize this PostgreSQL database.");
        return;
      }
      fail("_prisma_migrations table does not exist");
    }

    const result = await client.query(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY migration_name
    `);
    const failed = result.rows.filter((row) => row.finished_at == null && row.rolled_back_at == null);
    if (failed.length > 0) fail(`Failed Prisma migrations are present: ${failed.map((row) => row.migration_name).join(", ")}`);

    const finished = new Set(result.rows.filter((row) => row.finished_at != null).map((row) => row.migration_name));
    const unexpected = [...finished].filter((migrationName) => !migrationDirs.includes(migrationName));
    if (unexpected.length > 0) fail(`Database contains migrations absent from the release: ${unexpected.join(", ")}`);
    const pending = migrationDirs.filter((migrationName) => !finished.has(migrationName));
    if (pending.length > 0 && !allowPending) fail(`Pending Prisma migrations: ${pending.join(", ")}`);

    const constraints = await client.query(`
      SELECT count(*) FILTER (WHERE NOT convalidated)::int AS unvalidated
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
    `);
    if (constraints.rows[0].unvalidated !== 0) fail(`PostgreSQL contains ${constraints.rows[0].unvalidated} unvalidated constraints`);
    ok(`Prisma deploy status ok (${finished.size} applied, ${pending.length} pending, 0 unvalidated constraints)`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
