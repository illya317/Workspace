#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const RISK_ORDER = { C0: 0, C1: 1, C2: 2, C3: 3 };
const MAP_RISKS = new Set(["C1", "C2", "C3"]);
const MAP_TRAITS = new Set(["api", "auth", "latency", "read-only", "server", "ui", "write"]);
const DIFF_MODES = new Set(["two-dot", "three-dot"]);
const BUSINESS_MODULE_IDS = new Set([
  "administration",
  "capital-securities",
  "external",
  "finance",
  "hr",
  "inventory",
  "library",
  "production",
  "work",
]);
const BUSINESS_UI_PREFIX_PATTERN = /^packages\/(?:administration|capital-securities|external|finance|hr|inventory|library|production|work)\/ui\//;
const SOURCE_EXTENSION_PATTERN = /\.(?:cjs|css|cts|js|jsx|less|mjs|mts|prisma|sass|scss|ts|tsx)$/i;
const TEST_PATH_PATTERN = /(?:^e2e\/|(?:^|\/)(?:__tests__|test|tests|fixtures)\/|\.(?:spec|test)\.[cm]?[jt]sx?$)/i;

const ROOT_DOCUMENT_FILES = new Set([
  "AGENTS.md",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "LICENSE.md",
  "README.md",
  "SECURITY.md",
]);
const DOCUMENT_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);
const NESTED_DOCUMENT_BASENAMES = new Set(["AGENTS.md", "ARCHITECTURE.md", "MODULE.md", "README.md"]);
const PRESENTATION_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".less",
  ".otf",
  ".png",
  ".sass",
  ".scss",
  ".svg",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
]);

function objectAt(value, location) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} must be an object`);
  }
  return value;
}

function exactKeys(record, keys, location) {
  const expected = new Set(keys);
  const missing = keys.filter((key) => !(key in record));
  const unknown = Object.keys(record).filter((key) => !expected.has(key));
  if (missing.length > 0) throw new Error(`${location} is missing: ${missing.join(", ")}`);
  if (unknown.length > 0) throw new Error(`${location} has unknown keys: ${unknown.join(", ")}`);
}

function stringAt(value, location) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${location} must be a non-empty trimmed string`);
  }
  return value;
}

function stringArrayAt(value, location, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) throw new Error(`${location} must be an array`);
  const values = value.map((item, index) => stringAt(item, `${location}[${index}]`));
  if (!allowEmpty && values.length === 0) throw new Error(`${location} must not be empty`);
  if (new Set(values).size !== values.length) throw new Error(`${location} must not contain duplicates`);
  return values;
}

function repositoryPathAt(value, location, kind) {
  const repositoryPath = stringAt(value, location);
  if (
    repositoryPath.startsWith("/")
    || repositoryPath.includes("\\")
    || repositoryPath.includes("//")
    || repositoryPath.split("/").includes("..")
  ) {
    throw new Error(`${location} must be a normalized repository-relative path`);
  }
  if (kind === "prefix" && !repositoryPath.endsWith("/")) {
    throw new Error(`${location} prefix must end with /`);
  }
  if (kind === "file" && repositoryPath.endsWith("/")) {
    throw new Error(`${location} file must not end with /`);
  }
  return repositoryPath;
}

function pathSetAt(value, location) {
  const record = objectAt(value, location);
  exactKeys(record, ["prefixes", "files"], location);
  const prefixes = stringArrayAt(record.prefixes, `${location}.prefixes`, { allowEmpty: true })
    .map((item, index) => repositoryPathAt(item, `${location}.prefixes[${index}]`, "prefix"));
  const files = stringArrayAt(record.files, `${location}.files`, { allowEmpty: true })
    .map((item, index) => repositoryPathAt(item, `${location}.files[${index}]`, "file"));
  if (prefixes.length === 0 && files.length === 0) {
    throw new Error(`${location} must select at least one path`);
  }
  return { prefixes, files };
}

function idAt(value, location) {
  const id = stringAt(value, location);
  if (!ID_PATTERN.test(id)) throw new Error(`${location} must match ${ID_PATTERN}`);
  return id;
}

