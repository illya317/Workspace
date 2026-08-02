import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

export const NEXT_COMPILER_CACHE_SCHEMA_VERSION = 2;
export const NEXT_COMPILER_CACHE_KIND = "workspace-next-compiler-cache";
export const NEXT_COMPILER_CACHE_EVIDENCE_KIND = "workspace-next-compiler-cache-evidence";

const SHA256 = /^[0-9a-f]{64}$/;
const TARGET_ID = /^(?:monolith|[a-z][a-z0-9-]*)$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]));
}

export const canonicalJson = (value) => JSON.stringify(canonicalize(value));
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value ?? {}).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} fields are invalid`);
  }
}

function targetIdentity(options) {
  const id = options.targetId;
  if (!TARGET_ID.test(id ?? "")) throw new Error("targetId is invalid");
  const kind = id === "monolith" ? "monolith" : "unit";
  const appRoot = options.appRoot;
  if (kind === "monolith") {
    if (appRoot !== ".") throw new Error("monolith appRoot must be .");
  } else if (typeof appRoot !== "string" || appRoot.length === 0
    || path.isAbsolute(appRoot) || path.win32.isAbsolute(appRoot)
    || appRoot.includes("\\") || path.posix.normalize(appRoot) !== appRoot
    || appRoot === "." || appRoot === ".." || appRoot.startsWith("../")) {
    throw new Error("appRoot must be a normalized repo-relative path");
  }
  return { kind, id, appRoot };
}

export function pathExists(target) {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function assertRealFile(file, label) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a real file`);
  return file;
}

export function assertRealDirectory(directory, label) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  return directory;
}

function assertNormalizedAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.normalize(value) !== value) {
    throw new Error(`${label} must be a normalized absolute path`);
  }
  return value;
}

function assertExactPath(actual, expected, label) {
  assertNormalizedAbsolutePath(actual, label);
  if (actual !== expected) throw new Error(`${label} must equal ${expected}`);
}

function assertRealDirectoryAncestors(repositoryRoot, target, label) {
  const relative = path.relative(repositoryRoot, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must remain inside repositoryRoot`);
  }
  let current = repositoryRoot;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    if (!pathExists(current)) break;
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`${label} has an unsafe parent directory`);
    }
  }
}

export function resolveOutputRoot(repositoryRoot, outputRoot) {
  const root = assertNormalizedAbsolutePath(repositoryRoot, "repositoryRoot");
  assertRealDirectory(root, "repositoryRoot");
  if (typeof outputRoot !== "string" || outputRoot.length === 0 || outputRoot.endsWith(path.sep)
    || path.win32.isAbsolute(outputRoot) && !path.isAbsolute(outputRoot)
    || path.normalize(outputRoot) !== outputRoot) {
    throw new Error("outputRoot must be a normalized repository path");
  }
  const resolved = path.isAbsolute(outputRoot) ? outputRoot : path.resolve(root, outputRoot);
  const relative = path.relative(root, resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("outputRoot must remain inside repositoryRoot");
  }
  assertRealDirectoryAncestors(root, path.join(resolved, ".output-root-probe"), "outputRoot");
  if (pathExists(resolved)) assertRealDirectory(resolved, "outputRoot");
  return resolved;
}

function validateInputPaths(options) {
  const root = assertNormalizedAbsolutePath(options.repositoryRoot, "repositoryRoot");
  assertRealDirectory(root, "repositoryRoot");
  const target = targetIdentity(options);
  const outputRoot = resolveOutputRoot(root, options.outputRoot);
  if (target.kind === "unit") {
    assertExactPath(options.contractFile, path.join(outputRoot, "deploy-unit-contract.json"), "contractFile");
    assertExactPath(
      options.navigationManifestFile,
      path.join(outputRoot, "deploy-navigation-manifest.json"),
      "navigationManifestFile",
    );
    assertRealDirectoryAncestors(root, options.contractFile, "contractFile");
    assertRealDirectoryAncestors(root, options.navigationManifestFile, "navigationManifestFile");
    assertRealFile(options.contractFile, "deploy unit contract");
    assertRealFile(options.navigationManifestFile, "deploy navigation manifest");
  } else if (options.contractFile || options.navigationManifestFile) {
    throw new Error("monolith compiler cache does not accept unit contract inputs");
  }
  return { root, target, outputRoot };
}

export function validateOperationPaths(options) {
  const inputPaths = validateInputPaths(options);
  const { root, target, outputRoot } = inputPaths;
  const cacheRoot = target.kind === "monolith"
    ? path.join(root, ".cache", "next-targets", "monolith")
    : path.join(root, ".cache", "next-units", target.id);
  const quarantineRoot = target.kind === "monolith"
    ? path.join(root, ".cache", "quarantine", "next-targets")
    : path.join(root, ".cache", "quarantine", "next-units");
  const buildDirectory = target.kind === "monolith"
    ? path.join(root, ".next")
    : path.join(root, target.appRoot, ".next");
  assertExactPath(options.cacheRoot, cacheRoot, "cacheRoot");
  assertExactPath(options.quarantineRoot, quarantineRoot, "quarantineRoot");
  assertExactPath(options.evidenceFile, path.join(outputRoot, "next-compiler-cache.json"), "evidenceFile");
  assertExactPath(options.buildDirectory, buildDirectory, "buildDirectory");
  for (const [label, location] of [
    ["cacheRoot", options.cacheRoot],
    ["quarantineRoot", options.quarantineRoot],
    ["evidenceFile", options.evidenceFile],
    ["buildDirectory", options.buildDirectory],
  ]) assertRealDirectoryAncestors(root, location, label);
  if (pathExists(options.quarantineRoot)) assertRealDirectory(options.quarantineRoot, "quarantineRoot");
  if (pathExists(options.buildDirectory)) assertRealDirectory(options.buildDirectory, "buildDirectory");
  if (pathExists(options.evidenceFile)) assertRealFile(options.evidenceFile, "evidenceFile");
  return inputPaths;
}

const fileDigest = (file, label) => sha256(readFileSync(assertRealFile(file, label)));

function readJsonFile(file, label) {
  try {
    return JSON.parse(readFileSync(assertRealFile(file, label), "utf8"));
  } catch (error) {
    throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : error}`);
  }
}

