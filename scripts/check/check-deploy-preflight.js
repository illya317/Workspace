#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const args = new Set(process.argv.slice(2));
const ciMode = args.has("--ci");
const allowDirty = ciMode || process.env.DEPLOY_PREFLIGHT_ALLOW_DIRTY === "1";

const commands = [
  ["npm", ["run", "db:validate"]],
  ["npm", ["run", "api:check"]],
  ["npm", ["run", "schema:check"]],
  ["npm", ["run", "company:check"]],
  ["npm", ["run", "db:migration:check"]],
  ["npm", ["run", "lint:full"]],
  ["npm", ["run", "typecheck:full"]],
];

function run(command, commandArgs) {
  console.log(`\n==> ${[command, ...commandArgs].join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function gitOutput(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

if (!allowDirty) {
  const dirty = gitOutput(["status", "--short", "--", ".", ":(exclude).cnb.yml"]);
  if (dirty) {
    console.error("✗ deploy preflight must run against the committed release tree.");
    console.error("  Deployment stashes dirty files before creating cnb-release, so local dirty changes can hide release failures.");
    console.error("  Commit/clean the worktree, or set DEPLOY_PREFLIGHT_ALLOW_DIRTY=1 only for intentional local diagnosis.");
    console.error("");
    console.error(dirty);
    process.exit(1);
  }
}

for (const [command, commandArgs] of commands) {
  run(command, commandArgs);
}

console.log("\n✓ deploy preflight passed");
