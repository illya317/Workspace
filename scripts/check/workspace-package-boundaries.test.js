const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  isWorkspacePackageRootAlias,
  resolveExportTarget,
  resolveRelativePackageBoundary,
  shouldEnforceRelativePackageBoundary,
} = require("./workspace-package-boundaries");

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
