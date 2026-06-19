#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DOMAIN_PACKAGES = [
  "administration",
  "finance",
  "hr",
  "library",
  "production",
  "work",
];

const errors = [];
const platformModulesPath = path.join(ROOT, "packages/platform/modules.tsx");
const platformModules = fs.existsSync(platformModulesPath)
  ? fs.readFileSync(platformModulesPath, "utf8")
  : "";

for (const packageName of DOMAIN_PACKAGES) {
  const packageDir = path.join(ROOT, "packages", packageName);
  const modulePath = path.join(packageDir, "module.ts");
  const indexPath = path.join(packageDir, "index.ts");
  const packageJsonPath = path.join(packageDir, "package.json");

  if (!fs.existsSync(modulePath)) {
    errors.push(`packages/${packageName}/module.ts is missing`);
    continue;
  }

  const moduleText = fs.readFileSync(modulePath, "utf8");
  if (!/\bexport\s+const\s+moduleDefinition\b/.test(moduleText)) {
    errors.push(`packages/${packageName}/module.ts must export const moduleDefinition`);
  }

  if (!fs.existsSync(indexPath) || !/\bmoduleDefinition\b/.test(fs.readFileSync(indexPath, "utf8"))) {
    errors.push(`packages/${packageName}/index.ts must re-export moduleDefinition`);
  }

  if (!fs.existsSync(packageJsonPath)) {
    errors.push(`packages/${packageName}/package.json is missing`);
  } else {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (packageJson.name !== `@workspace/${packageName}`) {
      errors.push(`packages/${packageName}/package.json must be named @workspace/${packageName}`);
    }
    if (!packageJson.exports?.["."]) {
      errors.push(`@workspace/${packageName} must export "."`);
    }
  }

  if (!platformModules.includes(`@workspace/${packageName}`)) {
    errors.push(`@workspace/${packageName} must be registered in packages/platform/modules.tsx`);
  }
}

if (errors.length > 0) {
  console.error("✗ Module definition check failed.");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("✓ Module definition check passed.");
