#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const lockMetaFile = path.join(repoRoot, ".cache/check.lock/meta.json");

function listPackageScopes() {
  const packagesDirectory = path.join(repoRoot, "packages");
  return fs.readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(packagesDirectory, entry.name, "tsconfig.json")))
    .map((entry) => entry.name)
    .sort();
}

function scopeProjects() {
  const projects = new Map(listPackageScopes().map((scope) => [scope, `packages/${scope}`]));
  projects.set("app", "tsconfig.app.json");
  projects.set("prisma-client", "tsconfig.prisma-client.json");
  projects.set("tooling", "tsconfig.tooling.json");
  return projects;
}

function resolveCompilerArguments(args) {
  const scopeIndex = args.indexOf("--scope");
  if (scopeIndex < 0) return args;
  if (scopeIndex !== 0 || args.length !== 2) {
    throw new Error("Scoped typecheck usage: npm run typecheck:scope -- <scope>.");
  }

  const scope = args[1];
  const projects = scopeProjects();
  const project = projects.get(scope);
  if (!project) {
    throw new Error(`Unknown TypeScript scope "${scope}". Available scopes: ${[...projects.keys()].sort().join(", ")}.`);
  }
  return ["--build", project, "--pretty", "false"];
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function assertOwnedCheckLock(environment = process.env) {
  if (environment.CI === "true" && environment.CNB_BUILD_ID && environment.CHECK_LOCK === "0") return;
  const ownerPid = Number(environment.CHECK_LOCK_OWNER_PID);
  const snapshotKey = environment.CHECK_WORKSPACE_SNAPSHOT_KEY ?? "";
  let metadata = null;
  try {
    metadata = JSON.parse(fs.readFileSync(lockMetaFile, "utf8"));
  } catch {
    // The actionable error below covers missing, incomplete, and invalid locks.
  }

  if (
    environment.CHECK_LOCK !== "0"
    || !/^[0-9a-f]{64}$/.test(snapshotKey)
    || !Number.isInteger(ownerPid)
    || ownerPid <= 0
    || metadata?.pid !== ownerPid
    || !processIsAlive(ownerPid)
  ) {
    throw new Error(
      "TypeScript must run through the project check lock. Use `npm run typecheck:scope -- <scope>`, `npm run typecheck:quick`, or `npm run typecheck:full`.",
    );
  }
}

function main() {
  try {
    assertOwnedCheckLock();
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  let compilerArguments;
  try {
    compilerArguments = resolveCompilerArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  const compiler = require.resolve("typescript/bin/tsc", { paths: [repoRoot] });
  process.argv = [process.execPath, compiler, ...compilerArguments];
  require(compiler);
  return undefined;
}

if (require.main === module) {
  const status = main();
  if (Number.isInteger(status)) process.exitCode = status;
}

module.exports = { assertOwnedCheckLock, listPackageScopes, main, resolveCompilerArguments, scopeProjects };
