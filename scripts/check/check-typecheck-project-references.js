#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  PACKAGE_NAMES,
  packageDefinition,
  packageNamesForTier,
} = require("../arch/package-dependency-policy.cjs");

const repoRoot = path.resolve(__dirname, "../..");
const packagesRoot = path.join(repoRoot, "packages");
const packageNames = [...PACKAGE_NAMES];
const productPackageNames = packageNamesForTier("product");
const packageProjectReferences = packageNames.map((name) => `./packages/${name}`);
const rootProjectReferences = [
  "./packages/core",
  "./tsconfig.prisma-client.json",
  "./packages/platform",
  ...productPackageNames.map((name) => `./packages/${name}`),
  "./tsconfig.app.json",
  "./tsconfig.tooling.json",
];
const legacyConfigs = [
  "tsconfig.hr-check.json",
  "tsconfig.modal.json",
  "tsconfig.platform-check.json",
  "tsconfig.project-tab-check.json",
  "tsconfig.work-ui-check.json",
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function normalizedReferences(config) {
  return (config.references ?? []).map((reference) => reference.path);
}

function sameValues(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function validateCompositeProject(relativePath, expected, violations) {
  const config = readJson(relativePath);
  const options = config.compilerOptions ?? {};
  const projectDirectory = path.dirname(path.join(repoRoot, relativePath));
  const outDir = path.resolve(projectDirectory, options.outDir ?? "");
  const buildInfo = path.resolve(projectDirectory, options.tsBuildInfoFile ?? "");
  const expectedOutDir = path.resolve(projectDirectory, expected.outDir);
  const expectedBuildInfo = path.resolve(projectDirectory, expected.tsBuildInfoFile);

  for (const [key, expected] of [
    ["composite", true],
    ["declaration", true],
    ["declarationMap", false],
    ["emitDeclarationOnly", true],
  ]) {
    if (options[key] !== expected) violations.push(`${relativePath} must set compilerOptions.${key}=${expected}`);
  }
  if (options.noEmit === true) violations.push(`${relativePath} must emit declarations for downstream projects`);
  if (config.extends !== expected.extends) {
    violations.push(`${relativePath} must extend ${expected.extends}`);
  }
  if (options.rootDir !== expected.rootDir) {
    violations.push(`${relativePath} compilerOptions.rootDir must be ${expected.rootDir}`);
  }
  if (outDir !== expectedOutDir || !outDir.startsWith(`${path.join(repoRoot, ".cache/types")}${path.sep}`)) {
    violations.push(`${relativePath} outDir must be ${expected.outDir} under .cache/types`);
  }
  if (buildInfo !== expectedBuildInfo || !buildInfo.startsWith(`${path.join(repoRoot, ".cache/tsbuild")}${path.sep}`)) {
    violations.push(`${relativePath} tsBuildInfoFile must be ${expected.tsBuildInfoFile} under .cache/tsbuild`);
  }
  if (!sameValues(config.include, expected.include)) {
    violations.push(`${relativePath} include must be ${JSON.stringify(expected.include)}`);
  }
  if (!sameValues(config.exclude, expected.exclude)) {
    violations.push(`${relativePath} exclude must be ${JSON.stringify(expected.exclude)}`);
  }
  if (!sameValues(normalizedReferences(config), expected.references)) {
    violations.push(`${relativePath} references must be ${JSON.stringify(expected.references)}`);
  }
}

function findUnownedTypeScriptSources() {
  const excludedDirectories = new Set([".cache", ".git", ".next", "node_modules"]);
  const ownedTopLevelFiles = new Set([
    "instrumentation.ts",
    "next-env.d.ts",
    "next.config.ts",
    "playwright.config.ts",
    "prisma.config.ts",
  ]);
  const unowned = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!/\.(?:[mc]?ts|tsx)$/.test(entry.name)) continue;
      const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
      if (relativePath.startsWith("scripts/migrate/sqlite-legacy/")) continue;
      const segments = relativePath.split("/");
      const ownedPackageSource = segments[0] === "packages" && packageNames.includes(segments[1]);
      const ownedAppSource = segments[0] === "app";
      const ownedToolingSource = ["e2e", "scripts"].includes(segments[0])
        && /\.(?:[mc]?ts)$/.test(relativePath);
      const ownedGeneratedSource = relativePath.startsWith("generated/prisma/") && relativePath.endsWith(".ts");
      if (
        !ownedTopLevelFiles.has(relativePath)
        && !ownedPackageSource
        && !ownedAppSource
        && !ownedToolingSource
        && !ownedGeneratedSource
      ) {
        unowned.push(relativePath);
      }
    }
  }

  visit(repoRoot);
  return unowned.sort();
}

