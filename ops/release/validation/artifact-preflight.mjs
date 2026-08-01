#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { assertBuildSpace } from "../../cache/cache-prune.mjs";
import { captureCandidateIdentity } from "../candidate/identity.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const RUN_PATTERN = /^ci-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}-[0-9a-f]{8}$/;
const TARGET_PATTERN = /^(monolith|[a-z][a-z0-9-]*)$/;
export const ARTIFACT_PREFLIGHT_CHECKS = [
  "clean-candidate-identity",
  "exact-generated-app",
  "real-next-config-loader",
  "next-config-target-roots",
  "dependency-lock-boundary",
  "node-next-npm-toolchain",
  "build-space-watermark",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));

function required(value, pattern, label) {
  if (!pattern.test(value ?? "")) throw new Error(`${label} is invalid`);
  return value;
}

function selectedTarget(targetId, targetMode) {
  const id = required(targetId, TARGET_PATTERN, "artifact preflight target");
  const mode = id === "monolith" ? "activate" : targetMode;
  if (!new Set(["activate", "shadow"]).has(mode)) throw new Error("artifact preflight target mode is invalid");
  if (id === "monolith" && targetMode && targetMode !== "activate") {
    throw new Error("monolith artifact preflight mode must be activate");
  }
  return { kind: id === "monolith" ? "monolith" : "unit", id, mode };
}

function expectedIdentity(options) {
  return {
    runId: required(options.runId, RUN_PATTERN, "artifact preflight CI run id"),
    source: {
      commitSha: required(options.sourceSha, SHA_PATTERN, "artifact preflight source SHA"),
      treeId: required(options.treeId, SHA_PATTERN, "artifact preflight tree id"),
      contentDigest: required(options.contentDigest, DIGEST_PATTERN, "artifact preflight content digest"),
    },
    configurationDigest: required(
      options.configurationDigest,
      DIGEST_PATTERN,
      "artifact preflight configuration digest",
    ),
    target: selectedTarget(options.targetId, options.targetMode),
  };
}

function assertRealDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || fs.realpathSync(directory) !== path.resolve(directory)) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function assertRealFile(file, label) {
  if (!fs.lstatSync(file).isFile()) throw new Error(`${label} must be a real file: ${file}`);
}

export function inspectDependencyBoundary(repository) {
  const repositoryRoot = fs.realpathSync(path.resolve(repository));
  const packageLock = path.join(repositoryRoot, "package-lock.json");
  const nodeModules = path.join(repositoryRoot, "node_modules");
  assertRealFile(packageLock, "release package-lock.json");
  const lockDigest = sha256File(packageLock);
  const stat = fs.lstatSync(nodeModules);
  if (!stat.isSymbolicLink()) {
    assertRealDirectory(nodeModules, "release node_modules");
    return { kind: "repository-local", packageLockSha256: lockDigest };
  }

  const trustedSource = path.join(path.dirname(repositoryRoot), "source");
  const trustedNodeModules = path.join(trustedSource, "node_modules");
  const configuredTarget = path.resolve(path.dirname(nodeModules), fs.readlinkSync(nodeModules));
  if (configuredTarget !== trustedNodeModules) {
    throw new Error(`release node_modules symlink must target trusted sibling ${trustedNodeModules}`);
  }
  assertRealDirectory(trustedSource, "trusted sibling source");
  assertRealDirectory(trustedNodeModules, "trusted sibling node_modules");
  if (fs.realpathSync(nodeModules) !== trustedNodeModules) {
    throw new Error("release node_modules symlink resolved outside trusted sibling");
  }
  const trustedLock = path.join(trustedSource, "package-lock.json");
  assertRealFile(trustedLock, "trusted sibling package-lock.json");
  if (sha256File(trustedLock) !== lockDigest) {
    throw new Error("package-lock.json drift between release and trusted sibling source");
  }
  return { kind: "trusted-sibling-symlink", packageLockSha256: lockDigest };
}

