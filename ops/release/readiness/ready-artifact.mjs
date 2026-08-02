#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  readReceipt,
  validateArtifactReceipt,
  validateSourceValidationReceipt,
} from "../contracts/release-receipt.mjs";
import { assertDeployUnitArtifact } from "../../deploy-unit-release.mjs";
import { verifyArtifactManifest } from "../../../scripts/ci/verify-artifact-manifest.mjs";
import { validateFrozenTaskGraph } from "../validation/full-source-validation.mjs";
import { validateCandidateSourceSnapshot } from "../candidate/source-snapshot.mjs";
import { validateArtifactRehearsal } from "./rehearse-artifact.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const TARGET_PATTERN = /^(monolith|[a-z][a-z0-9-]*)$/;
const RUN_PATTERN = /^ci-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}-[0-9a-f]{8}$/;
const CHECKS = [
  "artifact-preflight-identity",
  "candidate-source-snapshot",
  "aggregate-source-proof",
  "artifact-content-identity",
  "archive-path-safety",
  "runtime-entry-syntax",
  "production-base-path",
  "deployment-runtime-files",
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digestFile = (file) => sha256(fs.readFileSync(file));

function requiredPattern(value, pattern, label) {
  if (!pattern.test(value ?? "")) throw new Error(`${label} is invalid`);
  return value;
}

export function validateSourceProof({ proofRoot, sourceResultFile, taskGraphFile, runId, contentDigest, target }) {
  const sourceResult = readReceipt(sourceResultFile);
  if (sourceResult.schemaVersion !== 3
    || sourceResult.kind !== "workspace-release-source-validation-result"
    || sourceResult.status !== "passed"
    || sourceResult.exitCode !== 0
    || sourceResult.sourceRunId !== runId
    || sourceResult.contentDigest !== contentDigest) {
    throw new Error("Ready Artifact requires the passed aggregate source result from this exact CI run");
  }
  if (sourceResult.validationTarget?.id !== target
    || sourceResult.validationTarget?.kind !== (target === "monolith" ? "monolith" : "unit")) {
    throw new Error("Ready Artifact source result belongs to another validation target");
  }
  const taskGraph = validateFrozenTaskGraph({
    cwd: proofRoot,
    taskGraphFile,
    runId,
    statusCode: 0,
  });
  const counts = Object.fromEntries(["reused", "pending", "blocked"].map((status) => [
    status,
    taskGraph.tasks.filter((task) => task.status === status).length,
  ]));
  if (sourceResult.taskGraphDigest !== taskGraph.graphDigest
    || JSON.stringify(sourceResult.taskCounts) !== JSON.stringify(counts)) {
    throw new Error("aggregate source result differs from its frozen task graph");
  }
  const taskReceipts = taskGraph.tasks
    .filter((task) => ["reused", "pending"].includes(task.status))
    .map((task) => {
      const file = path.join(proofRoot, ".cache", "check-results", task.taskKey, `${task.inputDigest}.json`);
      const receipt = readReceipt(file);
      return `${task.taskKey}:${receipt.receiptDigest}`;
    })
    .sort();
  return {
    sourceResultSha256: digestFile(sourceResultFile),
    taskGraphSha256: digestFile(taskGraphFile),
    taskReceiptsSha256: sha256(taskReceipts.join("\n")),
  };
}

export function validateArtifactPreflightProof({
  repository,
  file,
  runId,
  source,
  configurationDigest,
  target,
  targetMode,
}) {
  const resolved = path.resolve(file);
  execFileSync(process.execPath, [
    path.join(repository, "ops/release/validation/artifact-preflight.mjs"),
    "verify",
    "--file", resolved,
    "--repository", repository,
    "--run-id", runId,
    "--source", source.commitSha,
    "--tree", source.treeId,
    "--content", source.contentDigest,
    "--configuration", configurationDigest,
    "--target", target,
    "--target-mode", targetMode,
  ], { cwd: repository, stdio: ["ignore", "ignore", "pipe"] });
  const receipt = readReceipt(resolved);
  return {
    artifactPreflightReceiptSha256: digestFile(resolved),
    artifactPreflightIdentityDigest: requiredPattern(
      receipt.identityDigest,
      DIGEST_PATTERN,
      "artifact preflight identity digest",
    ),
  };
}

function prove(options) {
  const source = {
    commitSha: requiredPattern(options.commitSha, SHA_PATTERN, "commit SHA"),
    treeId: requiredPattern(options.treeId, SHA_PATTERN, "tree id"),
    contentDigest: requiredPattern(options.contentDigest, DIGEST_PATTERN, "content digest"),
  };
  const configurationDigest = requiredPattern(options.configurationDigest, DIGEST_PATTERN, "configuration digest");
  const target = requiredPattern(options.target, TARGET_PATTERN, "target");
  const targetMode = target === "monolith" ? "activate" : options.targetMode;
  if (!new Set(["activate", "shadow"]).has(targetMode)) throw new Error("target mode is invalid");
  const runId = requiredPattern(options.runId, RUN_PATTERN, "CI run id");
  const repository = path.resolve(options.repository);
  const proofRoot = path.resolve(options.proofRoot ?? options.repository);
  const artifact = path.resolve(options.artifact);
  const manifestFile = path.resolve(options.manifest);
  const artifactReceiptFile = path.resolve(options.artifactReceipt);
  const identity = {
    treeId: source.treeId,
    contentDigest: source.contentDigest,
    targetId: target,
    runId,
  };
  const artifactReceipt = validateArtifactReceipt(readReceipt(artifactReceiptFile), identity);
  let manifest;
  if (target === "monolith") {
    verifyArtifactManifest({
      repositoryRoot: repository,
      artifactPath: artifact,
      manifestPath: manifestFile,
      expectedTreeId: source.treeId,
      expectedContentDigest: source.contentDigest,
    });
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    if (manifest.source?.commitSha !== source.commitSha) throw new Error("artifact belongs to another source commit");
  } else {
    if (!options.contract) throw new Error("deploy-unit readiness requires --contract");
    manifest = assertDeployUnitArtifact({
      manifestFile,
      artifactFile: artifact,
      contractFile: path.resolve(options.contract),
    });
    if (manifest.source?.commitSha !== source.commitSha || manifest.source?.treeSha !== source.treeId
      || manifest.unit?.id !== target) throw new Error("deploy-unit artifact belongs to another source or target");
  }
  validateSourceValidationReceipt(readReceipt(options.sourceReceipt), identity);
  const sourceProof = validateSourceProof({
    proofRoot,
    sourceResultFile: path.resolve(options.sourceResult),
    taskGraphFile: path.resolve(options.taskGraph),
    runId,
    contentDigest: source.contentDigest,
    target,
  });
  const artifactPreflightProof = validateArtifactPreflightProof({
    repository: proofRoot,
    file: options.artifactPreflight,
    runId,
    source,
    configurationDigest,
    target,
    targetMode,
  });
  const sourceSnapshotFile = path.resolve(options.sourceSnapshot);
  const sourceSnapshot = validateCandidateSourceSnapshot(readReceipt(sourceSnapshotFile), {
    repository,
    snapshot: path.join(repository, ".cache/source-code-analysis/snapshot.json"),
    output: sourceSnapshotFile,
    source: source.commitSha,
    tree: source.treeId,
    content: source.contentDigest,
  });
  const rehearsal = validateArtifactRehearsal(readReceipt(options.rehearsal), {
    repository,
    artifact,
    manifest: manifestFile,
    staticAcceptance: path.resolve(options.staticAcceptance),
    source: source.commitSha,
    tree: source.treeId,
    content: source.contentDigest,
    configuration: configurationDigest,
    target,
    targetMode,
  });
  return {
    runId,
    source,
    configurationDigest,
    target: { kind: target === "monolith" ? "monolith" : "unit", id: target, mode: targetMode },
    artifact: {
      sha256: digestFile(artifact),
      manifestSha256: digestFile(manifestFile),
      sizeBytes: fs.statSync(artifact).size,
      runner: artifactReceipt.runner,
    },
    proofs: {
      ...artifactPreflightProof,
      sourceReceiptSha256: digestFile(options.sourceReceipt),
      ...sourceProof,
      sourceSnapshotReceiptSha256: digestFile(sourceSnapshotFile),
      sourceSnapshotSha256: sourceSnapshot.snapshot.sha256,
      staticAcceptanceReceiptSha256: digestFile(options.staticAcceptance),
      rehearsalReceiptSha256: digestFile(options.rehearsal),
      artifactReceiptSha256: digestFile(artifactReceiptFile),
    },
    runtime: rehearsal.staticAcceptance.inspection,
  };
}

function body(options) {
  return {
    schemaVersion: 1,
    kind: "workspace-ready-artifact",
    status: "ready",
    command: "ops/publish.sh ci",
    ...prove(options),
    checks: CHECKS,
  };
}

function readyTarget(target, targetMode) {
  const id = requiredPattern(target ?? "monolith", TARGET_PATTERN, "target");
  const mode = id === "monolith" ? "activate" : targetMode;
  if (!new Set(["activate", "shadow"]).has(mode)) throw new Error("target mode is invalid");
  if (id === "monolith" && targetMode && targetMode !== "activate") {
    throw new Error("monolith Ready target mode must be activate");
  }
  return { id, mode };
}

export function readyPointerFile(root, target = "monolith", targetMode = "activate") {
  const selected = readyTarget(target, targetMode);
  return path.resolve(root, "pointers", selected.id, selected.mode, "current.json");
}

function currentPointer(root, target, targetMode) {
  const selected = readyTarget(target, targetMode);
  const file = readyPointerFile(root, selected.id, selected.mode);
  let pointer;
  try { pointer = JSON.parse(fs.readFileSync(file, "utf8")); } catch {
    throw new Error(`no Ready Artifact for ${selected.id}:${selected.mode}; run ops/publish.sh ci first`);
  }
  if (pointer?.schemaVersion !== 2 || pointer?.kind !== "workspace-ready-pointer"
    || pointer.target?.id !== selected.id || pointer.target?.mode !== selected.mode
    || typeof pointer.receipt !== "string" || path.isAbsolute(pointer.receipt)
    || pointer.receipt.startsWith("../")) throw new Error("Ready Artifact pointer is invalid");
  const receiptFile = path.resolve(root, pointer.receipt);
  if (path.relative(path.resolve(root), receiptFile).startsWith("..")) throw new Error("Ready Artifact pointer escapes its root");
  return { pointer, receiptFile, selected };
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function writeImmutableReadyReceipt(file, receipt) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, serialized, { flag: "wx", mode: 0o600 });
    try {
      fs.linkSync(temporary, target);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (fs.readFileSync(target, "utf8") !== serialized) {
        throw new Error("Ready Artifact receipt path already contains different immutable evidence");
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function createReadyArtifact(options) {
  const root = path.resolve(options.root);
  const selected = readyTarget(options.target, options.targetMode);
  const output = path.resolve(options.output);
  const expectedReceiptDirectory = path.resolve(root, "receipts", selected.id, selected.mode);
  if (path.dirname(output) !== expectedReceiptDirectory) {
    throw new Error(`ready receipt must be inside receipts/${selected.id}/${selected.mode}`);
  }
  const receiptRunId = requiredPattern(options.runId, RUN_PATTERN, "CI run id");
  const receiptContent = requiredPattern(options.contentDigest, DIGEST_PATTERN, "content digest");
  const receiptConfiguration = requiredPattern(
    options.configurationDigest,
    DIGEST_PATTERN,
    "configuration digest",
  );
  const expectedReceiptName = `${receiptRunId}-${receiptContent}-${receiptConfiguration}.json`;
  if (path.basename(output) !== expectedReceiptName) {
    throw new Error("ready receipt filename must bind CI run, content, and configuration");
  }
  const receipt = fs.existsSync(output)
    ? verifyReadyArtifact(readReceipt(output), options)
    : { ...body(options), completedAt: new Date().toISOString() };
  writeImmutableReadyReceipt(output, receipt);
  const relative = path.relative(root, output);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("ready receipt must be inside ready root");
  atomicJson(readyPointerFile(root, selected.id, selected.mode), {
    schemaVersion: 2,
    kind: "workspace-ready-pointer",
    target: selected,
    receipt: relative.split(path.sep).join("/"),
  });
  return receipt;
}

export function readCurrentReadyArtifact({ root, target = "monolith", targetMode = "activate" }) {
  const current = currentPointer(root, target, targetMode);
  const receipt = readReceipt(current.receiptFile);
  if (receipt?.schemaVersion !== 1 || receipt.kind !== "workspace-ready-artifact"
    || receipt.status !== "ready" || receipt.target?.id !== current.selected.id
    || receipt.target?.mode !== current.selected.mode) {
    throw new Error(`Ready Artifact receipt does not match selected target ${current.selected.id}:${current.selected.mode}`);
  }
  return { receiptFile: current.receiptFile, receipt };
}

export function verifyReadyArtifact(receipt, options) {
  const expected = { ...body(options), completedAt: receipt?.completedAt };
  if (!Number.isFinite(Date.parse(receipt?.completedAt ?? "")) || JSON.stringify(receipt) !== JSON.stringify(expected)) {
    throw new Error("Ready Artifact receipt does not match exact source, configuration, target, and artifact");
  }
  return receipt;
}

function parse(argv) {
  const [command, ...rest] = argv;
  const raw = { command, repository: process.cwd(), target: "monolith", target_mode: "activate" };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = rest[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`${key} is missing a value`);
    raw[key.slice(2).replaceAll("-", "_")] = value;
  }
  return {
    command,
    repository: raw.repository,
    proofRoot: raw.proof_root,
    root: raw.root,
    output: raw.output,
    file: raw.file,
    runId: raw.run_id,
    commitSha: raw.source,
    treeId: raw.tree,
    contentDigest: raw.content,
    configurationDigest: raw.configuration,
    target: raw.target,
    targetMode: raw.target_mode,
    artifact: raw.artifact,
    manifest: raw.manifest,
    contract: raw.contract,
    sourceReceipt: raw.source_receipt,
    sourceResult: raw.source_result,
    sourceSnapshot: raw.source_snapshot,
    taskGraph: raw.task_graph,
    staticAcceptance: raw.static_acceptance,
    rehearsal: raw.rehearsal,
    artifactPreflight: raw.artifact_preflight,
    artifactReceipt: raw.artifact_receipt,
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.command === "create") return createReadyArtifact(options);
  if (options.command === "verify") return verifyReadyArtifact(readReceipt(options.file), options);
  if (options.command === "current") {
    const current = readCurrentReadyArtifact({
      root: options.root,
      target: options.target,
      targetMode: options.targetMode,
    });
    process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
    return current.receipt;
  }
  throw new Error("usage: ready-artifact.mjs create|verify|current ...");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
