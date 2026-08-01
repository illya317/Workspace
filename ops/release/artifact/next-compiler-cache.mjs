#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  NEXT_COMPILER_CACHE_EVIDENCE_KIND,
  NEXT_COMPILER_CACHE_SCHEMA_VERSION,
  assertRealDirectory,
  canonicalJson,
  computeCompilerCacheInput,
  createReceipt,
  pathExists,
  resolveOutputRoot,
  validateOperationPaths,
  validateReceipt,
} from "./next-compiler-cache-contract.mjs";

export {
  NEXT_COMPILER_CACHE_EVIDENCE_KIND,
  NEXT_COMPILER_CACHE_KIND,
  NEXT_COMPILER_CACHE_SCHEMA_VERSION,
  canonicalJson,
  computeCompilerCacheInput,
  resolveOutputRoot,
  sha256,
} from "./next-compiler-cache-contract.mjs";

function findUnsafeTreeEntry(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const stat = lstatSync(entryPath);
    if (stat.isSymbolicLink()) return entryPath;
    if (stat.isDirectory()) {
      const nested = findUnsafeTreeEntry(entryPath);
      if (nested) return nested;
    } else if (!stat.isFile()) return entryPath;
  }
  return null;
}

function driftReason(stored, expected) {
  if (canonicalJson(stored.runtime) !== canonicalJson(expected.runtime)) return "runtime-drift";
  if (canonicalJson(stored.nextPackage) !== canonicalJson(expected.nextPackage)) return "next-package-drift";
  const storedFiles = new Map(stored.files.map((entry) => [entry.key, entry]));
  const expectedFiles = new Map(expected.files.map((entry) => [entry.key, entry]));
  if (storedFiles.size !== expectedFiles.size) return "input-file-set-drift";
  for (const [key, entry] of expectedFiles) {
    const previous = storedFiles.get(key);
    if (previous?.path === entry.path && previous.digest === entry.digest) continue;
    if (key === "package-lock") return "package-lock-drift";
    if (key === "next-package") return "next-package-drift";
    if (key === "next-config") return "next-config-drift";
    if (key.startsWith("tsconfig:")) return "tsconfig-drift";
    if (key === "deploy-unit-spec" || key === "deploy-unit-app-generator") return "deploy-generator-drift";
    if (key === "generated-contract") return "generated-contract-drift";
    if (key === "generated-navigation") return "generated-navigation-drift";
    return "input-file-drift";
  }
  return "input-digest-drift";
}

export function inspectCompilerCache({ cacheRoot, input } = {}) {
  if (!pathExists(cacheRoot)) return { status: "miss", reason: "absent" };
  const rootStat = lstatSync(cacheRoot);
  if (rootStat.isSymbolicLink()) return { status: "miss", reason: "cache-root-symlink" };
  if (!rootStat.isDirectory()) return { status: "miss", reason: "cache-root-not-directory" };

  const receiptFile = path.join(cacheRoot, "receipt.json");
  if (!pathExists(receiptFile)) return { status: "miss", reason: "receipt-missing" };
  const receiptStat = lstatSync(receiptFile);
  if (receiptStat.isSymbolicLink()) return { status: "miss", reason: "receipt-symlink" };
  if (!receiptStat.isFile()) return { status: "miss", reason: "receipt-not-file" };

  const payload = path.join(cacheRoot, "cache");
  if (!pathExists(payload)) return { status: "miss", reason: "payload-missing" };
  const payloadStat = lstatSync(payload);
  if (payloadStat.isSymbolicLink()) return { status: "miss", reason: "payload-symlink" };
  if (!payloadStat.isDirectory()) return { status: "miss", reason: "payload-not-directory" };
  if (findUnsafeTreeEntry(payload)) return { status: "miss", reason: "payload-unsafe-entry" };

  let receipt;
  try {
    receipt = validateReceipt(JSON.parse(readFileSync(receiptFile, "utf8")));
  } catch {
    return { status: "miss", reason: "receipt-invalid" };
  }
  if (receipt.unitId !== input.unitId) return { status: "miss", reason: "unit-drift" };
  const expectedInput = {
    unitId: input.unitId,
    runtime: input.runtime,
    nextPackage: input.nextPackage,
    files: input.files,
  };
  if (receipt.inputDigest !== input.inputDigest || canonicalJson(receipt.input) !== canonicalJson(expectedInput)) {
    return { status: "miss", reason: driftReason(receipt.input, input) };
  }
  return { status: "hit", reason: "receipt-matched", receipt };
}

function quarantineCache(cacheRoot, quarantineRoot, unitId) {
  if (!pathExists(cacheRoot)) return null;
  mkdirSync(quarantineRoot, { recursive: true, mode: 0o700 });
  const destination = path.join(quarantineRoot, `${unitId}-${Date.now()}-${process.pid}-${randomUUID()}`);
  renameSync(cacheRoot, destination);
  return destination;
}

function evidenceEntry(inputDigest, inspection, quarantinePath = null, extra = {}) {
  return {
    status: inspection.status,
    reason: inspection.reason,
    inputDigest,
    quarantined: quarantinePath !== null,
    quarantinePath,
    ...extra,
  };
}

