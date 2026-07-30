const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  WORKSPACE_EXPORT_SOURCE_ROOTS,
  isWorkspacePackageRootAlias,
  resolveExportTarget,
  resolveRelativePackageBoundary,
  shouldEnforceRelativePackageBoundary,
} = require("./workspace-package-boundaries");

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");

function readPackageExports(packageName) {
  return JSON.parse(
    fs.readFileSync(path.join(REPOSITORY_ROOT, "packages", packageName, "package.json"), "utf8"),
  ).exports;
}

test("workspace export resolution accepts exact and wildcard public entries only", () => {
  const exportsMap = {
    ".": "./index.ts",
    "./formula": "./formula/index.ts",
    "./server/*": "./server/*.ts",
  };

  assert.equal(resolveExportTarget(exportsMap, "./formula"), "./formula/index.ts");
  assert.equal(resolveExportTarget(exportsMap, "./server/prisma"), "./server/prisma.ts");
  assert.equal(resolveExportTarget(exportsMap, "./formula/parser"), null);
  assert.equal(isWorkspacePackageRootAlias("@/packages/platform/formula/parser"), true);
  assert.equal(isWorkspacePackageRootAlias("@workspace/platform/formula"), false);
});

test("workspace export resolution gives exact and more specific null entries precedence", () => {
  const exportsMap = {
    "./server/*": "./server/*.ts",
    "./server/internal/*": null,
    "./server/internal/public": "./server/internal/public.ts",
    "./server/private": null,
  };

  assert.equal(resolveExportTarget(exportsMap, "./server/public"), "./server/public.ts");
  assert.equal(resolveExportTarget(exportsMap, "./server/internal/secret"), null);
  assert.equal(
    resolveExportTarget(exportsMap, "./server/internal/public"),
    "./server/internal/public.ts",
  );
  assert.equal(resolveExportTarget(exportsMap, "./server/private"), null);
});

test("real capability manifests expose interfaces while nested implementations stay private", () => {
  const workExports = readPackageExports("work");
  assert.equal(resolveExportTarget(workExports, "./server/meetings"), "./server/meetings/index.ts");
  assert.equal(resolveExportTarget(workExports, "./server/meetings/application"), null);
  assert.equal(
    resolveExportTarget(workExports, "./server/projects/plan"),
    "./server/projects/plan/index.ts",
  );
  assert.equal(resolveExportTarget(workExports, "./server/projects/plan/baselines"), null);

  const hrExports = readPackageExports("hr");
  assert.equal(resolveExportTarget(hrExports, "./server/analysis"), "./server/analysis.ts");
  assert.equal(resolveExportTarget(hrExports, "./server/analysis/route"), null);
  assert.equal(
    resolveExportTarget(hrExports, "./server/performance/contribution-detail"),
    "./server/performance/contribution-detail.ts",
  );
  assert.equal(resolveExportTarget(hrExports, "./server/performance/contribution-detail.test"), null);

  const platformExports = readPackageExports("platform");
  assert.equal(
    resolveExportTarget(platformExports, "./server/workspace-analysis-runtime"),
    "./server/workspace-analysis-runtime/index.ts",
  );
  assert.equal(resolveExportTarget(platformExports, "./server/workspace-analysis-runtime/renderer"), null);
});

test("workspace export scanning includes canonical and generated app shells", () => {
  assert.equal(WORKSPACE_EXPORT_SOURCE_ROOTS.includes("app"), true);
  assert.equal(WORKSPACE_EXPORT_SOURCE_ROOTS.includes("apps"), true);
  assert.equal(WORKSPACE_EXPORT_SOURCE_ROOTS.includes("packages"), true);
});

test("relative imports cannot cross from one workspace package into another", () => {
  const packagesDirectory = path.join(path.sep, "repo", "packages");
  const importer = path.join(packagesDirectory, "production", "server", "editor.ts");
  const platformTarget = path.join(packagesDirectory, "platform", "formula", "parser.ts");
  const productionTarget = path.join(packagesDirectory, "production", "server", "local.ts");
  const existing = new Set([platformTarget, productionTarget]);
  const filePredicate = (candidate) => existing.has(candidate);

  assert.deepEqual(
    resolveRelativePackageBoundary(importer, "../../platform/formula/parser", packagesDirectory, filePredicate),
    { sourcePackage: "production", targetFile: platformTarget, targetPackage: "platform" },
  );
  assert.equal(
    resolveRelativePackageBoundary(importer, "./local", packagesDirectory, filePredicate),
    null,
  );

  const appImporter = path.join(path.sep, "repo", "app", "page.tsx");
  const appBoundary = resolveRelativePackageBoundary(
    appImporter,
    "../packages/platform/formula/parser",
    packagesDirectory,
    filePredicate,
  );
  assert.deepEqual(
    appBoundary,
    { sourcePackage: null, targetFile: platformTarget, targetPackage: "platform" },
  );
  assert.equal(shouldEnforceRelativePackageBoundary(appBoundary, appImporter, path.join(path.sep, "repo")), true);

  const toolingImporter = path.join(path.sep, "repo", "scripts", "check", "gate.ts");
  const toolingBoundary = resolveRelativePackageBoundary(
    toolingImporter,
    "../../packages/platform/formula/parser",
    packagesDirectory,
    filePredicate,
  );
  assert.equal(shouldEnforceRelativePackageBoundary(toolingBoundary, toolingImporter, path.join(path.sep, "repo")), false);
});