function runtimeIdentity(override) {
  const runtime = override ?? { nodeVersion: process.version, platform: process.platform, arch: process.arch };
  assertExactKeys(runtime, ["nodeVersion", "platform", "arch"], "runtime");
  for (const [key, value] of Object.entries(runtime)) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`runtime.${key} is required`);
  }
  return runtime;
}

function buildEnvironmentIdentity(override, target, buildProfile) {
  const environment = override ?? {
    buildProfile: buildProfile ?? `${target.kind}-standalone-default`,
    cacheEngine: "turbopack-filesystem-build-v1",
    nodeEnv: "production",
    outputMode: "standalone",
    targetKind: target.kind,
  };
  const keys = Object.keys(environment).sort();
  if (keys.length === 0 || keys.some((key) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(key))) {
    throw new Error("buildEnvironment keys are invalid");
  }
  for (const value of Object.values(environment)) {
    if (typeof value !== "string" || value.length === 0) throw new Error("buildEnvironment values are required");
  }
  return Object.fromEntries(keys.map((key) => [key, environment[key]]));
}

function normalizeRepositoryPath(repositoryRoot, file, label) {
  const relative = path.relative(repositoryRoot, path.resolve(file)).split(path.sep).join("/");
  if (relative === "" || relative === ".." || relative.startsWith("../")) {
    throw new Error(`${label} must remain inside repositoryRoot`);
  }
  return relative;
}

function inputFile(repositoryRoot, key, file, label = key, logicalPath = null) {
  return {
    key,
    path: logicalPath ?? normalizeRepositoryPath(repositoryRoot, file, label),
    digest: fileDigest(file, label),
  };
}

function nextConfigPath(repositoryRoot, appRoot) {
  const directory = appRoot === "." ? repositoryRoot : path.join(repositoryRoot, appRoot);
  const candidates = ["next.config.ts", "next.config.mjs", "next.config.js"]
    .map((name) => path.join(directory, name)).filter(pathExists);
  if (candidates.length !== 1) throw new Error(`${appRoot} must have exactly one Next config`);
  return candidates[0];
}

function relevantUnitTsconfigPaths(repositoryRoot, appRoot, contract) {
  return [...new Set([
    path.join(repositoryRoot, "tsconfig.base.json"),
    path.join(repositoryRoot, appRoot, "tsconfig.json"),
    ...(contract.compiler?.projects ?? []).map((project) => path.join(repositoryRoot, project)),
  ])].map((file) => path.resolve(file)).sort((left, right) => left.localeCompare(right));
}

function targetInputFiles(root, target, options) {
  if (target.kind === "monolith") {
    return [
      inputFile(root, "package-lock", path.join(root, "package-lock.json")),
      inputFile(root, "package-json", path.join(root, "package.json")),
      inputFile(root, "next-config", nextConfigPath(root, target.appRoot)),
      inputFile(root, "tsconfig:tsconfig.base.json", path.join(root, "tsconfig.base.json")),
      inputFile(root, "tsconfig:tsconfig.app.json", path.join(root, "tsconfig.app.json")),
      inputFile(root, "standalone-output-preparer", path.join(root, "scripts/check/prepare-standalone-output.js")),
    ];
  }
  const contract = readJsonFile(options.contractFile, "deploy unit contract");
  if (contract.id !== target.id) throw new Error("deploy unit contract target does not match");
  if (contract.build?.appRoot !== target.appRoot) throw new Error("deploy unit contract appRoot does not match");
  if (!Array.isArray(contract.compiler?.projects)) throw new Error("deploy unit compiler projects are missing");
  return [
    inputFile(root, "package-lock", path.join(root, "package-lock.json")),
    inputFile(root, "next-config", nextConfigPath(root, target.appRoot)),
    inputFile(root, "deploy-unit-spec", path.join(root, "scripts/deploy/deploy-unit-spec.ts")),
    inputFile(root, "deploy-unit-app-generator", path.join(root, "scripts/deploy/deploy-unit-app-generator.ts")),
    inputFile(root, "generated-contract", options.contractFile, "deploy unit contract", "generated/deploy-unit-contract.json"),
    inputFile(
      root,
      "generated-navigation",
      options.navigationManifestFile,
      "deploy navigation manifest",
      "generated/deploy-navigation-manifest.json",
    ),
    ...relevantUnitTsconfigPaths(root, target.appRoot, contract).map((file) => {
      const relative = normalizeRepositoryPath(root, file, "tsconfig");
      return inputFile(root, `tsconfig:${relative}`, file, `tsconfig ${relative}`);
    }),
  ];
}

