const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "../..");
const POLICY_PATH = path.join(__dirname, "package-dependency-policy.json");
const PACKAGE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function fail(message) {
  throw new Error(`[package-dependency-policy] ${message}`);
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys must be ${JSON.stringify(wanted)}, received ${JSON.stringify(actual)}`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validatePackageDependencyPolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("policy must be an object");
  exactKeys(input, ["schemaVersion", "tiers", "packages"], "policy");
  if (input.schemaVersion !== 1) fail(`unsupported schemaVersion ${String(input.schemaVersion)}`);
  if (!Array.isArray(input.tiers) || input.tiers.length === 0) fail("tiers must be a non-empty array");
  if (!Array.isArray(input.packages) || input.packages.length === 0) fail("packages must be a non-empty array");

  const tiers = new Map();
  const tierOrders = new Set();
  for (const [index, tier] of input.tiers.entries()) {
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) fail(`tiers[${index}] must be an object`);
    exactKeys(tier, ["name", "order"], `tiers[${index}]`);
    if (typeof tier.name !== "string" || !PACKAGE_NAME_PATTERN.test(tier.name)) {
      fail(`tiers[${index}].name must be a lowercase identifier`);
    }
    if (!Number.isSafeInteger(tier.order) || tier.order < 0) fail(`tier ${tier.name} order must be a non-negative integer`);
    if (tiers.has(tier.name)) fail(`duplicate tier ${tier.name}`);
    if (tierOrders.has(tier.order)) fail(`duplicate tier order ${tier.order}`);
    tiers.set(tier.name, tier);
    tierOrders.add(tier.order);
  }

  const packages = new Map();
  for (const [index, definition] of input.packages.entries()) {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      fail(`packages[${index}] must be an object`);
    }
    exactKeys(definition, ["name", "tier", "allowedDependencies"], `packages[${index}]`);
    if (typeof definition.name !== "string" || !PACKAGE_NAME_PATTERN.test(definition.name)) {
      fail(`packages[${index}].name must be a lowercase package identifier`);
    }
    if (packages.has(definition.name)) fail(`duplicate package ${definition.name}`);
    if (typeof definition.tier !== "string" || !tiers.has(definition.tier)) {
      fail(`package ${definition.name} references unknown tier ${String(definition.tier)}`);
    }
    if (!Array.isArray(definition.allowedDependencies)
      || definition.allowedDependencies.some((dependency) => typeof dependency !== "string")) {
      fail(`package ${definition.name} allowedDependencies must be a string array`);
    }
    const normalizedDependencies = [...new Set(definition.allowedDependencies)].sort();
    if (normalizedDependencies.length !== definition.allowedDependencies.length) {
      fail(`package ${definition.name} has duplicate allowedDependencies`);
    }
    if (JSON.stringify(normalizedDependencies) !== JSON.stringify(definition.allowedDependencies)) {
      fail(`package ${definition.name} allowedDependencies must be sorted`);
    }
    if (normalizedDependencies.includes(definition.name)) fail(`package ${definition.name} must not depend on itself`);
    packages.set(definition.name, definition);
  }

  for (const definition of packages.values()) {
    const sourceTier = tiers.get(definition.tier);
    for (const dependency of definition.allowedDependencies) {
      const target = packages.get(dependency);
      if (!target) fail(`package ${definition.name} references unknown package dependency ${dependency}`);
      const targetTier = tiers.get(target.tier);
      if (targetTier.order <= sourceTier.order) {
        fail(`package ${definition.name} (${sourceTier.name}) cannot depend on ${dependency} (${targetTier.name})`);
      }
    }
  }

  return deepFreeze(JSON.parse(JSON.stringify(input)));
}

function readPolicy(policyPath = POLICY_PATH) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  } catch (error) {
    fail(`cannot read ${policyPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validatePackageDependencyPolicy(parsed);
}

function packageDefinitionsByName(policy) {
  return new Map(policy.packages.map((definition) => [definition.name, definition]));
}

function assertWorkspacePackageCoverage(repositoryRoot = REPOSITORY_ROOT, policy = PACKAGE_DEPENDENCY_POLICY) {
  const packagesRoot = path.join(repositoryRoot, "packages");
  const actual = fs.readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(packagesRoot, entry.name, "package.json")))
    .map((entry) => entry.name)
    .sort();
  const expected = policy.packages.map((definition) => definition.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`workspace packages must match policy; actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  }
  for (const packageName of actual) {
    const packageJson = JSON.parse(fs.readFileSync(path.join(packagesRoot, packageName, "package.json"), "utf8"));
    if (packageJson.name !== `@workspace/${packageName}`) {
      fail(`packages/${packageName}/package.json name must be @workspace/${packageName}`);
    }
  }
  return true;
}

const PACKAGE_DEPENDENCY_POLICY = readPolicy();
assertWorkspacePackageCoverage(REPOSITORY_ROOT, PACKAGE_DEPENDENCY_POLICY);
const PACKAGE_DEFINITIONS = packageDefinitionsByName(PACKAGE_DEPENDENCY_POLICY);
const TIER_DEFINITIONS = new Map(PACKAGE_DEPENDENCY_POLICY.tiers.map((tier) => [tier.name, tier]));
const PACKAGE_NAMES = Object.freeze(PACKAGE_DEPENDENCY_POLICY.packages.map((definition) => definition.name));

function packageDefinition(packageName) {
  const definition = PACKAGE_DEFINITIONS.get(packageName);
  if (!definition) fail(`unknown package ${String(packageName)}`);
  return definition;
}

function packageTierOrder(packageName) {
  const definition = packageDefinition(packageName);
  const tier = TIER_DEFINITIONS.get(definition.tier);
  if (!tier) fail(`package ${packageName} references unknown tier ${definition.tier}`);
  return tier.order;
}

function workspacePackageAlias(packageName) {
  packageDefinition(packageName);
  return `@workspace/${packageName}`;
}

function packageNameFromWorkspaceSpecifier(specifier) {
  const match = typeof specifier === "string" ? specifier.match(/^@workspace\/([^/]+)(?:\/|$)/) : null;
  if (!match) return null;
  packageDefinition(match[1]);
  return match[1];
}

function isPackageDependencyAllowed(sourcePackage, targetPackage) {
  const source = packageDefinition(sourcePackage);
  packageDefinition(targetPackage);
  return sourcePackage === targetPackage || source.allowedDependencies.includes(targetPackage);
}

function forbiddenPackageDependenciesFor(sourcePackage) {
  packageDefinition(sourcePackage);
  return PACKAGE_NAMES.filter((targetPackage) => !isPackageDependencyAllowed(sourcePackage, targetPackage));
}

function packageNamesForTier(tierName) {
  if (!TIER_DEFINITIONS.has(tierName)) fail(`unknown tier ${String(tierName)}`);
  return PACKAGE_DEPENDENCY_POLICY.packages
    .filter((definition) => definition.tier === tierName)
    .map((definition) => definition.name);
}

module.exports = {
  PACKAGE_DEPENDENCY_POLICY,
  PACKAGE_NAMES,
  POLICY_PATH,
  REPOSITORY_ROOT,
  assertWorkspacePackageCoverage,
  forbiddenPackageDependenciesFor,
  isPackageDependencyAllowed,
  packageDefinition,
  packageNameFromWorkspaceSpecifier,
  packageNamesForTier,
  packageTierOrder,
  readPolicy,
  validatePackageDependencyPolicy,
  workspacePackageAlias,
};