function executableOnPath(name, env = process.env) {
  for (const directory of (env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch { /* continue */ }
  }
  throw new Error(`${name} executable is missing from PATH`);
}

function successfulVersion(command, args, cwd, label, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (result.error || result.signal || result.status !== 0) throw new Error(`${label} failed`);
  return result.stdout.trim();
}

export function inspectToolchain(repository, env = process.env) {
  const repositoryRoot = fs.realpathSync(path.resolve(repository));
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package-lock.json"), "utf8"));
  const installedNext = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "node_modules/next/package.json"), "utf8"));
  const declaredNode = packageJson.engines?.node;
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const nodeMatch = /^(\d+)\.x$/.exec(declaredNode ?? "");
  const nodeVersionFile = fs.readFileSync(path.join(repositoryRoot, ".node-version"), "utf8").trim();
  if (!nodeMatch || !/^\d+$/.test(nodeVersionFile)
    || Number(nodeMatch[1]) !== nodeMajor || Number(nodeVersionFile) !== nodeMajor) {
    throw new Error(`Node ${process.version} does not satisfy repository engine ${declaredNode ?? "<missing>"}`);
  }
  const declaredNext = packageJson.dependencies?.next ?? packageJson.devDependencies?.next;
  const rootLockNext = packageLock.packages?.[""]?.dependencies?.next
    ?? packageLock.packages?.[""]?.devDependencies?.next;
  const installedLockNext = packageLock.packages?.["node_modules/next"]?.version;
  if (new Set([declaredNext, rootLockNext, installedLockNext, installedNext.version]).size !== 1) {
    throw new Error("package.json, package-lock.json, and installed Next versions differ");
  }
  const nextBin = path.join(repositoryRoot, "node_modules/.bin/next");
  const expectedNextBin = fs.realpathSync(path.join(repositoryRoot, "node_modules/next/dist/bin/next"));
  fs.accessSync(nextBin, fs.constants.X_OK);
  if (fs.realpathSync(nextBin) !== expectedNextBin) throw new Error("Next binary does not belong to installed package");
  const nextOutput = successfulVersion(process.execPath, [nextBin, "--version"], repositoryRoot, "Next CLI", env);
  if (!nextOutput.includes(installedNext.version)) throw new Error("Next CLI version differs from installed package");
  const npmPath = executableOnPath("npm", env);
  const npmVersion = successfulVersion(npmPath, ["--version"], repositoryRoot, "npm CLI", env);
  return {
    node: process.version,
    nodeExecutable: fs.realpathSync(process.execPath),
    nodeEngine: declaredNode,
    nodeVersionFile,
    next: installedNext.version,
    packageLockNext: rootLockNext,
    nextBinary: expectedNextBin,
    npm: npmVersion,
    npmCli: npmPath,
  };
}

export function verifyCandidate(repository, identity) {
  const repositoryRoot = fs.realpathSync(path.resolve(repository));
  const status = execFileSync("git", ["status", "--short"], { cwd: repositoryRoot, encoding: "utf8" });
  if (status.trim()) throw new Error("artifact preflight requires a clean frozen candidate");
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const captured = captureCandidateIdentity({ repositoryRoot, revision: "HEAD" });
  if (commitSha !== identity.source.commitSha || captured.treeId !== identity.source.treeId
    || captured.contentDigest !== identity.source.contentDigest) {
    throw new Error("artifact preflight repository differs from frozen candidate");
  }
  return { clean: true };
}

export function runExactConfigProbe(repository, targetId, env = process.env) {
  const runner = path.join(path.resolve(repository), "ops/release/validation/artifact-preflight-unit.mjs");
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "tsx", runner,
    "--repository", path.resolve(repository), "--target", targetId,
  ], { cwd: path.resolve(repository), env, encoding: "utf8" });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`exact Next config preflight failed: ${result.stderr.trim() || result.error?.message || result.signal}`);
  }
  try { return JSON.parse(result.stdout.trim()); }
  catch { throw new Error("exact Next config preflight returned invalid JSON"); }
}

