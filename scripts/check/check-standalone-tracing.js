#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const standaloneRoot = path.join(root, ".next", "standalone");
const traceRoot = path.join(root, ".next", "server");
const maxFilesPerTrace = 2_500;

if (!fs.existsSync(standaloneRoot)) {
  console.error("✗ Next standalone output is missing; run a production build first.");
  process.exit(1);
}

const pending = [standaloneRoot];
const gitDirectories = [];
while (pending.length > 0) {
  const current = pending.pop();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(current, entry.name);
    if (entry.name === ".git") {
      gitDirectories.push(path.relative(root, fullPath));
      continue;
    }
    pending.push(fullPath);
  }
}

const traceViolations = [];
const tracePending = [traceRoot];
while (tracePending.length > 0) {
  const current = tracePending.pop();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      tracePending.push(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".nft.json")) continue;
    const files = JSON.parse(fs.readFileSync(fullPath, "utf8")).files ?? [];
    const gitReferences = files.filter((file) => /(^|\/)\.git(\/|$)/.test(file)).length;
    if (gitReferences > 0 || files.length > maxFilesPerTrace) {
      traceViolations.push({ file: path.relative(root, fullPath), files: files.length, gitReferences });
    }
  }
}

if (gitDirectories.length > 0 || traceViolations.length > 0) {
  console.error("✗ Standalone output contains an over-broad file trace:");
  for (const directory of gitDirectories) console.error(`  - Git directory: ${directory}`);
  for (const violation of traceViolations) {
    console.error(`  - ${violation.file}: ${violation.files} files, ${violation.gitReferences} Git references`);
  }
  process.exit(1);
}

console.log(`✓ Standalone output tracing is bounded (maximum ${maxFilesPerTrace} files per route, no Git metadata).`);