export function validateTrustedImpactMap(value) {
  const record = objectAt(value, "module impact map");
  exactKeys(record, ["schemaVersion", "policies", "suites", "modules", "rules"], "module impact map");
  if (record.schemaVersion !== 1) throw new Error("module impact map.schemaVersion must be 1");

  const policies = objectAt(record.policies, "module impact map.policies");
  exactKeys(policies, ["unmatchedModulePath", "unmappedWritePath"], "module impact map.policies");
  if (policies.unmatchedModulePath !== "C3" || policies.unmappedWritePath !== "C3") {
    throw new Error("module impact map policies must fail closed to C3");
  }
  if (!Array.isArray(record.suites) || !Array.isArray(record.modules) || !Array.isArray(record.rules)) {
    throw new Error("module impact map suites, modules, and rules must be arrays");
  }

  const suites = record.suites.map((valueAtIndex, index) => {
    const location = `module impact map.suites[${index}]`;
    const suite = objectAt(valueAtIndex, location);
    exactKeys(suite, ["id", "tier", "kind", "selection", "specs", "covers"], location);
    const id = idAt(suite.id, `${location}.id`);
    if (suite.tier !== "critical" && suite.tier !== "nightly") {
      throw new Error(`${location}.tier must be critical or nightly`);
    }
    if (suite.kind !== "playwright") throw new Error(`${location}.kind must be playwright`);
    const selection = objectAt(suite.selection, `${location}.selection`);
    exactKeys(selection, ["grep"], `${location}.selection`);
    const grep = stringAt(selection.grep, `${location}.selection.grep`);
    if (!grep.startsWith("@")) throw new Error(`${location}.selection.grep must be a Playwright tag`);
    const specs = stringArrayAt(suite.specs, `${location}.specs`)
      .map((item, specIndex) => repositoryPathAt(item, `${location}.specs[${specIndex}]`, "file"));
    if (specs.some((spec) => !spec.startsWith("e2e/") || !spec.endsWith(".spec.ts"))) {
      throw new Error(`${location}.specs must contain e2e/*.spec.ts paths`);
    }
    const covers = stringArrayAt(suite.covers, `${location}.covers`);
    return { id, tier: suite.tier, kind: "playwright", selection: { grep }, specs, covers };
  });

  const modules = record.modules.map((valueAtIndex, index) => {
    const location = `module impact map.modules[${index}]`;
    const moduleDefinition = objectAt(valueAtIndex, location);
    exactKeys(moduleDefinition, ["id", "roots", "potentialWritePrefixes"], location);
    const potentialWritePrefixes = stringArrayAt(
      moduleDefinition.potentialWritePrefixes,
      `${location}.potentialWritePrefixes`,
      { allowEmpty: true },
    ).map((item, prefixIndex) => repositoryPathAt(
      item,
      `${location}.potentialWritePrefixes[${prefixIndex}]`,
      "prefix",
    ));
    return {
      id: idAt(moduleDefinition.id, `${location}.id`),
      roots: pathSetAt(moduleDefinition.roots, `${location}.roots`),
      potentialWritePrefixes,
    };
  });

  const rules = record.rules.map((valueAtIndex, index) => {
    const location = `module impact map.rules[${index}]`;
    const rule = objectAt(valueAtIndex, location);
    exactKeys(rule, ["id", "modules", "paths", "traits", "riskFloor", "requiredSuites"], location);
    const riskFloor = stringAt(rule.riskFloor, `${location}.riskFloor`);
    if (!MAP_RISKS.has(riskFloor)) throw new Error(`${location}.riskFloor must be C1, C2, or C3`);
    const traits = stringArrayAt(rule.traits, `${location}.traits`).map((trait) => {
      if (!MAP_TRAITS.has(trait)) throw new Error(`${location}.traits contains unknown value: ${trait}`);
      return trait;
    });
    const modulesForRule = stringArrayAt(rule.modules, `${location}.modules`)
      .map((item, moduleIndex) => idAt(item, `${location}.modules[${moduleIndex}]`));
    const requiredSuites = stringArrayAt(rule.requiredSuites, `${location}.requiredSuites`);
    if (traits.includes("write") && requiredSuites.length === 0) {
      throw new Error(`${location} write rule must require an E2E suite`);
    }
    if (traits.includes("write") && traits.includes("read-only")) {
      throw new Error(`${location} traits write and read-only are mutually exclusive`);
    }
    if (traits.includes("write") && RISK_ORDER[riskFloor] < RISK_ORDER.C2) {
      throw new Error(`${location} write rule riskFloor must be C2 or C3`);
    }
    return {
      id: idAt(rule.id, `${location}.id`),
      modules: modulesForRule,
      paths: pathSetAt(rule.paths, `${location}.paths`),
      traits,
      riskFloor,
      requiredSuites,
    };
  });

  for (const [values, location] of [[suites, "suites"], [modules, "modules"], [rules, "rules"]]) {
    const ids = values.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error(`module impact map.${location} ids must be unique`);
  }
  const moduleIds = new Set(modules.map((module) => module.id));
  const suiteIds = new Set(suites.map((suite) => suite.id));
  for (const rule of rules) {
    for (const moduleId of rule.modules) {
      if (!moduleIds.has(moduleId)) throw new Error(`rule ${rule.id} references unknown module ${moduleId}`);
    }
    for (const suiteId of rule.requiredSuites) {
      if (!suiteIds.has(suiteId)) throw new Error(`rule ${rule.id} references unknown suite ${suiteId}`);
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

function matchesPathSet(repositoryPath, paths) {
  return paths.files.includes(repositoryPath)
    || paths.prefixes.some((prefix) => repositoryPath.startsWith(prefix));
}

export function resolveTrustedImpact(map, changedPaths) {
  const affectedModules = new Set();
  const matchedRuleIds = new Set();
  const requiredSuites = new Set();
  const traits = new Set();
  const unmappedModulePaths = new Set();
  const unmappedWritePaths = new Set();
  const riskFloors = [];

  for (const repositoryPath of changedPaths) {
    const matchedModules = map.modules.filter((definition) => matchesPathSet(repositoryPath, definition.roots));
    const matchedRules = map.rules.filter((rule) => matchesPathSet(repositoryPath, rule.paths));
    if (matchedRules.length === 0) unmappedModulePaths.add(repositoryPath);

    for (const definition of matchedModules) affectedModules.add(definition.id);
    for (const rule of matchedRules) {
      matchedRuleIds.add(rule.id);
      riskFloors.push(rule.riskFloor);
      for (const moduleId of rule.modules) affectedModules.add(moduleId);
      for (const suiteId of rule.requiredSuites) requiredSuites.add(suiteId);
      for (const trait of rule.traits) traits.add(trait);
    }

    const hasPotentialWrite = matchedModules.some((definition) => (
      definition.potentialWritePrefixes.some((prefix) => repositoryPath.startsWith(prefix))
    ));
    if (hasPotentialWrite && !matchedRules.some((rule) => (
      rule.traits.includes("write") || rule.traits.includes("read-only")
    ))) {
      unmappedWritePaths.add(repositoryPath);
    }
  }

  const failClosed = unmappedModulePaths.size > 0 || unmappedWritePaths.size > 0;
  if (failClosed) riskFloors.push("C3");
  const riskFloor = riskFloors.reduce((highest, risk) => (
    !highest || RISK_ORDER[risk] > RISK_ORDER[highest] ? risk : highest
  ), null);
  const suiteById = new Map(map.suites.map((suite) => [suite.id, suite]));
  const e2eSpecs = [...requiredSuites]
    .flatMap((suiteId) => suiteById.get(suiteId)?.specs ?? [])
    .filter((spec, index, values) => values.indexOf(spec) === index)
    .sort();

  return {
    affectedModules: [...affectedModules].sort(),
    matchedRuleIds: [...matchedRuleIds].sort(),
    requiredSuites: [...requiredSuites].sort(),
    traits: [...traits].sort(),
    unmappedModulePaths: [...unmappedModulePaths].sort(),
    unmappedWritePaths: [...unmappedWritePaths].sort(),
    riskFloor,
    e2eSpecs,
    failClosed,
  };
}

export function isDocumentationPath(repositoryPath) {
  if (repositoryPath.startsWith("docs/generated/")) return false;
  if (ROOT_DOCUMENT_FILES.has(repositoryPath)) return true;
  const basename = path.posix.basename(repositoryPath);
  if (
    NESTED_DOCUMENT_BASENAMES.has(basename)
    && (repositoryPath.startsWith("app/") || repositoryPath.startsWith("packages/") || repositoryPath.startsWith("scripts/"))
  ) return true;
  const extension = path.posix.extname(repositoryPath).toLowerCase();
  if (!DOCUMENT_EXTENSIONS.has(extension)) return false;
  return repositoryPath.startsWith("docs/")
    || repositoryPath.startsWith(".github/ISSUE_TEMPLATE/")
    || repositoryPath === ".github/PULL_REQUEST_TEMPLATE.md";
}

export function isPresentationOnlyPath(repositoryPath) {
  const extension = path.posix.extname(repositoryPath).toLowerCase();
  if (!PRESENTATION_EXTENSIONS.has(extension)) return false;
  return BUSINESS_UI_PREFIX_PATTERN.test(repositoryPath);
}

function fullJobMatrix() {
  return {
    runStatic: true,
    runNode: true,
    runType: true,
    runPostgresql: true,
    runBuild: true,
    runE2e: true,
    e2eMode: "full",
    typeMode: "full",
  };
}

function isGeneratedPath(repositoryPath) {
  return repositoryPath.startsWith("generated/")
    || repositoryPath.startsWith("docs/generated/")
    || repositoryPath.startsWith(".next/");
}

function isRunnerOrCiPath(repositoryPath) {
  return repositoryPath.startsWith(".github/workflows/")
    || repositoryPath.startsWith("scripts/ci/")
    || repositoryPath === "scripts/testing/module-impact-map.json"
    || repositoryPath === "scripts/testing/module-impact-map.ts"
    || repositoryPath.startsWith("scripts/testing/run-")
    || repositoryPath.startsWith("scripts/testing/e2e-")
    || repositoryPath === "playwright.config.ts"
    || repositoryPath === "ops/build-standalone-artifact.sh";
}

function isPublicContractPath(repositoryPath) {
  return repositoryPath.startsWith("app/api/")
    || /^packages\/[^/]+\/(?:index|module)\.ts$/.test(repositoryPath)
    || repositoryPath === "packages/platform/module-registry.ts"
    || repositoryPath.includes("action-contract")
    || repositoryPath.includes("api-contract");
}

function escalationReasons({ normalizedPaths, changes, lineStats, affectedModules }) {
  const reasons = [];
  const nonTestSourceFileCount = normalizedPaths.filter((repositoryPath) => (
    SOURCE_EXTENSION_PATTERN.test(repositoryPath)
    && !TEST_PATH_PATTERN.test(repositoryPath)
    && !isGeneratedPath(repositoryPath)
  )).length;
  const changedLineCount = lineStats
    .filter((item) => !isGeneratedPath(item.path))
    .reduce((total, item) => total + item.additions + item.deletions, 0);
  const businessModules = affectedModules.filter((moduleId) => BUSINESS_MODULE_IDS.has(moduleId));
  const binaryStats = lineStats.filter((item) => item.binary === true);
  const binaryChangedBytes = binaryStats.reduce((total, item) => total + (item.sizeBytes ?? 0), 0);
  const presentationStats = lineStats.filter((item) => isPresentationOnlyPath(item.path));
  const presentationChangedBytes = presentationStats
    .reduce((total, item) => total + (item.sizeBytes ?? 0), 0);
  if (nonTestSourceFileCount > 20) reasons.push("source-file-count-over-20");
  if (changedLineCount > 500) reasons.push("changed-lines-over-500");
  if (presentationStats.some((item) => (item.sizeBytes ?? 0) > 2 * 1024 * 1024)) {
    reasons.push("presentation-file-over-2mb");
  }
  if (binaryStats.some((item) => !isPresentationOnlyPath(item.path))) {
    reasons.push("non-presentation-binary-change");
  }
  if (presentationChangedBytes > 5 * 1024 * 1024) reasons.push("presentation-changes-over-5mb");
  if (normalizedPaths.filter(isPresentationOnlyPath).length > 20) reasons.push("presentation-file-count-over-20");
  if (new Set(businessModules).size >= 2) reasons.push("multiple-business-modules");
  if (changes.some((change) => (
    (change.status.startsWith("D") && change.paths.some((item) => TEST_PATH_PATTERN.test(item)))
    || (/^[RC]/.test(change.status)
      && TEST_PATH_PATTERN.test(change.paths[0] ?? "")
      && !TEST_PATH_PATTERN.test(change.paths[1] ?? ""))
  ))) {
    reasons.push("test-deletion");
  }
  if (normalizedPaths.some(isRunnerOrCiPath)) reasons.push("runner-or-ci-change");
  if (changes.some((change) => (
    /^[ADRC]/.test(change.status)
    && change.paths.some(isPublicContractPath)
  ))) {
    reasons.push("public-contract-shape-change");
  }
  return {
    reasons: [...new Set(reasons)],
    nonTestSourceFileCount,
    changedLineCount,
    binaryChangedBytes,
    presentationChangedBytes,
    businessModuleCount: new Set(businessModules).size,
  };
}

function finalizeClassification(base, context) {
  const escalation = escalationReasons({ ...context, affectedModules: base.affectedModules });
  if (escalation.reasons.length === 0) {
    return { ...base, ...escalation, escalationReasons: [] };
  }
  return {
    ...base,
    riskClass: "C3",
    reasonCodes: [...new Set([...base.reasonCodes, "size-or-contract-escalation"])],
    ...fullJobMatrix(),
    publishArtifact: context.publishRequested,
    ...escalation,
    escalationReasons: escalation.reasons,
  };
}

export function classifyChangedPaths({
  changedPaths,
  map,
  changes = changedPaths.map((repositoryPath) => ({ status: "M", paths: [repositoryPath] })),
  lineStats = [],
  forceFull = false,
  publishRequested = false,
  finalCandidate = false,
  eventName = "local",
}) {
  const normalizedPaths = [...new Set(changedPaths.map((item) => (
    repositoryPathAt(item, "changed path", "file")
  )))].sort();
  if (forceFull) {
    return finalizeClassification({
      schemaVersion: 1,
      riskClass: "C3",
      reasonCodes: ["forced-full"],
      changedFiles: normalizedPaths,
      documentationPaths: normalizedPaths.filter(isDocumentationPath),
      presentationPaths: normalizedPaths.filter(isPresentationOnlyPath),
      affectedModules: [],
      matchedRuleIds: [],
      requiredSuites: [],
      traits: [],
      unmappedModulePaths: [],
      unmappedWritePaths: [],
      e2eSpecs: [],
      ...fullJobMatrix(),
      publishArtifact: publishRequested,
      eventName,
    }, { normalizedPaths, changes, lineStats, publishRequested });
  }
  if (normalizedPaths.length === 0) {
    return finalizeClassification({
      schemaVersion: 1,
      riskClass: "C3",
      reasonCodes: ["empty-diff-fail-closed"],
      changedFiles: [],
      documentationPaths: [],
      presentationPaths: [],
      affectedModules: [],
      matchedRuleIds: [],
      requiredSuites: [],
      traits: [],
      unmappedModulePaths: [],
      unmappedWritePaths: [],
      e2eSpecs: [],
      ...fullJobMatrix(),
      publishArtifact: publishRequested,
      eventName,
    }, { normalizedPaths, changes, lineStats, publishRequested });
  }

  const documentationPaths = normalizedPaths.filter(isDocumentationPath);
  const nonDocumentationPaths = normalizedPaths.filter((item) => !isDocumentationPath(item));
  if (nonDocumentationPaths.length === 0) {
    return finalizeClassification({
      schemaVersion: 1,
      riskClass: "C0",
      reasonCodes: ["documentation-only"],
      changedFiles: normalizedPaths,
      documentationPaths,
      presentationPaths: [],
      affectedModules: [],
      matchedRuleIds: [],
      requiredSuites: [],
      traits: [],
      unmappedModulePaths: [],
      unmappedWritePaths: [],
      e2eSpecs: [],
      runStatic: true,
      runNode: false,
      runType: false,
      runPostgresql: false,
      runBuild: false,
      runE2e: false,
      e2eMode: "none",
      typeMode: "none",
      publishArtifact: false,
      eventName,
    }, { normalizedPaths, changes, lineStats, publishRequested });
  }

  const presentationPaths = nonDocumentationPaths.filter(isPresentationOnlyPath);
  const impactPaths = nonDocumentationPaths.filter((item) => !isPresentationOnlyPath(item));
  if (impactPaths.length === 0 && documentationPaths.length > 0) {
    return finalizeClassification({
      schemaVersion: 1,
      riskClass: "C3",
      reasonCodes: ["mixed-documentation-presentation-fail-closed"],
      changedFiles: normalizedPaths,
      documentationPaths,
      presentationPaths,
      affectedModules: [...new Set(presentationPaths.map((item) => item.split("/")[1]))].sort(),
      matchedRuleIds: [],
      requiredSuites: [],
      traits: ["ui"],
      unmappedModulePaths: [],
      unmappedWritePaths: [],
      e2eSpecs: [],
      ...fullJobMatrix(),
      publishArtifact: publishRequested,
      eventName,
    }, { normalizedPaths, changes, lineStats, publishRequested });
  }
  if (impactPaths.length === 0) {
    const presentationModules = [...new Set(presentationPaths.map((item) => item.split("/")[1]))].sort();
    const base = {
      schemaVersion: 1,
      riskClass: "C1",
      reasonCodes: ["presentation-only"],
      changedFiles: normalizedPaths,
      documentationPaths,
      presentationPaths,
      affectedModules: presentationModules,
      matchedRuleIds: [],
      requiredSuites: [],
      traits: ["ui"],
      unmappedModulePaths: [],
      unmappedWritePaths: [],
      e2eSpecs: [],
      runStatic: false,
      runNode: false,
      runType: false,
      runPostgresql: false,
      runBuild: publishRequested && finalCandidate,
      runE2e: false,
      e2eMode: "none",
      typeMode: "none",
      publishArtifact: publishRequested && finalCandidate,
      eventName,
    };
    return finalizeClassification(base, { normalizedPaths, changes, lineStats, publishRequested });
  }

  const impact = resolveTrustedImpact(map, impactPaths);
  const presentationModules = presentationPaths.map((item) => item.split("/")[1]);
  impact.affectedModules = [...new Set([...impact.affectedModules, ...presentationModules])].sort();
  const riskClass = impact.riskFloor ?? "C3";
  const failClosed = riskClass === "C3" || impact.failClosed;
  const targetedE2e = riskClass === "C2" && impact.e2eSpecs.length > 0;
  const runBuild = riskClass === "C2" || riskClass === "C3" || (publishRequested && finalCandidate);
  const base = {
    schemaVersion: 1,
    riskClass,
    reasonCodes: failClosed ? ["impact-map", "fail-closed"] : ["impact-map"],
    changedFiles: normalizedPaths,
    documentationPaths,
    presentationPaths,
    ...impact,
    runStatic: true,
    runNode: true,
    runType: true,
    runPostgresql: riskClass === "C3"
      || (riskClass === "C2" && impact.traits.some((trait) => trait === "server" || trait === "write")),
    runBuild,
    runE2e: riskClass === "C3" || targetedE2e,
    e2eMode: riskClass === "C3" ? "full" : targetedE2e ? "targeted" : "none",
    typeMode: riskClass === "C3" ? "full" : "affected",
    publishArtifact: publishRequested && runBuild,
    eventName,
  };
  return finalizeClassification(base, { normalizedPaths, changes, lineStats, publishRequested });
}

function runGit(cwd, args, { allowFailure = false, encoding = "utf8" } = {}) {
  const result = spawnSync("git", args, { cwd, encoding });
  if (result.status !== 0 && !allowFailure) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`git ${args.join(" ")} failed${stderr?.trim() ? `: ${stderr.trim()}` : ""}`);
  }
  return result;
}

export function parseNameStatusZero(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) throw new Error("git diff emitted an empty status field");
    const kind = status[0];
    if (kind === "R" || kind === "C") {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (!oldPath || !newPath) throw new Error(`git diff emitted an incomplete ${status} record`);
      changes.push({ status, paths: [oldPath, newPath] });
    } else {
      const changedPath = fields[index++];
      if (!changedPath) throw new Error(`git diff emitted an incomplete ${status} record`);
      changes.push({ status, paths: [changedPath] });
    }
  }
  return changes;
}

