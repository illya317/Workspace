import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertMigrationArguments,
  migrationDatabaseEnvironment,
} from "./migrate-local-dev.mjs";

function secureMigrationUrl(database) {
  const url = new URL(`postgresql://workspace_dev_migrator:secret@db:5432/${database}`);
  url.searchParams.set("schema", "public");
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("sslrootcert", "/run/secrets/postgres_ca");
  url.searchParams.set("application_name", "workspace-dev-migrator");
  url.searchParams.set("options", "-c role=workspace_dev_owner");
  return url.toString();
}

function replaceUrl(source, mutate) {
  const url = new URL(source);
  mutate(url);
  return url.toString();
}

const directUrl = secureMigrationUrl("workspace_dev");
const shadowUrl = secureMigrationUrl("workspace_dev_shadow");

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
    /workspace_dev_shadow database/,
  );
});

test("one-shot migration confines main and shadow databases to one PostgreSQL instance", () => {
  assert.throws(
    () => migrationDatabaseEnvironment({
      DIRECT_URL: directUrl,
      SHADOW_DATABASE_URL: replaceUrl(shadowUrl, (url) => { url.hostname = "other-db"; }),
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
    PGOPTIONS: "-c role=unexpected_owner",
    WORKSPACE_SENTINEL: "preserved",
  });
  assert.equal(env.DATABASE_URL, env.DIRECT_URL);
  assert.equal(env.SHADOW_DATABASE_URL, shadowUrl);
  assert.equal(env.PGOPTIONS, undefined);
  assert.equal(env.WORKSPACE_SENTINEL, "preserved");
});

test("one-shot migration requires the exact migrator role, databases, TLS CA, and owner option", () => {
  const invalidDirectUrls = [
    replaceUrl(directUrl, (url) => { url.username = "workspace_dev_runtime"; }),
    replaceUrl(directUrl, (url) => { url.pathname = "/other_dev"; }),
    replaceUrl(directUrl, (url) => { url.searchParams.set("sslmode", "require"); }),
    replaceUrl(directUrl, (url) => { url.searchParams.set("sslrootcert", "/tmp/other-ca.pem"); }),
    replaceUrl(directUrl, (url) => { url.searchParams.set("options", "-c role=other_owner"); }),
  ];
  for (const invalidDirectUrl of invalidDirectUrls) {
    assert.throws(
      () => migrationDatabaseEnvironment({
        DIRECT_URL: invalidDirectUrl,
        SHADOW_DATABASE_URL: shadowUrl,
      }),
    );
  }
  assert.throws(
    () => migrationDatabaseEnvironment({
      DIRECT_URL: directUrl,
      SHADOW_DATABASE_URL: replaceUrl(shadowUrl, (url) => { url.pathname = "/workspace_dev"; }),
    }),
    /workspace_dev_shadow database/,
  );
});

test("secure compose embeds SET ROLE in both URLs and keeps db execute input Prisma-compatible", () => {
  const migrateSource = readFileSync(
    new URL("../../ops/postgresql/dev/migrate-app.sh", import.meta.url),
    "utf8",
  );
  const rendererSource = readFileSync(
    new URL("../../ops/postgresql/dev/render-database-url.mjs", import.meta.url),
    "utf8",
  );
  const composeSource = readFileSync(
    new URL("../../ops/postgresql/dev/compose.yaml", import.meta.url),
    "utf8",
  );
  const grantsSource = readFileSync(
    new URL("../../ops/postgresql/dev/post-migrate-grants.sql", import.meta.url),
    "utf8",
  );

  assert.equal((migrateSource.match(/workspace-dev-migrator \\\n\s+workspace_dev_owner/g) ?? []).length, 2);
  assert.match(rendererSource, /searchParams\.set\("options", `-c role=\$\{setRole\}`\)/);
  assert.doesNotMatch(migrateSource, /export PGOPTIONS/);
  assert.doesNotMatch(composeSource, /PGOPTIONS/);
  assert.match(migrateSource, /db execute \\\n\s+--file=\/workspace-dev\/post-migrate-grants\.sql/);
  assert.doesNotMatch(migrateSource, /db execute[\s\S]{0,160}--schema/);
  assert.doesNotMatch(grantsSource, /^\\/m);
  assert.match(grantsSource, /routine\.proowner = 'workspace_dev_owner'::regrole/);
  assert.match(grantsSource, /dependency\.deptype = 'e'/);
  assert.doesNotMatch(grantsSource, /ON ALL ROUTINES IN SCHEMA public/);
});

test("one-shot migration is fixed to Prisma migrate deploy", () => {
  const source = readFileSync(new URL("./migrate-local-dev.mjs", import.meta.url), "utf8");
  assert.match(source, /prismaCliPath, "migrate", "deploy", "--schema=\.\/prisma"/);
  assert.doesNotMatch(source, /migrate", "(dev|reset)/);
  assert.doesNotMatch(source, /console\.(log|info).*URL/);
});
