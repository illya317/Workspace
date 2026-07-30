import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertMigrationArguments,
  migrationDatabaseEnvironment,
} from "./migrate-local-dev.mjs";

const directUrl = "postgresql://workspace_dev_migrator:secret@db:5432/workspace_dev?sslmode=verify-full";
const shadowUrl = "postgresql://workspace_dev_migrator:secret@db:5432/workspace_dev_shadow?sslmode=verify-full";

test("one-shot migration rejects forwarded Prisma commands", () => {
  assert.doesNotThrow(() => assertMigrationArguments([]));
  assert.throws(() => assertMigrationArguments(["reset"]), /不接受额外参数/);
  assert.throws(() => assertMigrationArguments(["dev"]), /只允许一次性 prisma migrate deploy/);
});

test("one-shot migration requires direct and separate shadow PostgreSQL URLs", () => {
  assert.throws(() => migrationDatabaseEnvironment({}), /DIRECT_URL 必须是 PostgreSQL URL/);
  assert.throws(
    () => migrationDatabaseEnvironment({ DIRECT_URL: directUrl }),
    /SHADOW_DATABASE_URL 必须是 PostgreSQL URL/,
  );
  assert.throws(
    () => migrationDatabaseEnvironment({
      DIRECT_URL: directUrl,
      SHADOW_DATABASE_URL: directUrl,
    }),
    /必须指向独立的 shadow database/,
  );
});

test("one-shot migration confines main and shadow databases to one PostgreSQL instance", () => {
  assert.throws(
    () => migrationDatabaseEnvironment({
      DIRECT_URL: directUrl,
      SHADOW_DATABASE_URL: "postgresql://workspace_dev_migrator:secret@other-db:5432/workspace_dev_shadow",
    }),
    /必须指向同一个开发 PostgreSQL 实例/,
  );
  assert.throws(
    () => migrationDatabaseEnvironment({
      DATABASE_URL: "postgresql://workspace_dev_runtime:secret@db:5432/other_dev",
      DIRECT_URL: directUrl,
      SHADOW_DATABASE_URL: shadowUrl,
    }),
    /DATABASE_URL 和 DIRECT_URL 必须选择同一个 database/,
  );
});

test("one-shot migration promotes the direct URL only inside its child environment", () => {
  const env = migrationDatabaseEnvironment({
    DIRECT_URL: directUrl,
    SHADOW_DATABASE_URL: shadowUrl,
    WORKSPACE_SENTINEL: "preserved",
  });
  assert.equal(env.DATABASE_URL, env.DIRECT_URL);
  assert.equal(env.SHADOW_DATABASE_URL, shadowUrl);
  assert.equal(env.WORKSPACE_SENTINEL, "preserved");
});

test("one-shot migration is fixed to Prisma migrate deploy", () => {
  const source = readFileSync(new URL("./migrate-local-dev.mjs", import.meta.url), "utf8");
  assert.match(source, /prismaCliPath, "migrate", "deploy", "--schema=\.\/prisma"/);
  assert.doesNotMatch(source, /migrate", "(dev|reset)/);
  assert.doesNotMatch(source, /console\.(log|info).*URL/);
});