export function parseNumstatZero(buffer) {
  const records = buffer.toString("utf8").split("\0").filter(Boolean);
  return records.map((record) => {
    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (firstTab < 1 || secondTab < 0) throw new Error("git diff emitted an invalid numstat record");
    const additionsRaw = record.slice(0, firstTab);
    const deletionsRaw = record.slice(firstTab + 1, secondTab);
    const changedPath = record.slice(secondTab + 1);
    if (!changedPath) throw new Error("git diff emitted a numstat record without a path");
    const binary = additionsRaw === "-" || deletionsRaw === "-";
    const additions = additionsRaw === "-" ? 0 : Number(additionsRaw);
    const deletions = deletionsRaw === "-" ? 0 : Number(deletionsRaw);
    if (!Number.isSafeInteger(additions) || !Number.isSafeInteger(deletions)) {
      throw new Error(`git diff emitted invalid line counts for ${changedPath}`);
    }
    return { path: changedPath, additions, deletions, binary };
  });
}

export function readRepositoryChanges({ cwd, baseSha, headSha, diffMode = "three-dot" }) {
  if (!SHA_PATTERN.test(baseSha) || !SHA_PATTERN.test(headSha)) {
    throw new Error("base and head must be full lowercase 40-character Git SHAs");
  }
  if (!DIFF_MODES.has(diffMode)) throw new Error("diff mode must be two-dot or three-dot");
  for (const [name, sha] of [["base", baseSha], ["head", headSha]]) {
    const resolved = runGit(cwd, ["rev-parse", "--verify", `${sha}^{commit}`]).stdout.trim();
    if (resolved !== sha) throw new Error(`${name} SHA did not resolve exactly: ${sha}`);
  }
  const range = diffMode === "two-dot" ? `${baseSha}..${headSha}` : `${baseSha}...${headSha}`;
  const result = runGit(cwd, ["diff", "--name-status", "-z", "--find-renames", range, "--"], { encoding: "buffer" });
  const numstat = runGit(cwd, ["diff", "--numstat", "-z", "--no-renames", range, "--"], { encoding: "buffer" });
  const lineStats = parseNumstatZero(numstat.stdout).map((item) => {
    if (!item.binary && !isPresentationOnlyPath(item.path)) return item;
    const headSize = runGit(cwd, ["cat-file", "-s", `${headSha}:${item.path}`], { allowFailure: true });
    const baseSize = headSize.status === 0
      ? null
      : runGit(cwd, ["cat-file", "-s", `${baseSha}:${item.path}`], { allowFailure: true });
    const sizeBytes = Number((headSize.status === 0 ? headSize.stdout : baseSize?.stdout ?? "0").trim());
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new Error(`cannot determine changed blob size for ${item.path}`);
    }
    return { ...item, sizeBytes };
  });
  return { changes: parseNameStatusZero(result.stdout), lineStats };
}

