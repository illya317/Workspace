/* eslint-disable @typescript-eslint/no-require-imports -- dependency-cruiser loads this configuration synchronously as CommonJS. */
const {
  PACKAGE_NAMES,
  forbiddenPackageDependenciesFor,
  packageDefinition,
} = require("./scripts/arch/package-dependency-policy.cjs");
/* eslint-enable @typescript-eslint/no-require-imports */

function alternation(packageNames) {
  return packageNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

const packageDependencyRules = PACKAGE_NAMES.flatMap((sourcePackage) => {
  const rules = [];
  const forbiddenDependencies = forbiddenPackageDependenciesFor(sourcePackage);
  if (forbiddenDependencies.length > 0) {
    rules.push({
      name: `package-policy-${sourcePackage}-allowed-dependencies`,
      severity: "error",
      from: { path: `^packages/${sourcePackage}(?:/|$)` },
      to: { path: `^packages/(?:${alternation(forbiddenDependencies)})(?:/|$)` },
    });
  }
  const crossModuleRoots = packageDefinition(sourcePackage).allowedDependencies;
  if (crossModuleRoots.length > 0) {
    rules.push({
      name: `package-policy-${sourcePackage}-no-cross-package-root-barrels`,
      severity: "error",
      from: { path: `^packages/${sourcePackage}(?:/|$)` },
      to: { path: `^packages/(?:${alternation(crossModuleRoots)})/index\\.[cm]?[jt]sx?$` },
    });
  }
  return rules;
});

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...packageDependencyRules,
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)node_modules/|(^|/)\\.next/|(^|/)tmp/|(^|/)generated/",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};
