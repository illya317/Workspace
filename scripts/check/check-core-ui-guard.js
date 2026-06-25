#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const REGISTRY_DIR = "packages/core/ui";
const REGISTRY_GLOB = /^packages\/core\/ui\/component-registry/;
const DESKTOP_REQUEST_PATH = "/Users/koito/Desktop/UI/core-ui-change-request.md";
const REPO_REQUEST_PATH = "core-ui-change-request.md";

const mode = process.argv.includes("--staged") ? "staged" : "working-tree";

function runGit(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function splitLines(text) {
  return text ? text.split(/\r?\n/).filter(Boolean) : [];
}

function parseNameStatus(line) {
  const parts = line.split(/\t/);
  const status = parts[0] ?? "";
  const file = parts[parts.length - 1] ?? "";
  return { status, file };
}

function getChangedEntries() {
  const args = mode === "staged"
    ? ["diff", "--cached", "--name-status", "--diff-filter=ACMRTD"]
    : ["diff", "HEAD", "--name-status", "--diff-filter=ACMRTD"];
  const entries = splitLines(runGit(args)).map(parseNameStatus);

  if (mode === "working-tree") {
    const untracked = splitLines(runGit(["ls-files", "--others", "--exclude-standard"]))
      .map((file) => ({ status: "A", file }));
    entries.push(...untracked);
  }

  return entries;
}

function getDiffText() {
  const args = mode === "staged"
    ? ["diff", "--cached", "-U0"]
    : ["diff", "HEAD", "-U0"];
  return runGit(args);
}

function readRegistryNames() {
  const names = new Set();
  const re = /\{\s*name:\s*"([^"]+)"/g;

  const dataFiles = fs.readdirSync(path.join(ROOT, REGISTRY_DIR))
    .filter((file) => /^component-registry-data/.test(file) && /\.(ts|tsx)$/.test(file))
    .map((file) => path.join(REGISTRY_DIR, file));

  for (const file of dataFiles) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    let match;
    while ((match = re.exec(source))) names.add(match[1]);
  }

  return names;
}

function isSourceFile(file) {
  return /\.(tsx|ts)$/.test(file);
}

function isCoreUiFile(file) {
  return file.startsWith("packages/core/ui/") && isSourceFile(file);
}

function isProtectedPreview(file) {
  return file.startsWith("packages/core/showcase/previews/") && isSourceFile(file);
}

function isRegistryFile(file) {
  return REGISTRY_GLOB.test(file);
}

function protectedCoreUiReason(file, registeredNames) {
  if (isRegistryFile(file)) return "core UI registry changed";
  if (!isCoreUiFile(file)) return null;

  const basename = path.basename(file).replace(/\.(tsx|ts)$/, "");
  for (const name of registeredNames) {
    if (basename === name || basename.startsWith(name)) {
      return `registered core UI or private implementation changed (${name})`;
    }
  }

  return "core UI source changed";
}

function hasAuthorization(changedFiles) {
  if (process.env.CORE_UI_CHANGE === "1") return true;
  if (fs.existsSync(DESKTOP_REQUEST_PATH)) return true;
  if (changedFiles.includes(REPO_REQUEST_PATH)) return true;
  return false;
}

function findDuplicateToolbarShells(entries) {
  return entries
    .filter(({ status, file }) => status.startsWith("A") && /^packages\/[^/]+\/ui\/.*Toolbar\.tsx$/.test(file))
    .map(({ file }) => file);
}

function findLintExemptions(diffText) {
  return splitLines(diffText).filter((line) => {
    if (!line.startsWith("+") || line.startsWith("+++")) return false;
    return /(?:\/\/|\/\*|<!--)\s*eslint-disable(?:-next-line|-line)?\b/.test(line);
  });
}

function registryChanged(entries) {
  return entries.some(({ file }) => isRegistryFile(file));
}