function writeEvidence(evidenceFile, unitId, inputDigest, phase, entry) {
  let previous = null;
  if (pathExists(evidenceFile)) {
    try {
      const value = JSON.parse(readFileSync(evidenceFile, "utf8"));
      if (value.kind === NEXT_COMPILER_CACHE_EVIDENCE_KIND && value.unitId === unitId
        && value.inputDigest === inputDigest) previous = value;
    } catch {
      previous = null;
    }
  }
  const evidence = {
    schemaVersion: NEXT_COMPILER_CACHE_SCHEMA_VERSION,
    kind: NEXT_COMPILER_CACHE_EVIDENCE_KIND,
    unitId,
    inputDigest,
    ...(previous?.prepare ? { prepare: previous.prepare } : {}),
    ...(previous?.store ? { store: previous.store } : {}),
    [phase]: entry,
  };
  mkdirSync(path.dirname(evidenceFile), { recursive: true });
  const temporary = `${evidenceFile}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, evidenceFile);
}

function cacheInput(options) {
  validateOperationPaths(options);
  return computeCompilerCacheInput(options);
}

function inspectAndQuarantine(options, input) {
  const inspection = inspectCompilerCache({ cacheRoot: options.cacheRoot, input });
  const quarantinePath = inspection.status === "miss" && inspection.reason !== "absent"
    ? quarantineCache(options.cacheRoot, options.quarantineRoot, input.unitId)
    : null;
  return { inspection, quarantinePath };
}

export function prepareCompilerCache(options = {}) {
  const input = cacheInput(options);
  const { inspection, quarantinePath } = inspectAndQuarantine(options, input);
  if (inspection.status === "hit") {
    mkdirSync(options.buildDirectory, { recursive: true });
    cpSync(path.join(options.cacheRoot, "cache"), path.join(options.buildDirectory, "cache"), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
  }
  const entry = evidenceEntry(input.inputDigest, inspection, quarantinePath);
  writeEvidence(options.evidenceFile, input.unitId, input.inputDigest, "prepare", entry);
  return entry;
}

function replaceStoredCache(options, input, buildCache) {
  const cacheParent = path.dirname(options.cacheRoot);
  mkdirSync(cacheParent, { recursive: true });
  const staging = mkdtempSync(path.join(cacheParent, `.${input.unitId}.store-`));
  const previous = `${options.cacheRoot}.previous-${process.pid}-${randomUUID()}`;
  let movedPrevious = false;
  try {
    cpSync(buildCache, path.join(staging, "cache"), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
    writeFileSync(path.join(staging, "receipt.json"), `${JSON.stringify(createReceipt(input), null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    if (pathExists(options.cacheRoot)) {
      renameSync(options.cacheRoot, previous);
      movedPrevious = true;
    }
    renameSync(staging, options.cacheRoot);
    if (movedPrevious) rmSync(previous, { recursive: true, force: true });
  } catch (error) {
    if (!pathExists(options.cacheRoot) && movedPrevious && pathExists(previous)) {
      renameSync(previous, options.cacheRoot);
      movedPrevious = false;
    }
    throw error;
  } finally {
    if (pathExists(staging)) rmSync(staging, { recursive: true, force: true });
    if (movedPrevious && pathExists(previous)) rmSync(previous, { recursive: true, force: true });
  }
}

export function storeCompilerCache(options = {}) {
  const input = cacheInput(options);
  const { inspection, quarantinePath } = inspectAndQuarantine(options, input);
  const buildCache = path.join(options.buildDirectory, "cache");
  if (!pathExists(buildCache)) {
    const miss = { status: "miss", reason: "build-cache-absent" };
    const entry = evidenceEntry(input.inputDigest, miss, quarantinePath, { stored: false });
    writeEvidence(options.evidenceFile, input.unitId, input.inputDigest, "store", entry);
    return entry;
  }
  assertRealDirectory(buildCache, "Next build compiler cache");
  if (findUnsafeTreeEntry(buildCache)) throw new Error("Next build compiler cache contains a symlink or non-file entry");
  replaceStoredCache(options, input, buildCache);
  const entry = evidenceEntry(input.inputDigest, inspection, quarantinePath, { stored: true });
  writeEvidence(options.evidenceFile, input.unitId, input.inputDigest, "store", entry);
  return entry;
}

function requiredOption(argv, flag) {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${flag} is required`);
  return value;
}

function cliPath(argv, flag) {
  const value = requiredOption(argv, flag);
  if (path.normalize(value) !== value) throw new Error(`${flag} must be normalized`);
  return path.resolve(value);
}

function cliOptions(argv) {
  const repositoryRoot = cliPath(argv, "--repository-root");
  return {
    repositoryRoot,
    unitId: requiredOption(argv, "--unit"),
    appRoot: requiredOption(argv, "--app-root"),
    outputRoot: resolveOutputRoot(repositoryRoot, requiredOption(argv, "--output-root")),
    contractFile: cliPath(argv, "--contract"),
    navigationManifestFile: cliPath(argv, "--navigation"),
    cacheRoot: cliPath(argv, "--cache-root"),
    quarantineRoot: cliPath(argv, "--quarantine-root"),
    buildDirectory: cliPath(argv, "--build-directory"),
    evidenceFile: cliPath(argv, "--evidence"),
  };
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === "resolve-output-root") {
    const repositoryRoot = cliPath(rest, "--repository-root");
    const outputRoot = resolveOutputRoot(repositoryRoot, requiredOption(rest, "--output-root"));
    process.stdout.write(`${outputRoot}\n`);
    return outputRoot;
  }
  const options = cliOptions(rest);
  const result = command === "prepare"
    ? prepareCompilerCache(options)
    : command === "store"
      ? storeCompilerCache(options)
      : (() => { throw new Error("command must be prepare or store"); })();
  process.stdout.write(`next compiler cache ${command}: ${result.status} (${result.reason}) ${result.inputDigest}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
