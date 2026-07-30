#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const prismaCliPath = path.join(repositoryRoot, "node_modules/prisma/build/index.js");
const migratorRole = "workspace_dev_migrator";
const ownerRoleOption = "-c role=workspace_dev_owner";
const caPath = "/run/secrets/postgres_ca";
const expectedParameters = new Map([
  ["schema", "public"],
  ["sslmode", "verify-full"],
  ["sslrootcert", caPath],
  ["application_name", "workspace-dev-migrator"],
  ["options", ownerRoleOption],
]);

function parsePostgresqlUrl(value, name) {
  const configured = value?.trim() ?? "";
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(`${name} 必须是 PostgreSQL URL。`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} 必须是 PostgreSQL URL。`);
  }
  if (!url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error(`${name} 必须明确指定 PostgreSQL host 和 database。`);
  }
  return url;
}

function databaseTarget(url) {
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
}

function assertMigratorUrl(url, name, database) {
  if (url.protocol !== "postgresql:") {
    throw new Error(`${name} 必须使用 postgresql://。`);
  }
  if (url.username !== migratorRole) {
    throw new Error(`${name} 必须使用 ${migratorRole}。`);
  }
  if (!url.password) {
    throw new Error(`${name} 必须包含 migrator 密码。`);
  }
  if (url.pathname !== `/${database}`) {
    throw new Error(`${name} 必须选择 ${database} database。`);
  }
  const actualKeys = [...new Set(url.searchParams.keys())];
  if (
    actualKeys.length !== expectedParameters.size
    || actualKeys.some((key) => !expectedParameters.has(key))
  ) {
    throw new Error(`${name} 只能包含受控的迁移连接参数。`);
  }
  for (const [key, expected] of expectedParameters) {
    const values = url.searchParams.getAll(key);
    if (values.length !== 1 || values[0] !== expected) {
      throw new Error(`${name} 的 ${key} 必须精确为 ${expected}。`);
    }
  }
}

export function assertMigrationArguments(args) {
  if (args.length > 0) {
    throw new Error("Workspace 开发迁移入口不接受额外参数，只允许一次性 prisma migrate deploy。");
  }
}

export function migrationDatabaseEnvironment(env = process.env) {
  const directUrl = parsePostgresqlUrl(env.DIRECT_URL, "DIRECT_URL");
  const shadowUrl = parsePostgresqlUrl(env.SHADOW_DATABASE_URL, "SHADOW_DATABASE_URL");
  assertMigratorUrl(directUrl, "DIRECT_URL", "workspace_dev");
  assertMigratorUrl(shadowUrl, "SHADOW_DATABASE_URL", "workspace_dev_shadow");
  if (
    directUrl.hostname.toLowerCase() !== shadowUrl.hostname.toLowerCase()
    || (directUrl.port || "5432") !== (shadowUrl.port || "5432")
  ) {
    throw new Error("DIRECT_URL 和 SHADOW_DATABASE_URL 必须指向同一个开发 PostgreSQL 实例。");
  }
  if (databaseTarget(directUrl) === databaseTarget(shadowUrl)) {
    throw new Error("SHADOW_DATABASE_URL 必须指向独立的 shadow database。");
  }

  const configuredDatabaseUrl = env.DATABASE_URL?.trim();
  if (configuredDatabaseUrl) {
    const databaseUrl = parsePostgresqlUrl(configuredDatabaseUrl, "DATABASE_URL");
    if (databaseTarget(databaseUrl) !== databaseTarget(directUrl)) {
      throw new Error("迁移进程中的 DATABASE_URL 和 DIRECT_URL 必须选择同一个 database。");
    }
  }

  const migrationEnvironment = { ...env };
  delete migrationEnvironment.PGOPTIONS;
  return {
    ...migrationEnvironment,
    DATABASE_URL: directUrl.toString(),
    DIRECT_URL: directUrl.toString(),
    SHADOW_DATABASE_URL: shadowUrl.toString(),
  };
}

async function runMigration(env) {
  const child = spawn(
    process.execPath,
    [prismaCliPath, "migrate", "deploy", "--schema=./prisma"],
    {
      cwd: repositoryRoot,
      env,
      stdio: "inherit",
    },
  );
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

export async function main(args = process.argv.slice(2), env = process.env) {
  assertMigrationArguments(args);
  const result = await runMigration(migrationDatabaseEnvironment(env));
  if (result.code !== null) return result.code;
  if (result.signal === "SIGINT") return 130;
  if (result.signal === "SIGTERM") return 143;
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
