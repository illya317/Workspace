#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const LOCK_KEY_A = 0x574f524b;
const LOCK_KEY_B = 0x43494442;

function databaseIdentity(name, raw) {
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw new Error(`${name} must be a valid PostgreSQL URL`); }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} must use PostgreSQL`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database.endsWith("_ci")) {
    throw new Error(`${name} must select a disposable *_ci database; received ${database || "unknown"}`);
  }
  return {
    raw,
    database,
    endpoint: `${parsed.hostname}:${parsed.port || "5432"}/${database}`,
  };
}

function hardenedDatabaseUrl(raw, caFile) {
  const parsed = new URL(raw);
  parsed.searchParams.set("sslmode", "verify-full");
  parsed.searchParams.set("sslrootcert", caFile);
  return parsed.toString();
}

export function parseCiDatabaseTarget(env = process.env) {
  const runtime = databaseIdentity("DATABASE_URL", (env.DATABASE_URL || "").trim());
  const control = databaseIdentity("DIRECT_URL", (env.DIRECT_URL || env.DATABASE_URL || "").trim());
  if (runtime.endpoint !== control.endpoint) {
    throw new Error("DATABASE_URL and DIRECT_URL must select the same CI database endpoint");
  }
  return { runtime, control };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    const forward = (signal) => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    };
    const onSigint = () => forward("SIGINT");
    const onSigterm = () => forward("SIGTERM");
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
      resolve({ code: code ?? (signal === "SIGINT" ? 130 : 143), signal });
    });
  });
}

async function resetPublicSchema(client) {
  await client.query("BEGIN");
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public AUTHORIZATION CURRENT_USER");
    await client.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function prepareDatabase(repository, env) {
  const target = parseCiDatabaseTarget(env);
  const caInput = (env.RELEASE_CI_DATABASE_CA_FILE || "").trim();
  if (!caInput) throw new Error("RELEASE_CI_DATABASE_CA_FILE is required");
  const caFile = fs.realpathSync(caInput);
  if (!fs.statSync(caFile).isFile()) throw new Error("CI database CA must be a regular file");
  target.runtime.raw = hardenedDatabaseUrl(target.runtime.raw, caFile);
  target.control.raw = hardenedDatabaseUrl(target.control.raw, caFile);
  const control = new Client({ connectionString: target.control.raw });
  let locked = false;
  let resetAllowed = false;
  try {
    await control.connect();
    const identity = await control.query(`
      SELECT current_database() AS database,
             current_user AS actor,
             pg_get_userbyid(datdba) AS owner
      FROM pg_database WHERE datname = current_database()
    `);
    const row = identity.rows[0];
    if (row?.database !== target.control.database || row?.actor !== row?.owner) {
      throw new Error("CI database reset requires the exact disposable database owner");
    }
    const lockDeadline = Date.now() + 30_000;
    while (!locked && Date.now() < lockDeadline) {
      const lock = await control.query(
        "SELECT pg_try_advisory_lock($1, $2) AS locked",
        [LOCK_KEY_A, LOCK_KEY_B],
      );
      locked = lock.rows[0]?.locked === true;
      if (!locked) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!locked) throw new Error("another CI database sandbox owns the release rehearsal lock");
    resetAllowed = true;

    await resetPublicSchema(control);
    const migrationEnv = { ...env, DATABASE_URL: target.control.raw, DIRECT_URL: target.control.raw };
    delete migrationEnv.SHADOW_DATABASE_URL;
    const migration = await run(
      process.execPath,
      [path.join(repository, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", path.join(repository, "prisma")],
      {
        cwd: repository,
        env: migrationEnv,
      },
    );
    if (migration.code !== 0) throw new Error(`CI database migration failed with exit ${migration.code}`);

    const runtime = new Client({ connectionString: target.runtime.raw });
    try {
      await runtime.connect();
      const proof = await runtime.query(`
        SELECT current_database() AS database,
               to_regclass('public."SystemConfig"') IS NOT NULL AS schema_ready,
               (SELECT count(*)::int FROM "SystemConfig") >= 0 AS runtime_readable
      `);
      if (proof.rows[0]?.database !== target.runtime.database
        || proof.rows[0]?.schema_ready !== true || proof.rows[0]?.runtime_readable !== true) {
        throw new Error("CI runtime database schema/read proof failed");
      }
    } finally {
      await runtime.end().catch(() => {});
    }
    process.stdout.write(`==> CI database sandbox ready: ${target.runtime.database}\n`);
    return { status: 0, control, locked, resetAllowed, target };
  } catch (error) {
    process.stderr.write(`[CI database] ${error instanceof Error ? error.message : String(error)}\n`);
    return { status: 1, control, locked, resetAllowed, target };
  }
}

async function cleanupDatabase(state) {
  if (!state.control) return 0;
  let status = 0;
  try {
    if (state.resetAllowed) await resetPublicSchema(state.control);
  } catch (error) {
    status = 1;
    process.stderr.write(`[CI database cleanup] ${error instanceof Error ? error.message : String(error)}\n`);
  }
  if (state.locked) {
    await state.control.query("SELECT pg_advisory_unlock($1, $2)", [LOCK_KEY_A, LOCK_KEY_B]).catch(() => { status = 1; });
  }
  await state.control.end().catch(() => { status = 1; });
  return status;
}

function parse(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || argv[0] !== "--repository" || separator !== 2 || argv.length <= separator + 1) {
    throw new Error("usage: ci-database-sandbox.mjs --repository PATH -- COMMAND [ARGS...]");
  }
  return { repository: path.resolve(argv[1]), command: argv[separator + 1], args: argv.slice(separator + 2) };
}

export async function runCiDatabaseSandbox(options, env = process.env) {
  let state;
  try {
    state = await prepareDatabase(options.repository, env);
  } catch (error) {
    process.stderr.write(`[CI database] ${error instanceof Error ? error.message : String(error)}\n`);
    state = { status: 1, control: null, locked: false, resetAllowed: false };
  }
  const childEnv = { ...env, RELEASE_CI_DATABASE_STATUS: String(state.status) };
  if (state.status === 0) {
    childEnv.DATABASE_URL = state.target.runtime.raw;
    childEnv.DIRECT_URL = state.target.control.raw;
    delete childEnv.SHADOW_DATABASE_URL;
    childEnv.RELEASE_CI_RUNTIME_DATABASE_URL = state.target.runtime.raw;
    childEnv.RELEASE_CI_CONTROL_DATABASE_URL = state.target.control.raw;
  }
  let child;
  let cleanupStatus;
  try {
    child = await run(options.command, options.args, { cwd: options.repository, env: childEnv });
  } finally {
    cleanupStatus = await cleanupDatabase(state);
  }
  return child.code === 0 && state.status === 0 && cleanupStatus === 0 ? 0 : (child.code || 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCiDatabaseSandbox(parse(process.argv.slice(2)))
    .then((status) => { process.exitCode = status; })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    });
}