function receiptIdentity(receipt) {
  return {
    runId: receipt?.runId,
    source: receipt?.source,
    configurationDigest: receipt?.configurationDigest,
    target: receipt?.target,
  };
}

function identityDigest(identity) {
  return sha256(JSON.stringify(identity));
}

export function validateArtifactPreflightReceipt(receipt, options) {
  const expected = expectedIdentity(options);
  const expectedAppRoot = expected.target.id === "monolith" ? "." : `apps/${expected.target.id}`;
  const expectedConfig = expected.target.id === "monolith"
    ? "next.config.ts"
    : `apps/${expected.target.id}/next.config.ts`;
  const expectedRootRelation = expected.target.id === "monolith"
    || receipt?.dependencyBoundary?.kind === "trusted-sibling-symlink"
    ? "repository-parent"
    : "repository";
  const nodeMajor = /^v(\d+)\./.exec(receipt?.toolchain?.node ?? "")?.[1];
  if (!receipt || receipt.schemaVersion !== 1 || receipt.kind !== "workspace-artifact-preflight"
    || receipt.status !== "passed" || receipt.command !== "ops/publish.sh ci"
    || JSON.stringify(receiptIdentity(receipt)) !== JSON.stringify(expected)
    || receipt.identityDigest !== identityDigest(expected)
    || JSON.stringify(receipt.checks) !== JSON.stringify(ARTIFACT_PREFLIGHT_CHECKS)
    || !new Set(["repository-local", "trusted-sibling-symlink"]).has(receipt.dependencyBoundary?.kind)
    || !DIGEST_PATTERN.test(receipt.dependencyBoundary?.packageLockSha256 ?? "")
    || !nodeMajor || receipt.toolchain?.nodeEngine !== `${nodeMajor}.x`
    || receipt.toolchain?.nodeVersionFile !== nodeMajor || !path.isAbsolute(receipt.toolchain?.nodeExecutable ?? "")
    || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(receipt.toolchain?.next ?? "")
    || receipt.toolchain?.packageLockNext !== receipt.toolchain?.next
    || !path.isAbsolute(receipt.toolchain?.nextBinary ?? "")
    || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(receipt.toolchain?.npm ?? "")
    || !path.isAbsolute(receipt.toolchain?.npmCli ?? "")
    || receipt.nextConfig?.targetIdentity !== expected.target.id
    || receipt.nextConfig?.output !== "standalone"
    || receipt.nextConfig?.appRoot !== expectedAppRoot || receipt.nextConfig?.nextConfig !== expectedConfig
    || !path.isAbsolute(receipt.nextConfig?.outputFileTracingRoot ?? "")
    || receipt.nextConfig?.outputFileTracingRootRelation !== expectedRootRelation
    || !path.isAbsolute(receipt.nextConfig?.turbopackRoot ?? "")
    || receipt.nextConfig?.turbopackRootRelation !== expectedRootRelation
    || receipt.nextConfig?.outputFileTracingRoot !== receipt.nextConfig?.turbopackRoot
    || receipt.nextConfig?.generatedAppCheck !== (expected.target.id === "monolith" ? "not-applicable" : "exact-unit-passed")
    || !Number.isFinite(receipt.disk?.usagePercent) || receipt.disk.usagePercent < 0 || receipt.disk.usagePercent > 100
    || !Number.isFinite(receipt.disk?.retainedBytes) || receipt.disk.retainedBytes < 0
    || !Number.isInteger(receipt.disk?.evictedEntries) || receipt.disk.evictedEntries < 0
    || !Number.isInteger(receipt.disk?.inaccessibleEntries) || receipt.disk.inaccessibleEntries < 0
    || !Number.isFinite(Date.parse(receipt.completedAt ?? ""))
    || !Number.isFinite(receipt.durationMs) || receipt.durationMs < 0) {
    throw new Error("artifact preflight receipt does not match exact candidate, target, and run");
  }
  return receipt;
}

