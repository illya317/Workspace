#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const checks = [
  ["company hardcoding", "company:check"],
  ["Structure simple hygiene ratchet", "arch:structure:hygiene"],
];

const failed = [];

for (const [label, script] of checks) {
  console.log(`\n▶ Hygiene warning check: ${label}`);
  const result = spawnSync(npmCommand, ["run", script], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    failed.push(label);
    console.warn(`⚠ Hygiene warning only: ${label} reported issues.`);
  }
}

if (failed.length > 0) {
  console.warn(`\n⚠ Hygiene warning summary: ${failed.join(", ")}.`);
  console.warn("  Run `npm run check:hygiene` in Hygiene Role for simple cleanup.");
} else {
  console.log("\n✓ Hygiene warning checks passed.");
}

process.exit(0);
