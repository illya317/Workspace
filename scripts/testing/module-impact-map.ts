import fs from "node:fs";

export type ChangeClass = "C1" | "C2" | "C3";
export type ImpactTrait = "api" | "auth" | "latency" | "read-only" | "server" | "ui" | "write";

export interface ImpactPathSet {
  prefixes: string[];
  files: string[];
}

export interface E2eImpactSuite {
  id: string;
  tier: "critical" | "nightly";
  kind: "playwright";
  selection: {
    grep: string;
  };
  specs: string[];
  covers: string[];
}

export interface ModuleImpactDefinition {
  id: string;
  roots: ImpactPathSet;
  potentialWritePrefixes: string[];
}

export interface ModuleImpactRule {
  id: string;
  modules: string[];
  paths: ImpactPathSet;
  traits: ImpactTrait[];
  riskFloor: ChangeClass;
  requiredSuites: string[];
}

export interface ModuleImpactMap {
  schemaVersion: 1;
  policies: {
    unmatchedModulePath: "C3";
    unmappedWritePath: "C3";
  };
  suites: E2eImpactSuite[];
  modules: ModuleImpactDefinition[];
  rules: ModuleImpactRule[];
}

export interface ResolvedModuleImpact {
  affectedModules: string[];
  matchedRuleIds: string[];
  requiredSuites: string[];
  potentialWritePaths: string[];
  unmappedModulePaths: string[];
  unmappedWritePaths: string[];
  riskFloor: ChangeClass | null;
  failClosed: boolean;
}

const CHANGE_CLASSES = new Set<ChangeClass>(["C1", "C2", "C3"]);
const IMPACT_TRAITS = new Set<ImpactTrait>([
  "api",
  "auth",
  "latency",
  "read-only",
  "server",
  "ui",
  "write",
]);
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const RISK_ORDER: Record<ChangeClass, number> = { C1: 1, C2: 2, C3: 3 };

function recordAt(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: string[], location: string) {
  const expected = new Set(keys);
  const missing = keys.filter((key) => !(key in record));
  const unknown = Object.keys(record).filter((key) => !expected.has(key));
  if (missing.length > 0) throw new Error(`${location} is missing: ${missing.join(", ")}`);
  if (unknown.length > 0) throw new Error(`${location} has unknown keys: ${unknown.join(", ")}`);
}