export function loadTrustedMapFromRevision({ cwd, baseSha }) {
  const result = runGit(
    cwd,
    ["show", `${baseSha}:scripts/testing/module-impact-map.json`],
    { allowFailure: true },
  );
  if (result.status !== 0) {
    throw new Error(`trusted base ${baseSha} does not contain scripts/testing/module-impact-map.json`);
  }
  return validateTrustedImpactMap(JSON.parse(result.stdout));
}

export function failClosedClassification({ eventName, publishRequested, reason, baseSha, headSha, diffMode }) {
  return {
    schemaVersion: 1,
    riskClass: "C3",
    reasonCodes: ["classifier-input-fail-closed"],
    failureReason: reason,
    baseSha,
    headSha,
    diffMode,
    changedFiles: [],
    documentationPaths: [],
    presentationPaths: [],
    affectedModules: [],
    matchedRuleIds: [],
    requiredSuites: [],
    traits: [],
    unmappedModulePaths: [],
    unmappedWritePaths: [],
    e2eSpecs: [],
    ...fullJobMatrix(),
    publishArtifact: publishRequested,
    eventName,
  };
}

export function classifyRepositoryDiff({
  cwd = process.cwd(),
  baseSha,
  headSha,
  diffMode = "three-dot",
  forceFull = false,
  publishRequested = false,
  finalCandidate = false,
  eventName = "local",
}) {
  try {
    const { changes, lineStats } = readRepositoryChanges({ cwd, baseSha, headSha, diffMode });
    const changedPaths = changes.flatMap((change) => change.paths);
    let classification;
    if (forceFull) {
      classification = classifyChangedPaths({
        changedPaths,
        changes,
        lineStats,
        map: null,
        forceFull,
        publishRequested,
        finalCandidate,
        eventName,
      });
    } else {
      const needsImpactMap = changedPaths.some((repositoryPath) => (
        !isDocumentationPath(repositoryPath) && !isPresentationOnlyPath(repositoryPath)
      ));
      const map = needsImpactMap ? loadTrustedMapFromRevision({ cwd, baseSha }) : null;
      classification = classifyChangedPaths({
        changedPaths,
        changes,
        lineStats,
        map,
        publishRequested,
        finalCandidate,
        eventName,
      });
    }
    return { ...classification, baseSha, headSha, diffMode, changes, lineStats };
  } catch (error) {
    return failClosedClassification({
      eventName,
      publishRequested,
      reason: error instanceof Error ? error.message : String(error),
      baseSha,
      headSha,
      diffMode,
    });
  }
}

