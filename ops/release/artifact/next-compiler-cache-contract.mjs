import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

export const NEXT_COMPILER_CACHE_SCHEMA_VERSION = 1;
export const NEXT_COMPILER_CACHE_KIND = "workspace-next-compiler-cache";
export const NEXT_COMPILER_CACHE_EVIDENCE_KIND = "workspace-next-compiler-cache-evidence";

const SHA256 = /^[0-9a-f]{64}$/;
const UNIT_ID = /^[a-z][a-z0-9-]*$/;

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

function assertUnitId(unitId) {
  if (!UNIT_ID.test(unitId ?? "")) throw new Error("unitId is invalid");
  return unitId;
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

function assertNormalizedAppRoot(appRoot) {
  if (typeof appRoot !== "string" || appRoot.length === 0
    || path.isAbsolute(appRoot) || path.win32.isAbsolute(appRoot)
    || appRoot.includes("\\") || path.posix.normalize(appRoot) !== appRoot
    || appRoot === "." || appRoot === ".." || appRoot.startsWith("../")) {
    throw new Error("appRoot must be a normalized repo-relative path");
  }
  return appRoot;
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

function validateInputPaths({ repositoryRoot, unitId, appRoot, outputRoot, contractFile, navigationManifestFile }) {
  const root = assertNormalizedAbsolutePath(repositoryRoot, "repositoryRoot");
  assertRealDirectory(root, "repositoryRoot");
  assertUnitId(unitId);
  const normalizedAppRoot = assertNormalizedAppRoot(appRoot);
  const resolvedOutputRoot = resolveOutputRoot(root, outputRoot);
  assertExactPath(contractFile, path.join(resolvedOutputRoot, "deploy-unit-contract.json"), "contractFile");
  assertExactPath(
    navigationManifestFile,
    path.join(resolvedOutputRoot, "deploy-navigation-manifest.json"),
    "navigationManifestFile",
  );
  assertRealDirectoryAncestors(root, contractFile, "contractFile");
  assertRealDirectoryAncestors(root, navigationManifestFile, "navigationManifestFile");
  assertRealFile(contractFile, "deploy unit contract");
  assertRealFile(navigationManifestFile, "deploy navigation manifest");
  return { root, appRoot: normalizedAppRoot, outputRoot: resolvedOutputRoot };
}

export function validateOperationPaths(options) {
  const inputPaths = validateInputPaths(options);
  const { root, appRoot, outputRoot } = inputPaths;
  assertExactPath(options.cacheRoot, path.join(root, ".cache", "next-units", options.unitId), "cacheRoot");
  assertExactPath(options.quarantineRoot, path.join(root, ".cache", "quarantine", "next-units"), "quarantineRoot");
  assertExactPath(options.evidenceFile, path.join(outputRoot, "next-compiler-cache.json"), "evidenceFile");
  assertExactPath(options.buildDirectory, path.join(root, appRoot, ".next"), "buildDirectory");
  for (const [label, target] of [
    ["cacheRoot", options.cacheRoot],
    ["quarantineRoot", options.quarantineRoot],
    ["evidenceFile", options.evidenceFile],
    ["buildDirectory", options.buildDirectory],
  ]) assertRealDirectoryAncestors(root, target, label);
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
  const candidates = ["next.config.ts", "next.config.mjs", "next.config.js"]
    .map((name) => path.join(repositoryRoot, appRoot, name)).filter(pathExists);
  if (candidates.length !== 1) throw new Error(`${appRoot} must have exactly one Next config`);
  return candidates[0];
}

function relevantTsconfigPaths(repositoryRoot, appRoot, contract) {
  return [...new Set([
    path.join(repositoryRoot, "tsconfig.base.json"),
    path.join(repositoryRoot, appRoot, "tsconfig.json"),
    ...(contract.compiler?.projects ?? []).map((project) => path.join(repositoryRoot, project)),
  ])].map((file) => path.resolve(file)).sort((left, right) => left.localeCompare(right));
}

export function computeCompilerCacheInput(options = {}) {
  const { unitId, contractFile, navigationManifestFile, runtime } = options;
  const { root, appRoot } = validateInputPaths(options);
  const contract = readJsonFile(contractFile, "deploy unit contract");
  if (contract.id !== unitId) throw new Error("deploy unit contract unit does not match");
  if (contract.build?.appRoot !== appRoot) throw new Error("deploy unit contract appRoot does not match");
  if (!Array.isArray(contract.compiler?.projects)) throw new Error("deploy unit compiler projects are missing");

  const nextPackageFile = path.join(root, "node_modules", "next", "package.json");
  const nextPackage = readJsonFile(nextPackageFile, "Next package");
  if (nextPackage.name !== "next" || typeof nextPackage.version !== "string" || nextPackage.version.length === 0) {
    throw new Error("Next package identity is invalid");
  }
  const files = [
    inputFile(root, "package-lock", path.join(root, "package-lock.json")),
    inputFile(root, "next-package", nextPackageFile),
    inputFile(root, "next-config", nextConfigPath(root, appRoot)),
    inputFile(root, "deploy-unit-spec", path.join(root, "scripts/deploy/deploy-unit-spec.ts")),
    inputFile(root, "deploy-unit-app-generator", path.join(root, "scripts/deploy/deploy-unit-app-generator.ts")),
    inputFile(root, "generated-contract", contractFile, "deploy unit contract", "generated/deploy-unit-contract.json"),
    inputFile(
      root,
      "generated-navigation",
      navigationManifestFile,
      "deploy navigation manifest",
      "generated/deploy-navigation-manifest.json",
    ),
    ...relevantTsconfigPaths(root, appRoot, contract).map((file) => {
      const relative = normalizeRepositoryPath(root, file, "tsconfig");
      return inputFile(root, `tsconfig:${relative}`, file, `tsconfig ${relative}`);
    }),
  ].sort((left, right) => left.key.localeCompare(right.key));
  const input = {
    unitId,
    runtime: runtimeIdentity(runtime),
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
    unitId: input.unitId,
    input: { unitId: input.unitId, runtime: input.runtime, nextPackage: input.nextPackage, files: input.files },
    inputDigest: input.inputDigest,
    storedAt,
  };
  return { ...unsigned, receiptDigest: sha256(canonicalJson(unsigned)) };
}

export function validateReceipt(receipt) {
  assertExactKeys(receipt, [
    "schemaVersion", "kind", "unitId", "input", "inputDigest", "storedAt", "receiptDigest",
  ], "compiler cache receipt");
  if (receipt.schemaVersion !== NEXT_COMPILER_CACHE_SCHEMA_VERSION || receipt.kind !== NEXT_COMPILER_CACHE_KIND) {
    throw new Error("compiler cache receipt schema is invalid");
  }
  assertUnitId(receipt.unitId);
  assertExactKeys(receipt.input, ["unitId", "runtime", "nextPackage", "files"], "compiler cache input");
  if (receipt.input.unitId !== receipt.unitId) throw new Error("compiler cache receipt unit does not match");
  runtimeIdentity(receipt.input.runtime);
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