function stringAt(value: unknown, location: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${location} must be a non-empty string`);
  if (value !== value.trim()) throw new Error(`${location} must not contain surrounding whitespace`);
  return value;
}

function stringArrayAt(value: unknown, location: string, options: { allowEmpty?: boolean } = {}) {
  if (!Array.isArray(value)) throw new Error(`${location} must be an array`);
  const values = value.map((item, index) => stringAt(item, `${location}[${index}]`));
  if (!options.allowEmpty && values.length === 0) throw new Error(`${location} must not be empty`);
  const duplicate = values.find((item, index) => values.indexOf(item) !== index);
  if (duplicate) throw new Error(`${location} contains duplicate value: ${duplicate}`);
  return values;
}

function idAt(value: unknown, location: string) {
  const id = stringAt(value, location);
  if (!ID_PATTERN.test(id)) throw new Error(`${location} must match ${ID_PATTERN}`);
  return id;
}

function repoPathAt(value: unknown, location: string, kind: "file" | "prefix") {
  const repoPath = stringAt(value, location);
  if (
    repoPath.startsWith("/")
    || repoPath.includes("\\")
    || repoPath.split("/").includes("..")
    || repoPath.includes("//")
  ) {
    throw new Error(`${location} must be a normalized repository-relative path`);
  }
  if (kind === "prefix" && !repoPath.endsWith("/")) {
    throw new Error(`${location} prefix must end with /`);
  }
  if (kind === "file" && repoPath.endsWith("/")) {
    throw new Error(`${location} file must not end with /`);
  }
  return repoPath;
}

function pathArrayAt(value: unknown, location: string, kind: "file" | "prefix") {
  const paths = stringArrayAt(value, location, { allowEmpty: true })
    .map((item, index) => repoPathAt(item, `${location}[${index}]`, kind));
  return paths;
}

function pathSetAt(value: unknown, location: string): ImpactPathSet {
  const record = recordAt(value, location);
  exactKeys(record, ["prefixes", "files"], location);
  const prefixes = pathArrayAt(record.prefixes, `${location}.prefixes`, "prefix");
  const files = pathArrayAt(record.files, `${location}.files`, "file");
  if (prefixes.length === 0 && files.length === 0) throw new Error(`${location} must select at least one path`);
  return { prefixes, files };
}

function uniqueIds<T extends { id: string }>(values: T[], location: string) {
  const duplicate = values.find((item, index) => values.findIndex((candidate) => candidate.id === item.id) !== index);
  if (duplicate) throw new Error(`${location} contains duplicate id: ${duplicate.id}`);
}

function suiteAt(value: unknown, index: number): E2eImpactSuite {
  const location = `module impact map.suites[${index}]`;
  const record = recordAt(value, location);
  exactKeys(record, ["id", "tier", "kind", "selection", "specs", "covers"], location);
  const id = idAt(record.id, `${location}.id`);
  const tier = stringAt(record.tier, `${location}.tier`);
  if (tier !== "critical" && tier !== "nightly") throw new Error(`${location}.tier must be critical or nightly`);
  if (record.kind !== "playwright") throw new Error(`${location}.kind must be playwright`);
  const selectionRecord = recordAt(record.selection, `${location}.selection`);
  exactKeys(selectionRecord, ["grep"], `${location}.selection`);
  const grep = stringAt(selectionRecord.grep, `${location}.selection.grep`);
  if (!grep.startsWith("@")) throw new Error(`${location}.selection.grep must be a Playwright @tag`);
  const specs = pathArrayAt(record.specs, `${location}.specs`, "file");
  if (specs.length === 0 || specs.some((spec) => !spec.startsWith("e2e/") || !spec.endsWith(".spec.ts"))) {
    throw new Error(`${location}.specs must contain e2e/*.spec.ts files`);
  }
  const covers = stringArrayAt(record.covers, `${location}.covers`);
  return { id, tier, kind: "playwright", selection: { grep }, specs, covers };
}

function moduleAt(value: unknown, index: number): ModuleImpactDefinition {
  const location = `module impact map.modules[${index}]`;
  const record = recordAt(value, location);
  exactKeys(record, ["id", "roots", "potentialWritePrefixes"], location);
  return {
    id: idAt(record.id, `${location}.id`),
    roots: pathSetAt(record.roots, `${location}.roots`),
    potentialWritePrefixes: pathArrayAt(
      record.potentialWritePrefixes,
      `${location}.potentialWritePrefixes`,
      "prefix",
    ),
  };
}

function ruleAt(value: unknown, index: number): ModuleImpactRule {
  const location = `module impact map.rules[${index}]`;
  const record = recordAt(value, location);
  exactKeys(record, ["id", "modules", "paths", "traits", "riskFloor", "requiredSuites"], location);
  const riskFloor = stringAt(record.riskFloor, `${location}.riskFloor`);
  if (!CHANGE_CLASSES.has(riskFloor as ChangeClass)) throw new Error(`${location}.riskFloor must be C1, C2, or C3`);
  const traits = stringArrayAt(record.traits, `${location}.traits`).map((trait) => {
    if (!IMPACT_TRAITS.has(trait as ImpactTrait)) throw new Error(`${location}.traits contains unknown trait: ${trait}`);
    return trait as ImpactTrait;
  });
  const requiredSuites = stringArrayAt(record.requiredSuites, `${location}.requiredSuites`);
  if (traits.includes("read-only") && traits.includes("write")) {
    throw new Error(`${location} cannot be both read-only and write`);
  }
  if (traits.includes("write") && requiredSuites.length === 0) {
    throw new Error(`${location} write rule must require an E2E suite`);
  }
  return {
    id: idAt(record.id, `${location}.id`),
    modules: stringArrayAt(record.modules, `${location}.modules`).map((moduleId, moduleIndex) => (
      idAt(moduleId, `${location}.modules[${moduleIndex}]`)
    )),
    paths: pathSetAt(record.paths, `${location}.paths`),
    traits,
    riskFloor: riskFloor as ChangeClass,
    requiredSuites,
  };
}

export function validateModuleImpactMap(value: unknown): ModuleImpactMap {
  const record = recordAt(value, "module impact map");
  exactKeys(record, ["schemaVersion", "policies", "suites", "modules", "rules"], "module impact map");
  if (record.schemaVersion !== 1) throw new Error("module impact map.schemaVersion must be 1");

  const policiesRecord = recordAt(record.policies, "module impact map.policies");
  exactKeys(policiesRecord, ["unmatchedModulePath", "unmappedWritePath"], "module impact map.policies");
  if (policiesRecord.unmatchedModulePath !== "C3" || policiesRecord.unmappedWritePath !== "C3") {
    throw new Error("module impact map policies must fail closed to C3");
  }

  if (!Array.isArray(record.suites) || !Array.isArray(record.modules) || !Array.isArray(record.rules)) {
    throw new Error("module impact map suites, modules, and rules must be arrays");
  }
  const suites = record.suites.map(suiteAt);
  const modules = record.modules.map(moduleAt);
  const rules = record.rules.map(ruleAt);
  uniqueIds(suites, "module impact map.suites");
  uniqueIds(modules, "module impact map.modules");
  uniqueIds(rules, "module impact map.rules");

  const suiteIds = new Set(suites.map((suite) => suite.id));
  const moduleIds = new Set(modules.map((module) => module.id));
  for (const rule of rules) {
    for (const moduleId of rule.modules) {
      if (!moduleIds.has(moduleId)) throw new Error(`module impact rule ${rule.id} references unknown module: ${moduleId}`);
    }
    for (const suiteId of rule.requiredSuites) {
      if (!suiteIds.has(suiteId)) throw new Error(`module impact rule ${rule.id} references unknown suite: ${suiteId}`);
    }
  }

  return {
    schemaVersion: 1,
    policies: { unmatchedModulePath: "C3", unmappedWritePath: "C3" },
    suites,
    modules,
    rules,
  };
}

export function loadModuleImpactMap(
  source: string | URL = new URL("./module-impact-map.json", import.meta.url),
) {
  return validateModuleImpactMap(JSON.parse(fs.readFileSync(source, "utf8")) as unknown);
}

function matchesPathSet(repoPath: string, paths: ImpactPathSet) {
  return paths.files.includes(repoPath) || paths.prefixes.some((prefix) => repoPath.startsWith(prefix));
}

function validChangedPath(value: string) {
  try {
    return repoPathAt(value, "changed path", "file");
  } catch {
    return null;
  }
}

function highestRisk(values: ChangeClass[]) {
  return values.reduce<ChangeClass | null>((highest, value) => (
    !highest || RISK_ORDER[value] > RISK_ORDER[highest] ? value : highest
  ), null);
}

export function resolveModuleImpact(map: ModuleImpactMap, changedPaths: string[]): ResolvedModuleImpact {
  const affectedModules = new Set<string>();
  const matchedRuleIds = new Set<string>();
  const requiredSuites = new Set<string>();
  const potentialWritePaths = new Set<string>();
  const unmappedModulePaths = new Set<string>();
  const unmappedWritePaths = new Set<string>();
  const risks: ChangeClass[] = [];

  for (const rawPath of changedPaths) {
    const repoPath = validChangedPath(rawPath);
    if (!repoPath) {
      unmappedModulePaths.add(rawPath);
      continue;
    }
    const matchedModules = map.modules.filter((moduleDefinition) => (
      matchesPathSet(repoPath, moduleDefinition.roots)
    ));
    const matchedRules = map.rules.filter((rule) => matchesPathSet(repoPath, rule.paths));
    if (matchedRules.length === 0) unmappedModulePaths.add(repoPath);

    for (const moduleDefinition of matchedModules) {
      affectedModules.add(moduleDefinition.id);
      if (moduleDefinition.potentialWritePrefixes.some((prefix) => repoPath.startsWith(prefix))) {
        potentialWritePaths.add(repoPath);
      }
    }
    for (const rule of matchedRules) {
      matchedRuleIds.add(rule.id);
      risks.push(rule.riskFloor);
      for (const moduleId of rule.modules) affectedModules.add(moduleId);
      for (const suiteId of rule.requiredSuites) requiredSuites.add(suiteId);
    }
    if (
      potentialWritePaths.has(repoPath)
      && !matchedRules.some((rule) => (
        rule.traits.includes("write") || rule.traits.includes("read-only")
      ))
    ) {
      unmappedWritePaths.add(repoPath);
    }
  }

  const failClosed = unmappedModulePaths.size > 0 || unmappedWritePaths.size > 0;
  if (failClosed) risks.push("C3");
  return {
    affectedModules: [...affectedModules].sort(),
    matchedRuleIds: [...matchedRuleIds].sort(),
    requiredSuites: [...requiredSuites].sort(),
    potentialWritePaths: [...potentialWritePaths].sort(),
    unmappedModulePaths: [...unmappedModulePaths].sort(),
    unmappedWritePaths: [...unmappedWritePaths].sort(),
    riskFloor: highestRisk(risks),
    failClosed,
  };
}
