#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const { changedFileSets } = require("./changed-files");
const { scopeProjects } = require("./run-typecheck");

const TYPE_INPUT_PATTERN = /\.(?:cts|json|mts|ts|tsx)$/i;
const FULL_GRAPH_INPUTS = new Set([
  ".node-version",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "tsconfig.base.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.prisma-client.json",
  "tsconfig.tooling.json",
]);
const BUSINESS_PACKAGE_SCOPES = new Set([
  "administration",
  "capital-securities",
  "external",
  "finance",
  "hr",
  "inventory",
  "library",
  "news",
  "production",
  "work",
]);

function normalizeRepositoryPath(value) {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function explicitChangedFiles(environment) {
  const serialized = environment.WORKSPACE_CHANGED_FILES_JSON?.trim();
  if (!serialized) return null;
  const value = JSON.parse(serialized);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("WORKSPACE_CHANGED_FILES_JSON must be a JSON string array");
  }
  return value;
}

function localChangedFiles({ cwd = process.cwd(), environment = process.env } = {}) {
  return explicitChangedFiles(environment)
    ?? changedFileSets({ cwd, diffFilter: "ACDMR", env: environment }).files;
}

function appScope(file) {
  return "app";
}

function directScopeForFile(file, availableScopes) {
  if (FULL_GRAPH_INPUTS.has(file) || /^tsconfig\.[a-z0-9-]+\.json$/.test(file)) return "<full>";
  if (file.startsWith("prisma/") || file.startsWith("generated/prisma/")) return "prisma-client";

  const packageMatch = file.match(/^packages\/([a-z][a-z0-9-]*)\//);
  if (packageMatch && availableScopes.has(packageMatch[1])) return packageMatch[1];

  if (file.startsWith("app/")) return appScope(file);
  if (
    file.startsWith("scripts/")
    || file.startsWith("ops/")
    || file.startsWith("e2e/")
    || /(?:^|\/)[^/]+\.config\.(?:cts|mts|ts)$/.test(file)
  ) {
    return "tooling";
  }
  return null;
}

function reduceRedundantScopes(scopes) {
  const selected = new Set(scopes);
  if (selected.has("app")) {
    for (const scope of [...selected]) {
      if (scope !== "app" && scope !== "tooling") selected.delete(scope);
    }
    return [...selected].sort();
  }

  const hasPackageConsumer = [...selected].some((scope) => (
    BUSINESS_PACKAGE_SCOPES.has(scope)
  ));
  if (hasPackageConsumer) {
    selected.delete("platform");
    selected.delete("core");
    selected.delete("prisma-client");
  } else if (selected.has("platform")) {
    selected.delete("core");
    selected.delete("prisma-client");
  }
  return [...selected].sort();
}

function resolveQuickTypecheckPlan(changedFiles, availableScopes = new Set(scopeProjects().keys())) {
  const scopes = new Set();
  const ignoredFiles = [];
  const normalizedFiles = [...new Set(changedFiles.map(normalizeRepositoryPath).filter(Boolean))].sort();

  for (const file of normalizedFiles) {
    if (!TYPE_INPUT_PATTERN.test(file) && !FULL_GRAPH_INPUTS.has(file)) {
      ignoredFiles.push(file);
      continue;
    }
    const scope = directScopeForFile(file, availableScopes);
    if (scope === "<full>") {
      return { changedFiles: normalizedFiles, scopes: [], ignoredFiles, requiresExplicitFullTypecheck: true };
    }
    if (scope && availableScopes.has(scope)) scopes.add(scope);
    else ignoredFiles.push(file);
  }

  return {
    changedFiles: normalizedFiles,
    scopes: reduceRedundantScopes(scopes),
    ignoredFiles,
    requiresExplicitFullTypecheck: false,
  };
}

function runTypecheck(arguments_, { cwd = process.cwd(), environment = process.env } = {}) {
  const result = spawnSync(process.execPath, ["scripts/check/run-typecheck.js", ...arguments_], {
    cwd,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main({ cwd = process.cwd(), environment = process.env } = {}) {
  const plan = resolveQuickTypecheckPlan(localChangedFiles({ cwd, environment }));
  if (plan.requiresExplicitFullTypecheck) {
    throw new Error(
      "Quick typecheck will not auto-upgrade to the full project graph. Compiler/build inputs changed; run `npm run typecheck:full` only when an explicit full diagnosis or CI/release gate is intended.",
    );
  }
  if (plan.scopes.length === 0) {
    process.stdout.write("Quick typecheck: no changed TypeScript scope; skipped compilation.\n");
    return plan;
  }
  process.stdout.write(`Quick typecheck scopes: ${plan.scopes.join(", ")}\n`);
  for (const scope of plan.scopes) runTypecheck(["--scope", scope], { cwd, environment });
  return plan;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  appScope,
  directScopeForFile,
  localChangedFiles,
  main,
  reduceRedundantScopes,
  resolveQuickTypecheckPlan,
};
