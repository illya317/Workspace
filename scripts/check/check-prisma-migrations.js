#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const prismaDir = path.join(repoRoot, "prisma");
const migrationsDir = path.join(prismaDir, "migrations");
const schemaPath = path.join(prismaDir, "schema.prisma");
const configPath = path.join(repoRoot, "prisma.config.ts");
const lockPath = path.join(migrationsDir, "migration_lock.toml");
const staticOnly = process.argv.slice(2).includes("--static");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function scanPostgresqlMigrationSql(migrationName, sql) {
  const violations = [];
  const checks = [
    {
      pattern: /\bPRAGMA\b/i,
      message: "PRAGMA is SQLite-only",
    },
    {
      pattern: /\bAUTOINCREMENT\b/i,
      message: "AUTOINCREMENT is SQLite-only; use PostgreSQL identity/sequence syntax",
    },
    {
      pattern: /\bsqlite_(?:master|sequence)\b/i,
      message: "sqlite_master/sqlite_sequence are SQLite-only",
    },
  ];

  for (const check of checks) {
    if (check.pattern.test(sql)) violations.push(check.message);
  }

  if (violations.length === 0) return;
  fail(`migration contains non-PostgreSQL SQL: prisma/migrations/${migrationName}/migration.sql\n${violations.map((item) => `  - ${item}`).join("\n")}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    env: process.env,
  });
  return result;
}

for (const requiredPath of [prismaDir, migrationsDir, schemaPath, configPath, lockPath]) {
  if (!fs.existsSync(requiredPath)) {
    fail(`缺少 Prisma 迁移必需文件: ${path.relative(repoRoot, requiredPath)}`);
  }
}
ok("Prisma schema/config/migrations paths exist");

const migrationDirs = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (migrationDirs.length === 0) {
  fail("prisma/migrations 下没有任何 migration 目录");
}

for (const migrationName of migrationDirs) {
  const migrationSql = path.join(migrationsDir, migrationName, "migration.sql");
  if (!fs.existsSync(migrationSql)) {
    fail(`migration 缺少 migration.sql: prisma/migrations/${migrationName}`);
  }
  if (fs.statSync(migrationSql).size === 0) {
    fail(`migration.sql 为空: prisma/migrations/${migrationName}/migration.sql`);
  }
  scanPostgresqlMigrationSql(migrationName, fs.readFileSync(migrationSql, "utf8"));
}
ok(`Found ${migrationDirs.length} Prisma migrations`);
ok("Prisma migrations contain PostgreSQL-compatible SQL");

const lockText = fs.readFileSync(lockPath, "utf8");
if (!/provider\s*=\s*"postgresql"/.test(lockText)) {
  fail("migration_lock.toml provider 必须是 postgresql");
}
ok("Prisma migration lock provider is postgresql");

const legacyDir = path.join(prismaDir, "migrations-sqlite-legacy");
if (!fs.existsSync(legacyDir) || fs.readdirSync(legacyDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length === 0) {
  fail("缺少只读 SQLite legacy migration 归档: prisma/migrations-sqlite-legacy");
}
ok("SQLite legacy migrations are archived outside the active PostgreSQL history");

const baselineSql = fs.readFileSync(path.join(migrationsDir, migrationDirs[0], "migration.sql"), "utf8");
const foreignKeyCount = (baselineSql.match(/\bFOREIGN KEY\b/g) || []).length;
const deferredForeignKeyCount = (baselineSql.match(/\bDEFERRABLE INITIALLY DEFERRED\b/g) || []).length;
if (foreignKeyCount === 0 || foreignKeyCount !== deferredForeignKeyCount) {
  fail(`PostgreSQL baseline foreign keys must be deferred for atomic SQLite ETL (${deferredForeignKeyCount}/${foreignKeyCount})`);
}
for (const invariant of [
  "idx_active_budget_version",
  "User_username_nonempty_check",
  "LibraryDocument_confidentialityLevel_check",
  "DepartmentCollaborationPosition_kind_check",
]) {
  if (!baselineSql.includes(invariant)) fail(`PostgreSQL baseline is missing custom invariant: ${invariant}`);
}
ok(`PostgreSQL baseline preserves ${foreignKeyCount} deferred foreign keys and four custom invariants`);

if (staticOnly) {
  ok("Static PostgreSQL migration checks passed (database diff intentionally skipped)");
  process.exit(0);
}

const diff = run("npx", [
  "prisma",
  "migrate",
  "diff",
  "--from-migrations",
  "prisma/migrations",
  "--to-schema",
  "./prisma",
  "--script",
  "--exit-code",
]);

if (diff.status === 2) {
  process.stdout.write(diff.stdout || "");
  process.stderr.write(diff.stderr || "");
  fail("Prisma schema 与 migrations 存在差异，请生成并提交 migration");
}

if (diff.status !== 0) {
  process.stdout.write(diff.stdout || "");
  process.stderr.write(diff.stderr || "");
  fail("Prisma migration diff check failed");
}
ok("Prisma migrations match schema");
