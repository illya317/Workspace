#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const checks = [
  ["company hardcoding", "company:check"],
  ["Structure simple hygiene ratchet", "arch:structure:hygiene"],
];

const failed = [];

for (const [label, script] of checks) {
  console.log(`\n▶ Hygiene strict check: ${label}`);
  const result = spawnSync(npmCommand, ["run", script], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    failed.push(label);
    console.error(`✗ Hygiene strict check failed: ${label}`);
  }
}

if (failed.length > 0) {
  console.error(`\n✗ Hygiene strict summary: ${failed.join(", ")}.`);
  process.exit(1);
}

console.log("\n✓ Hygiene strict checks passed.");