export function writeImmutableArtifactPreflightReceipt(file, receipt) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, serialized, { flag: "wx", mode: 0o600 });
    try { fs.linkSync(temporary, target); }
    catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (fs.readFileSync(target, "utf8") !== serialized) {
        throw new Error("artifact preflight receipt path already contains different immutable evidence");
      }
    }
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function runArtifactPreflight(options = {}) {
  const repository = fs.realpathSync(path.resolve(options.repository ?? process.cwd()));
  const identity = expectedIdentity(options);
  if (!options.output) throw new Error("artifact preflight output is required");
  const output = path.resolve(options.output);
  if (fs.existsSync(output)) {
    const existing = JSON.parse(fs.readFileSync(output, "utf8"));
    if (existing.status === "passed") return validateArtifactPreflightReceipt(existing, options);
    if (JSON.stringify(receiptIdentity(existing)) !== JSON.stringify(identity)) {
      throw new Error("artifact preflight receipt path belongs to another candidate or run");
    }
    throw new Error("artifact preflight already failed for this CI run");
  }
  const now = options.now ?? (() => Date.now());
  const startedAtMs = now();
  let receipt;
  try {
    (options.verifyCandidateFn ?? verifyCandidate)(repository, identity);
    const dependencies = (options.inspectDependencyFn ?? inspectDependencyBoundary)(repository);
    const toolchain = (options.inspectToolchainFn ?? inspectToolchain)(repository, options.env);
    const nextConfig = (options.configProbeFn ?? runExactConfigProbe)(repository, identity.target.id, options.env);
    const disk = (options.assertBuildSpaceFn ?? assertBuildSpace)({
      repositoryRoot: repository,
      contentDigest: identity.source.contentDigest,
      targetId: identity.target.id,
      env: options.env,
    });
    const completedAtMs = now();
    receipt = {
      schemaVersion: 1,
      kind: "workspace-artifact-preflight",
      status: "passed",
      command: "ops/publish.sh ci",
      ...identity,
      identityDigest: identityDigest(identity),
      checks: ARTIFACT_PREFLIGHT_CHECKS,
      dependencyBoundary: dependencies,
      toolchain,
      nextConfig,
      disk: {
        usagePercent: disk.diskUsagePercent,
        retainedBytes: disk.totalBytes,
        evictedEntries: disk.removed.length,
        inaccessibleEntries: disk.issues.length,
      },
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: Math.max(0, completedAtMs - startedAtMs),
    };
  } catch (error) {
    const completedAtMs = now();
    receipt = {
      schemaVersion: 1,
      kind: "workspace-artifact-preflight",
      status: "failed",
      command: "ops/publish.sh ci",
      ...identity,
      identityDigest: identityDigest(identity),
      checks: ARTIFACT_PREFLIGHT_CHECKS,
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: Math.max(0, completedAtMs - startedAtMs),
    };
    writeImmutableArtifactPreflightReceipt(output, receipt);
    throw error;
  }
  writeImmutableArtifactPreflightReceipt(output, receipt);
  return validateArtifactPreflightReceipt(receipt, options);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const raw = { command, repository: process.cwd(), target_mode: "activate" };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = rest[++index];
    if (!value || value.startsWith("--")) throw new Error(`${key} is missing a value`);
    raw[key.slice(2).replaceAll("-", "_")] = value;
  }
  return {
    command,
    repository: raw.repository,
    output: raw.output,
    file: raw.file,
    runId: raw.run_id,
    sourceSha: raw.source,
    treeId: raw.tree,
    contentDigest: raw.content,
    configurationDigest: raw.configuration,
    targetId: raw.target,
    targetMode: raw.target_mode,
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  let receipt;
  if (options.command === "create") receipt = runArtifactPreflight(options);
  else if (options.command === "verify") {
    if (!options.file) throw new Error("artifact preflight verify requires --file");
    receipt = validateArtifactPreflightReceipt(JSON.parse(fs.readFileSync(options.file, "utf8")), options);
  } else {
    throw new Error("usage: artifact-preflight.mjs create --repository ROOT --output FILE ... | verify --file FILE ...");
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