function validate() {
  const violations = [];
  const base = readJson("tsconfig.base.json");
  const solution = readJson("tsconfig.json");

  if (base.include || base.files || base.references) {
    violations.push("tsconfig.base.json must contain shared compiler options only");
  }
  for (const [option, expected] of [
    ["strict", true],
    ["jsx", "react-jsx"],
    ["module", "esnext"],
    ["moduleResolution", "bundler"],
  ]) {
    if (base.compilerOptions?.[option] !== expected) {
      violations.push(`tsconfig.base.json compilerOptions.${option} must be ${JSON.stringify(expected)}`);
    }
  }
  for (const option of ["composite", "declaration", "emitDeclarationOnly", "noEmit", "outDir", "tsBuildInfoFile", "plugins"]) {
    if (Object.hasOwn(base.compilerOptions ?? {}, option)) {
      violations.push(`tsconfig.base.json must not own project-specific compilerOptions.${option}`);
    }
  }
  for (const packageName of packageNames) {
    const packageAlias = `@workspace/${packageName}`;
    if (!base.compilerOptions?.paths?.[packageAlias] || !base.compilerOptions?.paths?.[`${packageAlias}/*`]) {
      violations.push(`tsconfig.base.json must map ${packageAlias} and ${packageAlias}/*`);
    }
  }

  if (!sameValues(solution.files, [])) violations.push("tsconfig.json must set files to an empty array");
  if (solution.extends !== "./tsconfig.base.json") {
    violations.push("tsconfig.json must extend tsconfig.base.json for repository runtime alias resolution");
  }
  if (solution.compilerOptions || solution.include) {
    violations.push("tsconfig.json must be a solution project, not a source-owning compiler config");
  }
  if (!sameValues(normalizedReferences(solution), rootProjectReferences)) {
    violations.push(`tsconfig.json references must be ${JSON.stringify(rootProjectReferences)}`);
  }

  const packageProject = (name, references) => ({
    extends: "../../tsconfig.base.json",
    rootDir: ".",
    outDir: `../../.cache/types/packages/${name}`,
    tsBuildInfoFile: `../../.cache/tsbuild/${name}.tsbuildinfo`,
    include: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts", "**/*.json"],
    exclude: ["node_modules"],
    references,
  });

  validateCompositeProject("tsconfig.prisma-client.json", {
    extends: "./tsconfig.base.json",
    rootDir: "./generated/prisma",
    outDir: "./.cache/types/generated/prisma",
    tsBuildInfoFile: "./.cache/tsbuild/prisma-client.tsbuildinfo",
    include: ["generated/prisma/**/*.ts"],
    exclude: ["node_modules"],
    references: [],
  }, violations);
  for (const packageName of packageNames) {
    const dependencyReferences = packageDefinition(packageName).allowedDependencies
      .map((dependency) => `../${dependency}`);
    if (packageName === "platform") dependencyReferences.push("../../tsconfig.prisma-client.json");
    validateCompositeProject(
      `packages/${packageName}/tsconfig.json`,
      packageProject(packageName, dependencyReferences),
      violations,
    );
  }
  validateCompositeProject("tsconfig.app.json", {
    extends: "./tsconfig.base.json",
    rootDir: ".",
    outDir: "./.cache/types/app",
    tsBuildInfoFile: "./.cache/tsbuild/app.tsbuildinfo",
    include: [
      "next-env.d.ts",
      "instrumentation.ts",
      "app/**/*.ts",
      "app/**/*.tsx",
      "app/**/*.mts",
      "app/**/*.cts",
      ".next/types/**/*.ts",
      ".next/dev/types/**/*.ts",
    ],
    exclude: ["node_modules", ".cache"],
    references: packageProjectReferences,
  }, violations);
  validateCompositeProject(
    "tsconfig.tooling.json",
    {
      extends: "./tsconfig.base.json",
      rootDir: ".",
      outDir: "./.cache/types/tooling",
      tsBuildInfoFile: "./.cache/tsbuild/tooling.tsbuildinfo",
      include: [
        "next.config.ts",
        "playwright.config.ts",
        "prisma.config.ts",
        "e2e/**/*.ts",
        "e2e/**/*.mts",
        "e2e/**/*.cts",
        "scripts/**/*.ts",
        "scripts/**/*.mts",
        "scripts/**/*.cts",
        "scripts/arch/gate-check-contracts.mjs",
      ],
      exclude: ["node_modules", ".cache", "scripts/migrate/sqlite-legacy"],
      references: ["./tsconfig.prisma-client.json", ...packageProjectReferences],
    },
    violations,
  );

  for (const source of findUnownedTypeScriptSources()) {
    violations.push(`${source} is not owned by a TypeScript project`);
  }

  for (const legacyConfig of legacyConfigs) {
    if (fs.existsSync(path.join(repoRoot, legacyConfig))) violations.push(`${legacyConfig} must be removed`);
  }

  const nextConfig = fs.readFileSync(path.join(repoRoot, "next.config.ts"), "utf8");
  if (!/tsconfigPath:\s*["']tsconfig\.app\.json["']/.test(nextConfig)) {
    violations.push("next.config.ts must point Next.js at tsconfig.app.json");
  }
  const dependencyCruiserConfig = fs.readFileSync(path.join(repoRoot, "dependency-cruiser.config.cjs"), "utf8");
  if (!/fileName:\s*["']tsconfig\.base\.json["']/.test(dependencyCruiserConfig)) {
    violations.push("dependency-cruiser must resolve paths through tsconfig.base.json");
  }
  return violations;
}

function main() {
  const violations = validate();
  if (violations.length === 0) {
    console.log("TypeScript project-reference contract passed.");
    return 0;
  }
  console.error("TypeScript project-reference contract failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  return 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { main, validate };
