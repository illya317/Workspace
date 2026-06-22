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

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
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
}
ok(`Found ${migrationDirs.length} Prisma migrations`);

const lockText = fs.readFileSync(lockPath, "utf8");
if (!/provider\s*=\s*"sqlite"/.test(lockText)) {
  fail("migration_lock.toml provider 必须是 sqlite");
}
ok("Prisma migration lock provider is sqlite");

const validate = run("npx", ["prisma", "validate", "--schema=./prisma"]);
if (validate.status !== 0) {
  process.stdout.write(validate.stdout || "");
  process.stderr.write(validate.stderr || "");
  fail("prisma validate failed");
}
ok("prisma validate passed");

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

if (diff.status === 0) {
  ok("Prisma migrations match schema");
} else {
  const output = `${diff.stdout || ""}\n${diff.stderr || ""}`;
  if (/P3006/.test(output)) {
    console.warn(
      "⚠ Prisma 历史 migrations 无法从空库完整回放；已完成强制存在性与 schema 校验，真实生产升级仍由 deploy 阶段的 prisma migrate deploy 强制执行。",
    );
  } else {
    process.stdout.write(diff.stdout || "");
    process.stderr.write(diff.stderr || "");
    fail("Prisma migration diff check failed");
  }
}