function parseArguments(argv) {
  const options = {
    cwd: process.cwd(),
    diffMode: "three-dot",
    eventName: "local",
    forceFull: false,
    publishRequested: false,
    finalCandidate: false,
    githubOutput: null,
    summary: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force-full") options.forceFull = true;
    else if (argument === "--publish-requested") options.publishRequested = true;
    else if (argument === "--final-candidate") options.finalCandidate = true;
    else if (argument === "--base") options.baseSha = argv[++index];
    else if (argument === "--head") options.headSha = argv[++index];
    else if (argument === "--cwd") options.cwd = argv[++index];
    else if (argument === "--diff-mode") options.diffMode = argv[++index];
    else if (argument === "--event") options.eventName = argv[++index];
    else if (argument === "--github-output") options.githubOutput = argv[++index];
    else if (argument === "--summary") options.summary = argv[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!options.baseSha || !options.headSha) throw new Error("--base and --head are required");
  return options;
}

function githubOutputs(classification) {
  const classificationEvidence = {
    schemaVersion: classification.schemaVersion,
    riskClass: classification.riskClass,
    e2eMode: classification.e2eMode,
    requiredSuites: classification.requiredSuites,
    e2eSpecs: classification.e2eSpecs,
    reasonCodes: classification.reasonCodes,
    escalationReasons: classification.escalationReasons ?? [],
    changedLineCount: classification.changedLineCount ?? null,
    binaryChangedBytes: classification.binaryChangedBytes ?? null,
    presentationChangedBytes: classification.presentationChangedBytes ?? null,
    nonTestSourceFileCount: classification.nonTestSourceFileCount ?? null,
    businessModuleCount: classification.businessModuleCount ?? null,
  };
  return {
    risk_class: classification.riskClass,
    run_static: String(classification.runStatic),
    run_node: String(classification.runNode),
    run_type: String(classification.runType),
    run_postgresql: String(classification.runPostgresql),
    run_build: String(classification.runBuild),
    run_e2e: String(classification.runE2e),
    e2e_mode: classification.e2eMode,
    type_mode: classification.typeMode,
    e2e_specs_json: JSON.stringify(classification.e2eSpecs),
    required_suites_json: JSON.stringify(classification.requiredSuites),
    affected_modules_json: JSON.stringify(classification.affectedModules),
    changed_files_json: JSON.stringify(classification.changedFiles),
    publish_artifact: String(classification.publishArtifact),
    classification_json: JSON.stringify(classificationEvidence),
  };
}

function markdownSummary(classification) {
  const rows = [
    ["Risk", classification.riskClass],
    ["Changed paths", String(classification.changedFiles.length)],
    ["Reasons", classification.reasonCodes.join(", ")],
    ["Affected modules", classification.affectedModules.join(", ") || "none"],
    ["Required E2E suites", classification.requiredSuites.join(", ") || "none"],
    ["E2E mode", classification.e2eMode],
    ["Publish artifact", String(classification.publishArtifact)],
  ];
  if (classification.failureReason) rows.push(["Fail-closed reason", classification.failureReason]);
  return [
    "## CI risk classification",
    "",
    "| Field | Value |",
    "|---|---|",
    ...rows.map(([key, value]) => `| ${key} | ${String(value).replaceAll("|", "\\|")} |`),
    "",
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const classification = classifyRepositoryDiff(options);
  process.stdout.write(`${JSON.stringify(classification, null, 2)}\n`);
  if (options.githubOutput) {
    const lines = Object.entries(githubOutputs(classification)).map(([key, value]) => `${key}=${value}`);
    fs.appendFileSync(options.githubOutput, `${lines.join("\n")}\n`);
  }
  if (options.summary) fs.appendFileSync(options.summary, `${markdownSummary(classification)}\n`);
  return classification;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
