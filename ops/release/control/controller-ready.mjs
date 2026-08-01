#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { verifyDeployControlCompatibility } from "./deploy-control-compatibility.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const OPS_TEST_COMMAND = "node scripts/check/with-check-lock.js -- node scripts/testing/run-node-tests.mjs shard ops";
const OPS_TEST_ARGS = [
  "scripts/check/with-check-lock.js",
  "--",
  "node",
  "scripts/testing/run-node-tests.mjs",
  "shard",
  "ops",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function requirePattern(value, pattern, label) {
  if (!pattern.test(value ?? "")) throw new Error(`${label} is invalid`);
  return value;
}

function requireCompletedAt(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("controller-ready completedAt is invalid");
  }
  return value;
}

function requireChangedFiles(value) {
  if (!Array.isArray(value) || value.some((file) => typeof file !== "string" || file.length === 0)) {
    throw new Error("controller-ready changedFiles is invalid");
  }
  const normalized = [...new Set(value)].sort();
  if (JSON.stringify(value) !== JSON.stringify(normalized)) {
    throw new Error("controller-ready changedFiles must be unique and sorted");
  }
  return value;
}

function controllerTuple(controller) {
  return {
    sourceSha: requirePattern(controller?.sourceSha, SHA_PATTERN, "controller source SHA"),
    treeId: requirePattern(controller?.treeId, SHA_PATTERN, "controller tree id"),
    controlDigest: requirePattern(controller?.controlDigest, DIGEST_PATTERN, "controller control digest"),
    changedFiles: requireChangedFiles(controller?.changedFiles),
  };
}

function runtimeIdentity(runtime) {
  for (const key of ["nodeVersion", "platform", "arch", "executable"]) {
    if (typeof runtime?.[key] !== "string" || runtime[key].length === 0) {
      throw new Error(`controller-ready ops runtime ${key} is invalid`);
    }
  }
  return {
    nodeVersion: runtime.nodeVersion,
    platform: runtime.platform,
    arch: runtime.arch,
    executable: runtime.executable,
  };
}

function passedOpsTestEvidence(result) {
  if (!Number.isInteger(result?.exitCode)) throw new Error("controller-ready ops test exitCode is invalid");
  if (result.exitCode !== 0) {
    throw new Error(`controller-ready ops test shard failed with exit code ${result.exitCode}`);
  }
  return {
    command: OPS_TEST_COMMAND,
    status: "passed",
    exitCode: 0,
    runtime: runtimeIdentity(result.runtime),
    outputDigest: requirePattern(result.outputDigest, DIGEST_PATTERN, "controller-ready ops output digest"),
    completedAt: requireCompletedAt(result.completedAt),
  };
}

function validateOpsTestEvidence(evidence) {
  if (evidence?.command !== OPS_TEST_COMMAND || evidence?.status !== "passed" || evidence?.exitCode !== 0) {
    throw new Error("controller-ready ops test evidence is invalid");
  }
  return passedOpsTestEvidence(evidence);
}

function receiptBody({ readySource, controller, opsTestEvidence, completedAt }) {
  const evidence = validateOpsTestEvidence(opsTestEvidence);
  const receiptCompletedAt = requireCompletedAt(completedAt);
  if (evidence.completedAt !== receiptCompletedAt) {
    throw new Error("controller-ready receipt and ops evidence completion times differ");
  }
  return {
    schemaVersion: 1,
    kind: "workspace-controller-ready",
    status: "ready",
    command: "ops/publish.sh controller-ready",
    readySource: requirePattern(readySource, SHA_PATTERN, "Application Ready source SHA"),
    controller: controllerTuple(controller),
    opsTestEvidence: evidence,
    completedAt: receiptCompletedAt,
  };
}

function withReceiptDigest(body) {
  return { ...body, receiptDigest: sha256(JSON.stringify(body)) };
}

function sameController(left, right) {
  return left.sourceSha === right.sourceSha
    && left.treeId === right.treeId
    && left.controlDigest === right.controlDigest;
}

function sameChangedFiles(left, right) {
  return JSON.stringify(left.changedFiles) === JSON.stringify(right.changedFiles);
}

