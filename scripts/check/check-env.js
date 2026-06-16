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

function validateDatabaseEnv(envVars, sourceLabel) {
  const workspaceDir = envVars.get("WORKSPACE_CONFIG_DIR");
  const databaseUrl = envVars.get("DATABASE_URL");
  if (!workspaceDir) {
    fail(`WORKSPACE_CONFIG_DIR in ${sourceLabel} is missing.`);
    return;
  }
  if (!path.isAbsolute(workspaceDir)) {
    fail(`WORKSPACE_CONFIG_DIR in ${sourceLabel} must be absolute: ${workspaceDir}`);
  } else {
    ok(`WORKSPACE_CONFIG_DIR in ${sourceLabel} is absolute`);
  }
  if (!databaseUrl) {
    fail(`DATABASE_URL in ${sourceLabel} is missing.`);
    return;
  }
  if (!databaseUrl.startsWith("file:")) {
    fail(`DATABASE_URL in ${sourceLabel} must use file: for this SQLite deployment`);
    return;
  }
  const databasePath = databaseUrl.slice("file:".length).replace(/^["']|["']$/g, "").trim();
  if (!path.isAbsolute(databasePath)) {
    fail(`DATABASE_URL in ${sourceLabel} must be absolute; relative SQLite paths split data by cwd: ${databasePath}`);
    return;
  }
  ok(`DATABASE_URL in ${sourceLabel} is absolute`);
  const expectedPrefix = path.join(workspaceDir || "", "data") + path.sep;
  if (workspaceDir && path.isAbsolute(workspaceDir) && !databasePath.startsWith(expectedPrefix)) {
    fail(`DATABASE_URL in ${sourceLabel} must live under WORKSPACE_CONFIG_DIR/data: ${databasePath}`);
  } else if (workspaceDir && path.isAbsolute(workspaceDir)) {
    ok("DATABASE_URL points under WORKSPACE_CONFIG_DIR/data");
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
