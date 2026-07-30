const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { Linter } = require("eslint");

const dependencyCruiserConfig = require("../../dependency-cruiser.config.cjs");
const {
  PACKAGE_DEPENDENCY_POLICY,
  PACKAGE_NAMES,
  REPOSITORY_ROOT,
  assertWorkspacePackageCoverage,
  forbiddenPackageDependenciesFor,
  packageDefinition,
  validatePackageDependencyPolicy,
  workspacePackageAlias,
} = require("./package-dependency-policy.cjs");

function mutablePolicy() {
  return JSON.parse(JSON.stringify(PACKAGE_DEPENDENCY_POLICY));
}

test("package dependency policy covers every workspace package and fails closed", () => {
  assert.equal(assertWorkspacePackageCoverage(REPOSITORY_ROOT), true);
  assert.equal(PACKAGE_NAMES.length, 14);

  const unknownTier = mutablePolicy();
  unknownTier.packages.find((definition) => definition.name === "work").tier = "unknown";
  assert.throws(() => validatePackageDependencyPolicy(unknownTier), /unknown tier/);

  const unknownDependency = mutablePolicy();
  unknownDependency.packages.find((definition) => definition.name === "work").allowedDependencies.push("unknown");
  assert.throws(() => validatePackageDependencyPolicy(unknownDependency), /unknown package dependency/);

  const missingPackage = mutablePolicy();
  missingPackage.packages = missingPackage.packages.filter((definition) => definition.name !== "settings");
  const validatedMissingPackage = validatePackageDependencyPolicy(missingPackage);
  assert.throws(
    () => assertWorkspacePackageCoverage(REPOSITORY_ROOT, validatedMissingPackage),
    /workspace packages must match policy/,
  );
});

test("dependency-cruiser package rules are equivalent to the central policy", () => {
  for (const sourcePackage of PACKAGE_NAMES) {
    const forbiddenDependencies = forbiddenPackageDependenciesFor(sourcePackage);
    const dependencyRule = dependencyCruiserConfig.forbidden
      .find((rule) => rule.name === `package-policy-${sourcePackage}-allowed-dependencies`);
    assert.ok(dependencyRule, `missing dependency-cruiser rule for ${sourcePackage}`);
    const targetPattern = new RegExp(dependencyRule.to.path);
    for (const targetPackage of PACKAGE_NAMES) {
      const matches = targetPattern.test(`packages/${targetPackage}/server/example.ts`);
      assert.equal(matches, forbiddenDependencies.includes(targetPackage), `${sourcePackage} -> ${targetPackage}`);
    }

    const allowedRoots = packageDefinition(sourcePackage).allowedDependencies;
    const rootRule = dependencyCruiserConfig.forbidden
      .find((rule) => rule.name === `package-policy-${sourcePackage}-no-cross-package-root-barrels`);
    assert.equal(Boolean(rootRule), allowedRoots.length > 0, `root barrel rule for ${sourcePackage}`);
    if (rootRule) {
      const rootPattern = new RegExp(rootRule.to.path);
      for (const targetPackage of PACKAGE_NAMES) {
        assert.equal(
          rootPattern.test(`packages/${targetPackage}/index.ts`),
          allowedRoots.includes(targetPackage),
          `${sourcePackage} root -> ${targetPackage}`,
        );
      }
    }
  }
});