function findUnsyncedCoreUiAdditions(entries, registeredNames) {
  const registryUpdated = registryChanged(entries);
  const previewUpdated = entries.some(({ file }) => isProtectedPreview(file));
  const additions = entries
    .filter(({ status, file }) => status.startsWith("A") && isCoreUiFile(file))
    .map(({ file }) => path.basename(file).replace(/\.(tsx|ts)$/, ""))
    .filter((name) => {
      if (registeredNames.has(name)) return false;
      if (/^(.*Parts|.*Content|.*Types|.*utils?|.*styles|.*constants)$/.test(name)) return false;
      return /^[A-Z]/.test(name);
    });

  if (additions.length === 0) return [];
  if (registryUpdated && previewUpdated) return [];
  return additions;
}

function findUnsyncedCoreUiDeletions(entries) {
  const registryUpdated = registryChanged(entries);
  const previewUpdated = entries.some(({ file }) => isProtectedPreview(file));
  const deletions = entries
    .filter(({ status, file }) => status.startsWith("D") && isCoreUiFile(file))
    .map(({ file }) => file);

  if (deletions.length === 0) return [];
  if (registryUpdated && previewUpdated) return [];
  return deletions;
}

function main() {
  const entries = getChangedEntries();
  const changedFiles = entries.map(({ file }) => file);
  const registeredNames = readRegistryNames();
  const protectedChanges = [];

  for (const { file } of entries) {
    const reason = protectedCoreUiReason(file, registeredNames);
    if (reason) protectedChanges.push({ file, reason });
    if (isProtectedPreview(file)) protectedChanges.push({ file, reason: "core UI preview changed" });
  }

  const duplicateToolbarShells = findDuplicateToolbarShells(entries);
  const lintExemptions = findLintExemptions(getDiffText());
  const unsyncedAdditions = findUnsyncedCoreUiAdditions(entries, registeredNames);
  const unsyncedDeletions = findUnsyncedCoreUiDeletions(entries);
  const authorized = hasAuthorization(changedFiles);
  let failed = false;

  if (protectedChanges.length > 0 && !authorized) {
    failed = true;
    console.error("\n✗ Core UI guard: protected core UI changes require explicit UI-system authorization.");
    console.error("  This is a core UI/system task, not a business task. Do not modify registered core UI or its private implementation casually.");
    console.error("\n  Authorize intentionally with one of:");
    console.error("  - CORE_UI_CHANGE=1 git commit ...");
    console.error(`  - create ${DESKTOP_REQUEST_PATH}`);
    console.error("\n  Protected changes:");
    for (const change of protectedChanges) {
      console.error(`  - ${change.file} (${change.reason})`);
    }
  }

  if (duplicateToolbarShells.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: duplicate business Toolbar shell detected.");
    console.error("  Use the single core Toolbar Page API instead of adding package-specific toolbar wrappers.");
    for (const file of duplicateToolbarShells) console.error(`  - ${file}`);
  }

  if (lintExemptions.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: lint exemption added.");
    console.error("  Do not add eslint-disable exemptions; fix or split the code instead.");
    for (const line of lintExemptions.slice(0, 20)) console.error(`  ${line}`);
    if (lintExemptions.length > 20) console.error(`  ... ${lintExemptions.length - 20} more`);
  }

  if (unsyncedAdditions.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: new core UI source appears unsynced with registry/preview.");
    console.error("  Add registry and preview updates, or name it as a private implementation.");
    for (const name of unsyncedAdditions) console.error(`  - ${name}`);
  }

  if (unsyncedDeletions.length > 0) {
    failed = true;
    console.error("\n✗ Core UI guard: deleted core UI source appears unsynced with registry/preview.");
    console.error("  Remove registry/preview/export references in the same UI-system change.");
    for (const file of unsyncedDeletions) console.error(`  - ${file}`);
  }

  if (failed) process.exit(1);

  console.log(`✓ Core UI guard passed (${mode})`);
}

main();
