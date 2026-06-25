#!/usr/bin/env node
/**
 * Validate the external runtime workspace used for local restore and deploys.
 *
 * This intentionally prints only paths, counts, and key names. It must never
 * print secret values from .env.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const REPO_ENV_FILE = path.join(ROOT, ".env");

const args = process.argv.slice(2);
const options = {
  strict: false,
  workspaceDir: "",
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

function stripFilePrefix(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) return "";
  return databaseUrl.slice("file:".length).replace(/^\/\/(?=\/)/, "");
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

function validateWorkspaceManifest(workspaceDir) {
  const manifestPath = path.join(workspaceDir, "manifest.json");
  if (!validateRequiredFile(workspaceDir, "manifest.json", "workspace manifest")) return;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`Cannot parse workspace manifest: ${error.message}`);
    return;
  }

  const productionTarget = manifest.productionTarget || {};
  const requiredKeys = ["serverHost", "remoteDir", "pm2Name"];
  for (const key of requiredKeys) {
    if (!productionTarget[key]) {
      fail(`workspace manifest productionTarget.${key} is missing`);
    }
  }
  if (!manifest.productionTarget) {
    fail("workspace manifest productionTarget is missing");
  }
  if (exitCode === 0) {
    ok("workspace manifest has productionTarget");
  }
}

function validateDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    fail(`Database file missing: ${dbPath}`);
    return;
  }
  if (fs.statSync(dbPath).size === 0) {
    fail(`Database file is empty: ${dbPath}`);
    return;
  }

  let Database;
  try {
    Database = require("better-sqlite3");
  } catch {
    warn("better-sqlite3 is not installed; skipped SQLite content checks");
    return;
  }

  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const quickCheck = db.prepare("PRAGMA quick_check").get();
    if (quickCheck.quick_check !== "ok") {
      fail(`SQLite quick_check failed: ${quickCheck.quick_check}`);
    } else {
      ok("SQLite quick_check passed");
    }

    const hasUser =
      db.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'User'")
        .get().count > 0;
    if (!hasUser) {
      fail("Database does not contain User table");
      db.close();
      return;
    }

    const users = db.prepare("select count(*) as count from User").get().count;
    const wxUsers = db
      .prepare(
        "select count(*) as count from User where wxUserId is not null and length(trim(wxUserId)) > 0"
      )
      .get().count;
    ok(`Database users: ${users}; WeCom-linked users: ${wxUsers}`);
    db.close();
  } catch (error) {
    fail(`Cannot read SQLite database: ${error.message}`);
  }
}

function validateEnv(workspaceDir, workspaceEnv) {
  const requiredKeys = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "WORKSPACE_CONFIG_DIR",
    "NEXT_PUBLIC_BASE_PATH",
  ];
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

  const databaseUrl = workspaceEnv.get("DATABASE_URL") || "";
  const databasePath = stripFilePrefix(databaseUrl);
  if (!databasePath) {
    fail("DATABASE_URL must use file: for this SQLite deployment");
    return "";
  }
  if (!path.isAbsolute(databasePath)) {
    fail("DATABASE_URL must be absolute; relative SQLite paths split data by cwd");
    return "";
  }

  const expectedDbPath = path.join(workspaceDir, "data", "dev.db");
  const resolvedDbPath = fs.existsSync(databasePath)
    ? fs.realpathSync(databasePath)
    : path.resolve(databasePath);
  const resolvedExpected = fs.existsSync(expectedDbPath)
    ? fs.realpathSync(expectedDbPath)
    : path.resolve(expectedDbPath);
  if (resolvedDbPath !== resolvedExpected) {
    fail(`DATABASE_URL points outside workspace data/dev.db: ${databasePath}`);
  } else {
    ok("DATABASE_URL points to workspace data/dev.db");
  }
  return databasePath;
}

async function main() {
  const repoEnv = parseKeyValueFile(REPO_ENV_FILE);
  const workspaceDir = resolveWorkspaceDir(repoEnv);

  console.log(`Workspace runtime check`);
  console.log(`Workspace dir: ${workspaceDir}`);

  if (!fs.existsSync(workspaceDir)) {
    fail(`Workspace dir does not exist: ${workspaceDir}`);
    process.exit(exitCode);
  }

  const workspaceEnvPath = path.join(workspaceDir, ".env");
  validateRequiredFile(workspaceDir, ".env", "workspace .env");
  validateWorkspaceManifest(workspaceDir);
  validateRequiredFile(workspaceDir, "data/dev.db", "workspace database");
  validateRequiredFile(workspaceDir, "assets/brand/company/logo.png", "company logo");
  validateRequiredFile(workspaceDir, "assets/brand/favicon.ico", "favicon.ico");
  validateRequiredFile(workspaceDir, "assets/brand/favicon.png", "favicon.png");
  validateRequiredFile(
    workspaceDir,
    "assets/agent/avatar/00_main-transparent.webp",
    "agent avatar"
  );
  validateOptionalFile(workspaceDir, "data/qc-batches.json", "QC batch store");
  validateOptionalFile(workspaceDir, "data/qc-template-feedback.json", "QC feedback store");
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
  const databasePath = validateEnv(workspaceDir, workspaceEnv);
  if (databasePath) validateDatabase(databasePath);

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

main().catch((error) => {
  fail(error.stack || error.message);
  process.exit(exitCode || 1);
});
