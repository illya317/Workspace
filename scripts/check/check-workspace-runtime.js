#!/usr/bin/env node
/**
 * Validate the external runtime workspace used for local restore and deploys.
 *
 * This intentionally prints only paths, counts, and key names. It must never
 * print secret values from .env.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const REPO_ENV_FILE = path.join(ROOT, ".env");

const args = process.argv.slice(2);
const options = {
  strict: false,
  workspaceDir: "",
  opsEnvFile: process.env.OPS_ENV_FILE || "",
};

let exitCode = 0;
const warnings = [];

function ok(message) {
  console.log(`✓ ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`! ${message}`);
}

function fail(message) {
  console.error(`✗ ${message}`);
  exitCode = 1;
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--strict") {
    options.strict = true;
  } else if (arg === "--workspace") {
    options.workspaceDir = args[++i] || "";
  } else if (arg.startsWith("--workspace=")) {
    options.workspaceDir = arg.slice("--workspace=".length);
  } else if (arg === "--ops-env") {
    options.opsEnvFile = args[++i] || "";
  } else if (arg.startsWith("--ops-env=")) {
    options.opsEnvFile = arg.slice("--ops-env=".length);
  } else {
    fail(`Unknown option: ${arg}`);
  }
}

function parseKeyValueFile(filePath) {
  const values = new Map();
  if (!fs.existsSync(filePath)) return values;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function parsePostgresqlUrl(value, label, errors) {
  const configured = value?.trim() || "";
  if (!/^postgres(?:ql)?:\/\//.test(configured)) {
    errors.push(`${label} must use PostgreSQL`);
    return null;
  }
  try {
    const url = new URL(configured);
    if (!url.hostname || url.pathname === "/") {
      errors.push(`${label} must include host and database name`);
      return null;
    }
    return url;
  } catch {
    errors.push(`${label} is invalid`);
    return null;
  }
}

function databaseEnvironmentContract(workspaceEnv, runtimeEnv = {}, runtimeDatabaseOnly = false) {
  const errors = [];
  const fileDatabaseUrl = workspaceEnv.get("DATABASE_URL") || "";
  const databaseUrl = runtimeDatabaseOnly
    ? runtimeEnv.DATABASE_URL?.trim() || fileDatabaseUrl
    : fileDatabaseUrl;

  if (runtimeDatabaseOnly) {
    for (const key of ["DIRECT_URL", "SHADOW_DATABASE_URL"]) {
      if (runtimeEnv[key]?.trim() || workspaceEnv.get(key)?.trim()) {
        errors.push(`${key} is forbidden in runtime database-only mode`);
      }
    }
    const runtimeUrl = parsePostgresqlUrl(databaseUrl, "DATABASE_URL", errors);
    return {
      databaseUrl: runtimeUrl ? databaseUrl : "",
      errors,
      successMessage: "DATABASE_URL selects the PostgreSQL runtime database without migration credentials",
    };
  }

  const directUrl = workspaceEnv.get("DIRECT_URL") || "";
  const pooled = parsePostgresqlUrl(databaseUrl, "DATABASE_URL", errors);
  const direct = parsePostgresqlUrl(directUrl, "DIRECT_URL", errors);
  if (pooled && direct && pooled.pathname !== direct.pathname) {
    errors.push("DATABASE_URL and DIRECT_URL must select the same database");
  }
  return {
    databaseUrl: errors.length === 0 ? directUrl : "",
    errors,
    successMessage: "DATABASE_URL and DIRECT_URL select the same PostgreSQL database",
  };
}

function resolveWorkspaceDir(repoEnv) {
  const candidates = [
    options.workspaceDir,
    process.env.LOCAL_WORKSPACE_CONFIG_DIR,
    process.env.WORKSPACE_CONFIG_DIR,
    repoEnv.get("WORKSPACE_CONFIG_DIR"),
    path.join(ROOT, "..", ".workspace"),
    path.join(process.env.HOME || "", ".workspace"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const expanded = candidate.replace(/^~(?=\/|$)/, process.env.HOME || "");
    if (fs.existsSync(expanded)) return fs.realpathSync(expanded);
  }

  return path.resolve(candidates[0] || path.join(process.env.HOME || "", ".workspace"));
}

function validateRequiredFile(root, relativePath, label) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`${label} missing: ${filePath}`);
    return false;
  }
  const stat = fs.statSync(filePath);
  if (stat.isFile() && stat.size === 0) {
    fail(`${label} is empty: ${filePath}`);
    return false;
  }
  ok(`${label} exists`);
  return true;
}

function validateOptionalFile(root, relativePath, label) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    warn(`${label} not found: ${filePath}`);
    return false;
  }
  ok(`${label} exists`);
  return true;
}

function validateRequiredAlternativeFile(root, relativePaths, label) {
  const selected = relativePaths.find((relativePath) => {
    const filePath = path.join(root, relativePath);
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0;
  });
  if (!selected) {
    fail(`${label} missing; provide one of: ${relativePaths.map((relativePath) => path.join(root, relativePath)).join(", ")}`);
    return false;
  }
  ok(`${label} exists: ${selected}`);
  return true;
}

function runPrivateConfigCheck(label, args, workspaceDir) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, WORKSPACE_CONFIG_DIR: workspaceDir },
  });
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || "unknown error").trim();
    fail(`${label} failed${detail ? `: ${detail}` : ""}`);
    return;
  }
  ok(label);
}

function validateTenantConfiguration(workspaceDir) {
  runPrivateConfigCheck(
    "tenant deployment config inputs are valid",
    [path.join(ROOT, "ops/tenant-config-manifest.mjs"), "validate", "--root", workspaceDir],
    workspaceDir,
  );
  runPrivateConfigCheck(
    "tenant runtime config is valid",
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      path.join(ROOT, "scripts/check/check-tenant-runtime-config.ts"),
      "--workspace",
      workspaceDir,
    ],
    workspaceDir,
  );
}

async function validateDatabase(databaseUrl, workspaceDir, { runtimeDatabaseOnly = false } = {}) {
  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl, application_name: "workspace-runtime-check" });
  try {
    await client.connect();
    const health = await client.query(`
      SELECT
        to_regclass('public."User"') AS user_table,
        count(*) FILTER (WHERE NOT convalidated)::int AS unvalidated
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
    `);
    if (!health.rows[0].user_table) {
      fail("Database does not contain User table");
      return;
    }
    if (health.rows[0].unvalidated !== 0) fail(`PostgreSQL has ${health.rows[0].unvalidated} unvalidated constraints`);
    else ok("PostgreSQL constraints are validated");
    const users = await client.query(`
      SELECT count(*)::int AS users,
             count(*) FILTER (WHERE "wxUserId" IS NOT NULL AND length(trim("wxUserId")) > 0)::int AS wx_users
      FROM "User"
    `);
    ok(`Database users: ${users.rows[0].users}; WeCom-linked users: ${users.rows[0].wx_users}`);
    if (runtimeDatabaseOnly) {
      ok("PostgreSQL migration history remains isolated from the runtime role");
    } else {
      const failedMigrations = await client.query(`
        SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      `);
      if (failedMigrations.rowCount > 0) fail(`PostgreSQL has failed migrations: ${failedMigrations.rows.map((row) => row.migration_name).join(", ")}`);
      else ok("PostgreSQL migration history has no failed entries");
    }
    await validateDocsEditorContentRefs(client, workspaceDir);
  } catch (error) {
    fail(`Cannot validate PostgreSQL database: ${error.message}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function validateDocsEditorContentRefs(client, workspaceDir) {
  const result = await client.query(`
    SELECT id, title, "documentContentRef", "fieldModelContentRef"
    FROM "DocumentTemplate"
    WHERE "deletedAt" IS NULL
      AND ("documentContentRef" IS NOT NULL OR "fieldModelContentRef" IS NOT NULL)
    ORDER BY id ASC
  `);
  const rows = result.rows;
  let legacyCurrentRefs = 0;
  for (const row of rows) {
    const refs = [
      ["document", row.documentContentRef],
      ["fieldModel", row.fieldModelContentRef],
    ];
    for (const [label, ref] of refs) {
      if (!ref) {
        fail(`Docs editor template #${row.id} ${row.title} missing ${label} content ref`);
        continue;
      }
      if (path.isAbsolute(ref) || ref.includes("..") || !ref.startsWith("data/docs-editor/templates/")) {
        fail(`Docs editor template #${row.id} ${row.title} has invalid ${label} content ref: ${ref}`);
        continue;
      }
      if (/^data\/docs-editor\/templates\/\d+\//.test(ref)) legacyCurrentRefs += 1;
      const filePath = path.join(workspaceDir, ref);
      if (!fs.existsSync(filePath)) {
        fail(`Docs editor template #${row.id} ${row.title} ${label} content file missing: ${filePath}`);
        continue;
      }
      if (fs.statSync(filePath).size === 0) {
        fail(`Docs editor template #${row.id} ${row.title} ${label} content file is empty: ${filePath}`);
      }
    }
  }
  if (rows.length > 0 && legacyCurrentRefs === 0) {
    ok(`Docs editor content refs verified: ${rows.length} template(s)`);
  } else if (rows.length > 0) {
    warn(`Docs editor has ${legacyCurrentRefs} current legacy flat content ref(s); run docs-editor:content:rehome`);
  }

  const legacyRoot = path.join(workspaceDir, "data", "docs-editor", "templates");
  const legacyDirs = fs.existsSync(legacyRoot)
    ? fs.readdirSync(legacyRoot).filter((entry) => /^\d+$/.test(entry))
    : [];
  if (legacyDirs.length > 0) {
    warn(`Docs editor legacy flat template directories still present: ${legacyDirs.length}`);
  }
}

function validateEnv(workspaceDir, workspaceEnv) {
  const runtimeDatabaseOnly = process.env.WORKSPACE_RUNTIME_DATABASE_ONLY === "1";
  const requiredKeys = [
    "NEXTAUTH_SECRET",
    "WORKSPACE_CONFIG_DIR",
    "NEXT_PUBLIC_BASE_PATH",
  ];
  if (runtimeDatabaseOnly) {
    const databaseUrl = process.env.DATABASE_URL?.trim() || workspaceEnv.get("DATABASE_URL");
    if (!databaseUrl) fail("DATABASE_URL missing from runtime environment");
    else ok("DATABASE_URL is present in runtime environment");
  } else {
    requiredKeys.unshift("DATABASE_URL", "DIRECT_URL");
  }
  for (const key of requiredKeys) {
    if (!workspaceEnv.get(key)) {
      fail(`${key} missing from workspace .env`);
    } else {
      ok(`${key} is present in workspace .env`);
    }
  }

  const configuredWorkspace = workspaceEnv.get("WORKSPACE_CONFIG_DIR");
  if (configuredWorkspace) {
    const resolvedConfigured = fs.existsSync(configuredWorkspace)
      ? fs.realpathSync(configuredWorkspace)
      : path.resolve(configuredWorkspace);
    if (resolvedConfigured !== workspaceDir) {
      fail(`WORKSPACE_CONFIG_DIR points to ${configuredWorkspace}, but checked ${workspaceDir}`);
    } else {
      ok("WORKSPACE_CONFIG_DIR points to this workspace");
    }
  }

  const contract = databaseEnvironmentContract(workspaceEnv, process.env, runtimeDatabaseOnly);
  for (const error of contract.errors) fail(error);
  if (contract.errors.length > 0) return "";
  ok(contract.successMessage);
  return contract.databaseUrl;
}

async function main() {
  const repoEnv = parseKeyValueFile(REPO_ENV_FILE);
  const opsEnv = options.opsEnvFile ? parseKeyValueFile(options.opsEnvFile) : new Map();

  if (options.opsEnvFile) {
    if (!fs.existsSync(options.opsEnvFile)) {
      fail(`Private ops env file not found: ${options.opsEnvFile}`);
      process.exit(exitCode || 1);
    }
    if (opsEnv.size === 0) {
      fail(`Private ops env file is empty: ${options.opsEnvFile}`);
      process.exit(exitCode || 1);
    }
    const requiredOpsKeys = ["SERVER", "REMOTE_DIR", "PM2_NAME"];
    const missingOpsKeys = requiredOpsKeys.filter(
      (key) => !opsEnv.get(key) || opsEnv.get(key).trim() === ""
    );
    if (missingOpsKeys.length > 0) {
      fail(
        `Private ops env missing required keys: ${missingOpsKeys.join(", ")}`
      );
      process.exit(exitCode || 1);
    }
  }

  const workspaceDir = resolveWorkspaceDir(repoEnv);

  console.log(`Workspace runtime check`);
  console.log(`Workspace dir: ${workspaceDir}`);
  if (options.opsEnvFile) {
    console.log(`Private ops env: ${options.opsEnvFile}`);
  }

  if (!fs.existsSync(workspaceDir)) {
    fail(`Workspace dir does not exist: ${workspaceDir}`);
    process.exit(exitCode);
  }

  const workspaceEnvPath = path.join(workspaceDir, ".env");
  validateRequiredFile(workspaceDir, ".env", "workspace .env");
  validateTenantConfiguration(workspaceDir);
  validateRequiredAlternativeFile(
    workspaceDir,
    ["assets/brand/company/logo.png", "assets/brand/company/logo.svg"],
    "company logo",
  );
  validateRequiredFile(workspaceDir, "assets/brand/favicon.ico", "favicon.ico");
  validateRequiredFile(workspaceDir, "assets/brand/favicon.png", "favicon.png");
  validateRequiredFile(
    workspaceDir,
    "assets/agent/avatar/00_main-transparent.webp",
    "agent avatar"
  );
  validateOptionalFile(workspaceDir, "data/qc.json", "QC batch store");
  validateRequiredFile(
    workspaceDir,
    "config/pharma-qc/product_stage_tests.json",
    "QC product/stage test index"
  );
  validateRequiredFile(
    workspaceDir,
    "config/pharma-qc/full",
    "QC full template directory"
  );
  validateRequiredFile(workspaceDir, "config/pharma-qc/records", "QC records config directory");

  const workspaceEnv = parseKeyValueFile(workspaceEnvPath);
  const databaseUrl = validateEnv(workspaceDir, workspaceEnv);
  const runtimeDatabaseOnly = process.env.WORKSPACE_RUNTIME_DATABASE_ONLY === "1";
  if (databaseUrl) await validateDatabase(databaseUrl, workspaceDir, { runtimeDatabaseOnly });

  if (options.strict && warnings.length > 0) {
    fail(`Strict mode treats ${warnings.length} warning(s) as failures`);
  }

  if (exitCode !== 0) {
    console.error("\n✗ Workspace runtime check failed.");
  } else {
    console.log("\n✓ Workspace runtime check passed.");
  }
  process.exit(exitCode);
}

module.exports = { databaseEnvironmentContract };

if (require.main === module) {
  main().catch((error) => {
    fail(error.stack || error.message);
    process.exit(exitCode || 1);
  });
}