export function computeCompilerCacheInput(options = {}) {
  const { root, target } = validateInputPaths(options);
  const nextPackageFile = path.join(root, "node_modules", "next", "package.json");
  const nextPackage = readJsonFile(nextPackageFile, "Next package");
  if (nextPackage.name !== "next" || typeof nextPackage.version !== "string" || nextPackage.version.length === 0) {
    throw new Error("Next package identity is invalid");
  }
  const files = [
    ...targetInputFiles(root, target, options),
    inputFile(root, "next-package", nextPackageFile),
  ].sort((left, right) => left.key.localeCompare(right.key));
  const input = {
    target,
    runtime: runtimeIdentity(options.runtime),
    buildEnvironment: buildEnvironmentIdentity(options.buildEnvironment, target, options.buildProfile),
    nextPackage: {
      name: nextPackage.name,
      version: nextPackage.version,
      packageJsonDigest: files.find((entry) => entry.key === "next-package").digest,
    },
    files,
  };
  return { ...input, inputDigest: sha256(canonicalJson(input)) };
}

export function createReceipt(input, storedAt = new Date().toISOString()) {
  if (Number.isNaN(Date.parse(storedAt))) throw new Error("storedAt must be an ISO timestamp");
  const unsigned = {
    schemaVersion: NEXT_COMPILER_CACHE_SCHEMA_VERSION,
    kind: NEXT_COMPILER_CACHE_KIND,
    target: input.target,
    input: {
      target: input.target,
      runtime: input.runtime,
      buildEnvironment: input.buildEnvironment,
      nextPackage: input.nextPackage,
      files: input.files,
    },
    inputDigest: input.inputDigest,
    storedAt,
  };
  return { ...unsigned, receiptDigest: sha256(canonicalJson(unsigned)) };
}

export function validateReceipt(receipt) {
  assertExactKeys(receipt, [
    "schemaVersion", "kind", "target", "input", "inputDigest", "storedAt", "receiptDigest",
  ], "compiler cache receipt");
  if (receipt.schemaVersion !== NEXT_COMPILER_CACHE_SCHEMA_VERSION || receipt.kind !== NEXT_COMPILER_CACHE_KIND) {
    throw new Error("compiler cache receipt schema is invalid");
  }
  const target = targetIdentity({ targetId: receipt.target?.id, appRoot: receipt.target?.appRoot });
  if (target.kind !== receipt.target.kind) throw new Error("compiler cache target kind does not match");
  assertExactKeys(receipt.input, ["target", "runtime", "buildEnvironment", "nextPackage", "files"], "compiler cache input");
  if (canonicalJson(receipt.input.target) !== canonicalJson(receipt.target)) {
    throw new Error("compiler cache receipt target does not match");
  }
  runtimeIdentity(receipt.input.runtime);
  buildEnvironmentIdentity(receipt.input.buildEnvironment, target);
  assertExactKeys(receipt.input.nextPackage, ["name", "version", "packageJsonDigest"], "Next package identity");
  if (receipt.input.nextPackage.name !== "next" || typeof receipt.input.nextPackage.version !== "string"
    || !SHA256.test(receipt.input.nextPackage.packageJsonDigest ?? "")) {
    throw new Error("Next package identity is invalid");
  }
  if (!Array.isArray(receipt.input.files) || receipt.input.files.length === 0) {
    throw new Error("compiler cache input files are missing");
  }
  for (const entry of receipt.input.files) {
    assertExactKeys(entry, ["key", "path", "digest"], "compiler cache input file");
    if (typeof entry.key !== "string" || typeof entry.path !== "string" || !SHA256.test(entry.digest ?? "")) {
      throw new Error("compiler cache input file is invalid");
    }
  }
  if (!SHA256.test(receipt.inputDigest ?? "") || sha256(canonicalJson(receipt.input)) !== receipt.inputDigest) {
    throw new Error("compiler cache input digest does not match");
  }
  if (typeof receipt.storedAt !== "string" || Number.isNaN(Date.parse(receipt.storedAt))) {
    throw new Error("compiler cache storedAt is invalid");
  }
  const { receiptDigest, ...unsigned } = receipt;
  if (!SHA256.test(receiptDigest ?? "") || sha256(canonicalJson(unsigned)) !== receiptDigest) {
    throw new Error("compiler cache receipt digest does not match");
  }
  return receipt;
}