function atomicWrite(file, receipt) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tmp-${process.pid}`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function readReceipt(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error("controller-ready receipt is missing or invalid JSON");
  }
}

export function controllerReadyReceiptFile(repository) {
  return path.join(path.resolve(repository), ".cache", "release-control", "controller-ready.json");
}

function runOpsTestShard({ repository }) {
  const outputHash = createHash("sha256");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, OPS_TEST_ARGS, {
      cwd: path.resolve(repository),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      outputHash.update(Buffer.from("stdout\0"));
      outputHash.update(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      outputHash.update(Buffer.from("stderr\0"));
      outputHash.update(chunk);
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({
      exitCode: Number.isInteger(code) ? code : 1,
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        executable: process.execPath,
      },
      outputDigest: outputHash.digest("hex"),
      completedAt: new Date().toISOString(),
    }));
  });
}

export async function qualifyControllerReady({
  repository,
  readySource,
  output = controllerReadyReceiptFile(repository),
}) {
  const cacheRoot = path.dirname(controllerReadyReceiptFile(repository));
  const target = path.resolve(output);
  if (path.dirname(target) !== cacheRoot) {
    throw new Error("controller-ready receipt must be written in the current controller worktree cache");
  }
  const beforeTests = controllerTuple(verifyDeployControlCompatibility({ repository, readySource }));
  const opsTestEvidence = passedOpsTestEvidence(await runOpsTestShard({ repository: path.resolve(repository) }));
  const afterTests = controllerTuple(verifyDeployControlCompatibility({ repository, readySource }));
  if (!sameController(beforeTests, afterTests) || !sameChangedFiles(beforeTests, afterTests)) {
    throw new Error("deploy controller changed while the ops test shard was running");
  }
  const receipt = withReceiptDigest(receiptBody({
    readySource,
    controller: afterTests,
    opsTestEvidence,
    completedAt: opsTestEvidence.completedAt,
  }));
  atomicWrite(target, receipt);
  return receipt;
}

export function verifyControllerReadyReceipt({
  receipt,
  repository,
  readySource,
  controllerSource = "HEAD",
}) {
  requirePattern(readySource, SHA_PATTERN, "Application Ready source SHA");
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("release metadata must contain a Controller Ready receipt");
  }
  if (receipt?.readySource !== readySource) {
    throw new Error("controller-ready receipt is stale for the current Application Ready source");
  }
  const current = controllerTuple(verifyDeployControlCompatibility({ repository, readySource, controllerSource }));
  if (!sameController(receipt?.controller ?? {}, current)) {
    throw new Error("controller-ready receipt is stale for the current deploy controller");
  }
  if (!sameChangedFiles(receipt.controller, current)) {
    throw new Error("controller-ready receipt changed-file drift detected");
  }
  const expected = withReceiptDigest(receiptBody({
    readySource,
    controller: current,
    opsTestEvidence: receipt.opsTestEvidence,
    completedAt: receipt.completedAt,
  }));
  if (JSON.stringify(receipt) !== JSON.stringify(expected)) {
    throw new Error("controller-ready receipt contract or ops test evidence is invalid");
  }
  return receipt;
}

export function verifyControllerReady({
  repository,
  readySource,
  file = controllerReadyReceiptFile(repository),
}) {
  return verifyControllerReadyReceipt({ receipt: readReceipt(file), repository, readySource });
}

function parse(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument: ${key ?? ""}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function rejectUnknownOptions(options) {
  const allowed = new Set(["command", "repository", "ready_source", "file"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`unknown controller-ready option: --${unknown[0].replaceAll("_", "-")}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  rejectUnknownOptions(options);
  if (options.command === "qualify") {
    const receipt = await qualifyControllerReady({
      repository: options.repository,
      readySource: options.ready_source,
      output: options.file,
    });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return receipt;
  }
  if (options.command === "verify") {
    const receipt = verifyControllerReady({
      repository: options.repository,
      readySource: options.ready_source,
      file: options.file,
    });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return receipt;
  }
  throw new Error("usage: controller-ready.mjs qualify|verify --repository ROOT --ready-source SHA --file FILE");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
