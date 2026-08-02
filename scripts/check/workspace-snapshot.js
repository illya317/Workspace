#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SNAPSHOT_VERSION = "workspace-snapshot-v4";
const INHERITED_SNAPSHOT_KEY_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_CORE_UI_REQUEST_PATH = process.env.WORKSPACE_CONFIG_DIR
  ? path.join(process.env.WORKSPACE_CONFIG_DIR, "config/engineering/core-ui-change-request.md")
  : "";
const SNAPSHOT_ENV_KEYS = [
  "CI",
  "CORE_UI_CHANGE",
  "NEXT_PUBLIC_BASE_PATH",
  "NODE_ENV",
  "WORKSPACE_CONFIG_DIR",
];
const EXCLUDED_DIRECTORY_PREFIXES = [
  ".cache/",
  ".next/",
  ".planning/",
  "node_modules/",
];
const EXCLUDED_PATHSPECS = EXCLUDED_DIRECTORY_PREFIXES
  .map((prefix) => `:(exclude)${prefix.slice(0, -1)}`);

function runGit(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: options.encoding ?? "buffer",
    maxBuffer: options.maxBuffer ?? 200 * 1024 * 1024,
  });
}

function addHashPart(hash, label, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  hash.update(`${label}:${bytes.length}\0`);
  hash.update(bytes);
  hash.update("\0");
}

function digest(label, value) {
  const hash = crypto.createHash("sha256");
  addHashPart(hash, label, value);
  return hash.digest("hex");
}

function shouldIncludeSnapshotFile(file) {
  const normalized = file.replaceAll("\\", "/");
  return !(
    EXCLUDED_DIRECTORY_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    || normalized === ".DS_Store"
    || normalized.endsWith("/.DS_Store")
  );
}

function hashEnvironment(env) {
  const hash = crypto.createHash("sha256");
  addHashPart(hash, "environment.version", "v2");
  for (const key of SNAPSHOT_ENV_KEYS) {
    addHashPart(hash, `environment.${key}`, env[key] ?? "");
  }
  return hash.digest("hex");
}

function hashIgnoredEnvironmentFiles(cwd) {
  const hash = crypto.createHash("sha256");
  addHashPart(hash, "dotenv.version", "v1");
  const files = fs.readdirSync(cwd, { withFileTypes: true })
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && /^\.env(?:$|\.)/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const file of files) {
    const absolutePath = path.join(cwd, file);
    addHashPart(hash, "dotenv.path", file);
    if (fs.lstatSync(absolutePath).isSymbolicLink()) {
      addHashPart(hash, "dotenv.symlink", fs.readlinkSync(absolutePath));
    }
    try {
      addHashPart(hash, "dotenv.contents", fs.readFileSync(absolutePath));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      addHashPart(hash, "dotenv.missing", "true");
    }
  }
  return hash.digest("hex");
}

function captureWorkspaceSnapshot({
  cwd,
  env = process.env,
  coreUiRequestPath = DEFAULT_CORE_UI_REQUEST_PATH,
} = {}) {
  if (!cwd) throw new Error("workspace snapshot requires cwd");
  const snapshotScope = env.CHECK_WORKSPACE_SNAPSHOT_SCOPE?.trim() || "staged";
  if (!["staged", "committed"].includes(snapshotScope)) {
    throw new Error("CHECK_WORKSPACE_SNAPSHOT_SCOPE must be staged or committed");
  }

  const headTree = runGit(cwd, ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  const stagedDiff = snapshotScope === "committed" ? "excluded" : runGit(cwd, [
    "diff",
    "--no-ext-diff",
    "--no-renames",
    "--no-textconv",
    "--binary",
    "--cached",
    "HEAD",
    "--",
    ".",
    ...EXCLUDED_PATHSPECS,
  ]);
  const parts = {
    head: digest("head-tree", headTree),
    index: digest("index", stagedDiff),
    unstaged: digest("unstaged", "excluded"),
    untracked: digest("untracked", "excluded"),
    environment: hashEnvironment(env),
    external: digest("external", JSON.stringify({
      coreUiRequest: coreUiRequestPath && fs.existsSync(coreUiRequestPath) ? "exists" : "missing",
      dotenvFiles: hashIgnoredEnvironmentFiles(cwd),
    })),
  };
  const hash = crypto.createHash("sha256");
  addHashPart(hash, "snapshot.version", SNAPSHOT_VERSION);
  for (const [name, value] of Object.entries(parts)) addHashPart(hash, `snapshot.${name}`, value);

  return {
    key: hash.digest("hex"),
    inherited: false,
    parts,
  };
}

function resolveWorkspaceSnapshot(options = {}) {
  const env = options.env ?? process.env;
  const inheritedKey = env.CHECK_LOCK === "0"
    ? env.CHECK_WORKSPACE_SNAPSHOT_KEY?.trim()
    : "";

  if (inheritedKey) {
    if (!INHERITED_SNAPSHOT_KEY_PATTERN.test(inheritedKey)) {
      throw new Error("CHECK_WORKSPACE_SNAPSHOT_KEY must be a lowercase SHA-256 digest");
    }
    return { key: inheritedKey, inherited: true, parts: null };
  }

  return captureWorkspaceSnapshot({ ...options, env });
}

function workspaceSnapshotMatches(left, right) {
  return Boolean(left?.key && right?.key && left.key === right.key);
}

module.exports = {
  SNAPSHOT_ENV_KEYS,
  captureWorkspaceSnapshot,
  resolveWorkspaceSnapshot,
  shouldIncludeSnapshotFile,
  workspaceSnapshotMatches,
};
