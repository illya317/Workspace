#!/usr/bin/env node
/**
 * Environment variable consistency check.
 *
 * Rules:
 * 1. .env.example must exist.
 * 2. Key env vars referenced in code must be documented in .env.example.
 * 3. .env must NOT be staged for commit.
 * 4. NEXTAUTH_SECRET must be present in the local .env (build will fail otherwise).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const ENV_FILE = path.join(ROOT, ".env");

const REQUIRED_IN_EXAMPLE = [
  "NEXTAUTH_SECRET",
  "DATABASE_URL",
  "DIRECT_URL",
  "SHADOW_DATABASE_URL",
  "WORKSPACE_CONFIG_DIR",
];

const OPTIONAL_IN_EXAMPLE = [
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_COMPANY_NAME",
];

let exitCode = 0;

function fail(message) {
  console.error(`✗ ${message}`);
  exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function parseEnvFile(content) {
  return new Map(
    Array.from(content.matchAll(/^[ \t]*([A-Z_][A-Z0-9_]*)[ \t]*=[ \t]*(.+)$/gm)).map((m) => [
      m[1],
      m[2].replace(/^["']|["']$/g, "").trim(),
    ])
  );
}

function parsePostgresqlUrl(value, key, sourceLabel) {
  if (!value || !/^postgres(?:ql)?:\/\//.test(value)) {
    fail(`${key} in ${sourceLabel} must use postgresql:// or postgres://`);
    return null;
  }
  try {
    const parsed = new URL(value);
    if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
      fail(`${key} in ${sourceLabel} must include a host and database name`);
      return null;
    }
    ok(`${key} in ${sourceLabel} is PostgreSQL`);
    return parsed;
  } catch {
    fail(`${key} in ${sourceLabel} is not a valid PostgreSQL URL`);
    return null;
  }
}

function validateDatabaseEnv(envVars, sourceLabel, { requireWorkspace = true } = {}) {
  const workspaceDir = envVars.get("WORKSPACE_CONFIG_DIR");
  const databaseUrl = envVars.get("DATABASE_URL");
  if (requireWorkspace && !workspaceDir) {
    fail(`WORKSPACE_CONFIG_DIR in ${sourceLabel} is missing.`);
  } else if (workspaceDir && !path.isAbsolute(workspaceDir)) {
    fail(`WORKSPACE_CONFIG_DIR in ${sourceLabel} must be absolute: ${workspaceDir}`);
  } else if (workspaceDir) {
    ok(`WORKSPACE_CONFIG_DIR in ${sourceLabel} is absolute`);
  }
  const pooled = parsePostgresqlUrl(databaseUrl, "DATABASE_URL", sourceLabel);
  const direct = parsePostgresqlUrl(envVars.get("DIRECT_URL"), "DIRECT_URL", sourceLabel);
  const shadow = parsePostgresqlUrl(envVars.get("SHADOW_DATABASE_URL"), "SHADOW_DATABASE_URL", sourceLabel);
  if (pooled && direct && pooled.pathname !== direct.pathname) {
    fail(`DATABASE_URL and DIRECT_URL in ${sourceLabel} must select the same database`);
  }
  if (direct && shadow && direct.pathname === shadow.pathname) {
    fail(`SHADOW_DATABASE_URL in ${sourceLabel} must select a separate database`);
  }
}

// ── 1. .env.example must exist ───────────────────────────────────────

if (!fs.existsSync(ENV_EXAMPLE)) {
  fail(".env.example is missing. Create it with all required env vars.");
  process.exit(1);
}
ok(".env.example exists");

const exampleContent = fs.readFileSync(ENV_EXAMPLE, "utf-8");
const exampleVars = new Set(
  Array.from(exampleContent.matchAll(/^[ \t]*([A-Z_][A-Z0-9_]*)[ \t]*=/gm)).map((m) => m[1])
);

// ── 2. Key env vars must be documented ───────────────────────────────

for (const key of REQUIRED_IN_EXAMPLE) {
  if (!exampleVars.has(key)) {
    fail(`${key} must be documented in .env.example`);
  } else {
    ok(`${key} is documented in .env.example`);
  }
}

for (const key of OPTIONAL_IN_EXAMPLE) {
  if (exampleVars.has(key)) {
    ok(`${key} is documented in .env.example`);
  }
}

// ── 3. .env must NOT be staged ───────────────────────────────────────

try {
  const staged = execSync("git diff --cached --name-only", {
    cwd: ROOT,
    encoding: "utf-8",
  }).trim();
  if (staged.split("\n").some((f) => f === ".env")) {
    fail(".env is staged for commit. It must remain ignored.");
  } else {
    ok(".env is not staged");
  }
} catch {
  // Not in a git repo or no staged files; ignore.
}

// ── 4. CI 环境下检查环境变量，否则检查本地 .env ──────────────────────────

const isCI = !!process.env.CI;

if (isCI) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.includes("replace-with") || secret.length < 16) {
    fail("NEXTAUTH_SECRET environment variable is missing or looks like a placeholder.");
  } else {
    ok("NEXTAUTH_SECRET is present in environment");
  }
  validateDatabaseEnv(new Map([
    ["DATABASE_URL", process.env.DATABASE_URL || ""],
    ["DIRECT_URL", process.env.DIRECT_URL || ""],
    ["SHADOW_DATABASE_URL", process.env.SHADOW_DATABASE_URL || ""],
    ["WORKSPACE_CONFIG_DIR", process.env.WORKSPACE_CONFIG_DIR || ""],
  ]), "CI environment", { requireWorkspace: false });
} else {
  if (!fs.existsSync(ENV_FILE)) {
    fail(".env is missing locally. Copy .env.example to .env and fill in real values.");
  } else {
    const envContent = fs.readFileSync(ENV_FILE, "utf-8");
    const envVars = parseEnvFile(envContent);

    const secret = envVars.get("NEXTAUTH_SECRET");
    if (!secret || secret.includes("replace-with") || secret.length < 16) {
      fail("NEXTAUTH_SECRET in .env is missing or looks like a placeholder. Set a real secret.");
    } else {
      ok("NEXTAUTH_SECRET is present in .env");
    }
    validateDatabaseEnv(envVars, ".env");
  }
}

if (exitCode !== 0) {
  console.error("\n✗ Environment check failed. Fix the issues above before committing.");
}
process.exit(exitCode);
