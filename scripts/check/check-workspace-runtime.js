#!/usr/bin/env node
/**
 * Validate the external runtime workspace used for local restore and deploys.
 *
 * This intentionally prints only paths, counts, and key names. It must never
 * print secret values from .env or ops/server.env.sh.
 */

const fs = require("fs");
const path = require("path");
const dns = require("dns");

const ROOT = path.resolve(__dirname, "..", "..");
const TARGETS_FILE = path.join(ROOT, "ops", "deploy-targets.json");
const SERVER_ENV_FILE = path.join(ROOT, "ops", "server.env.sh");
const REPO_ENV_FILE = path.join(ROOT, ".env");

const args = process.argv.slice(2);
const options = {
  target: "production",
  strict: false,
  checkDns: false,
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
  } else if (arg === "--check-dns") {
    options.checkDns = true;
  } else if (arg === "--target") {
    options.target = args[++i] || options.target;
  } else if (arg.startsWith("--target=")) {
    options.target = arg.slice("--target=".length);
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

function readTargets() {
  if (!fs.existsSync(TARGETS_FILE)) {
    fail(`Missing deploy target manifest: ${path.relative(ROOT, TARGETS_FILE)}`);
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(TARGETS_FILE, "utf8"));
  } catch (error) {
    fail(`Cannot parse ${path.relative(ROOT, TARGETS_FILE)}: ${error.message}`);
    return {};
  }
}

function stripFilePrefix(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) return "";
  return databaseUrl.slice("file:".length).replace(/^\/\/(?=\/)/, "");
}

function resolveWorkspaceDir(serverEnv, repoEnv) {
  const candidates = [
    options.workspaceDir,
    process.env.LOCAL_WORKSPACE_CONFIG_DIR,
    serverEnv.get("LOCAL_WORKSPACE_CONFIG_DIR"),
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

function validateWorkspaceManifest(workspaceDir, target) {
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
  const checks = [
    ["serverHost", target.serverHost],
    ["remoteDir", target.remoteDir],
    ["pm2Name", target.pm2Name],
  ];
  for (const [key, expected] of checks) {
    if (!expected) continue;
    if (productionTarget[key] !== expected) {
      fail(`workspace manifest productionTarget.${key} is ${productionTarget[key] || "(missing)"}, expected ${expected}`);
    }
  }
  if (target.domain && productionTarget.domain !== target.domain) {
    fail(`workspace manifest productionTarget.domain is ${productionTarget.domain || "(missing)"}, expected ${target.domain}`);
  }
  ok("workspace manifest matches deploy target");
}

function validateDatabase(dbPath, target) {
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
    if (target.requiresWecomUserIds && wxUsers === 0) {
      fail("Production target requires WeCom-linked users, but none were found");
    }
    db.close();
  } catch (error) {
    fail(`Cannot read SQLite database: ${error.message}`);
  }
}

function parseServerHost(serverValue) {
  if (!serverValue) return "";
  const withoutUser = serverValue.includes("@") ? serverValue.split("@").pop() : serverValue;
  return withoutUser.split(":")[0];
}

function validateDeployConfig(target, serverEnv) {
  if (!fs.existsSync(SERVER_ENV_FILE)) {
    warn("ops/server.env.sh not found; deploy target config was not checked");
    return;
  }

  const server = serverEnv.get("SERVER");
  const host = parseServerHost(server);
  if (!host) {
    fail("SERVER is missing in ops/server.env.sh");
  } else if (target.serverHost && host !== target.serverHost) {
    fail(`SERVER host is ${host}, expected ${target.serverHost} for ${options.target}`);
  } else {
    ok(`Deploy server matches ${options.target}: ${host}`);
  }

  const remoteDir = serverEnv.get("REMOTE_DIR");
  if (target.remoteDir && remoteDir !== target.remoteDir) {
    fail(`REMOTE_DIR is ${remoteDir || "(missing)"}, expected ${target.remoteDir}`);
  } else {
    ok(`REMOTE_DIR matches ${target.remoteDir}`);
  }

  const pm2Name = serverEnv.get("PM2_NAME");
  if (target.pm2Name && pm2Name !== target.pm2Name) {
    fail(`PM2_NAME is ${pm2Name || "(missing)"}, expected ${target.pm2Name}`);
  } else {
    ok(`PM2_NAME matches ${target.pm2Name}`);
  }

  if (serverEnv.has("KEY_CONTENT") || serverEnv.has("KEY")) {
    ok("SSH key config is present");
  } else {
    fail("SSH key config is missing; set KEY or KEY_CONTENT in ops/server.env.sh");
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

async function validateDns(target) {
  if (!options.checkDns || !target.domain || !target.serverHost) return;
  try {
    const addresses = await dns.promises.resolve4(target.domain);
    if (addresses.includes(target.serverHost)) {
      ok(`${target.domain} resolves to ${target.serverHost}`);
    } else {
      fail(`${target.domain} resolves to ${addresses.join(", ")}, expected ${target.serverHost}`);
    }
  } catch (error) {
    fail(`Cannot resolve ${target.domain}: ${error.message}`);
  }
}

async function main() {
  const targets = readTargets();
  const target = targets[options.target];
  if (!target) {
    fail(`Unknown deploy target: ${options.target}`);
    process.exit(exitCode);
  }

  const serverEnv = parseKeyValueFile(SERVER_ENV_FILE);
  const repoEnv = parseKeyValueFile(REPO_ENV_FILE);
  const workspaceDir = resolveWorkspaceDir(serverEnv, repoEnv);

  console.log(`Workspace runtime check: ${options.target}`);
  console.log(`Workspace dir: ${workspaceDir}`);

  if (!fs.existsSync(workspaceDir)) {
    fail(`Workspace dir does not exist: ${workspaceDir}`);
    process.exit(exitCode);
  }

  const workspaceEnvPath = path.join(workspaceDir, ".env");
  validateRequiredFile(workspaceDir, ".env", "workspace .env");
  validateWorkspaceManifest(workspaceDir, target);
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
    "config/pharma-ops/table_layouts/layout_mapping.json",
    "QC layout mapping"
  );
  validateRequiredFile(
    workspaceDir,
    "config/pharma-ops/table_layouts/templates/parents/related_substances_hplc_full.json",
    "QC layout parent template"
  );
  validateRequiredFile(workspaceDir, "config/pharma-ops/products.yaml", "QC products config");

  const workspaceEnv = parseKeyValueFile(workspaceEnvPath);
  const databasePath = validateEnv(workspaceDir, workspaceEnv);
  if (databasePath) validateDatabase(databasePath, target);
  validateDeployConfig(target, serverEnv);
  await validateDns(target);

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