test("ESLint package restrictions are generated from the same policy", async () => {
  const moduleUrl = `${pathToFileURL(path.join(REPOSITORY_ROOT, "eslint.config.mjs")).href}?policy-test=${Date.now()}`;
  const { default: eslintConfig } = await import(moduleUrl);
  for (const sourcePackage of PACKAGE_NAMES) {
    const config = eslintConfig.find((entry) => entry.name === `workspace/package-dependency-policy/${sourcePackage}`);
    assert.ok(config, `missing ESLint package policy for ${sourcePackage}`);
    const patterns = config.rules["no-restricted-imports"][1].patterns;
    const forbiddenGroup = patterns[0].group;
    const expectedForbidden = forbiddenPackageDependenciesFor(sourcePackage)
      .flatMap((dependency) => [workspacePackageAlias(dependency), `${workspacePackageAlias(dependency)}/*`]);
    assert.deepEqual(forbiddenGroup, expectedForbidden);
    const rootBarrelPattern = new RegExp(patterns[1].regex);
    const rootPackages = [sourcePackage, ...packageDefinition(sourcePackage).allowedDependencies];
    for (const targetPackage of PACKAGE_NAMES) {
      assert.equal(
        rootBarrelPattern.test(workspacePackageAlias(targetPackage)),
        rootPackages.includes(targetPackage),
        `${sourcePackage} bare root ${targetPackage}`,
      );
      assert.equal(
        rootBarrelPattern.test(`${workspacePackageAlias(targetPackage)}/server/example`),
        false,
        `${sourcePackage} explicit subpath ${targetPackage}`,
      );
    }
  }

  const hrConfig = eslintConfig.find((entry) => entry.name === "workspace/package-dependency-policy/hr");
  const linter = new Linter({ configType: "flat" });
  const bareRootSource = fs.readFileSync(
    path.join(__dirname, "fixtures/package-dependency-policy/illegal-alias/eslint-bare-root.ts.fixture"),
    "utf8",
  );
  const explicitSubpathSource = fs.readFileSync(
    path.join(__dirname, "fixtures/package-dependency-policy/illegal-alias/eslint-explicit-subpath.ts.fixture"),
    "utf8",
  );
  const lintConfig = [{
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: hrConfig.rules,
  }];
  const bareMessages = linter.verify(bareRootSource, lintConfig, { filename: "packages/hr/server/policy-fixture.js" });
  const subpathMessages = linter.verify(explicitSubpathSource, lintConfig, { filename: "packages/hr/server/policy-fixture.js" });
  assert.ok(bareMessages.some((message) => message.ruleId === "no-restricted-imports"));
  assert.equal(subpathMessages.some((message) => message.ruleId === "no-restricted-imports"), false);
});

test("TypeScript package references equal allowed package dependencies", () => {
  for (const packageName of PACKAGE_NAMES) {
    const config = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, "packages", packageName, "tsconfig.json"), "utf8"));
    const packageReferences = (config.references ?? [])
      .map((reference) => reference.path)
      .filter((reference) => /^\.\.\/[a-z]/.test(reference))
      .map((reference) => reference.slice("../".length));
    assert.deepEqual(packageReferences, packageDefinition(packageName).allowedDependencies, packageName);
  }
});

test("dependency-cruiser rejects an illegal sibling alias and an allowed dependency root barrel", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "package-policy-integration-"));
  try {
    const workDirectory = path.join(temporaryRoot, "packages/work");
    const platformDirectory = path.join(temporaryRoot, "packages/platform");
    const hrServerDirectory = path.join(temporaryRoot, "packages/hr/server");
    fs.mkdirSync(workDirectory, { recursive: true });
    fs.mkdirSync(platformDirectory, { recursive: true });
    fs.mkdirSync(hrServerDirectory, { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, "fixtures/package-dependency-policy/illegal-alias/importer.ts.fixture"),
      path.join(workDirectory, "example.ts"),
    );
    fs.writeFileSync(path.join(platformDirectory, "index.ts"), "export const platformRoot = true;\n");
    fs.writeFileSync(path.join(hrServerDirectory, "index.ts"), "export const hrRuntime = true;\n");
    fs.writeFileSync(path.join(temporaryRoot, "tsconfig.base.json"), `${JSON.stringify({
      compilerOptions: {
        module: "esnext",
        moduleResolution: "bundler",
        paths: {
          "@workspace/platform": ["./packages/platform/index.ts"],
          "@workspace/hr/*": ["./packages/hr/*"],
        },
      },
    }, null, 2)}\n`);
    const fixtureConfig = {
      ...dependencyCruiserConfig,
      options: {
        ...dependencyCruiserConfig.options,
        tsConfig: { fileName: path.join(temporaryRoot, "tsconfig.base.json") },
      },
    };
    const configPath = path.join(temporaryRoot, "dependency-cruiser.config.cjs");
    fs.writeFileSync(configPath, `module.exports = ${JSON.stringify(fixtureConfig, null, 2)};\n`);

    const result = spawnSync(
      path.join(REPOSITORY_ROOT, "node_modules/.bin/depcruise"),
      ["--config", configPath, "packages"],
      { cwd: temporaryRoot, encoding: "utf8" },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /package-policy-work-allowed-dependencies/);
    assert.match(output, /package-policy-work-no-cross-package-root-barrels/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
