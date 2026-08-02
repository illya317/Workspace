#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDeployPreflightBindings,
  recordDeployPreflightEvidence,
  verifyDeployPreflightReady,
} from "./preflight.mjs";

const DIGEST = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const SNAPSHOT_SCHEMA = "workspace.unit-production-semantic-snapshot/v1";
const fail = (message) => { throw new Error(message); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function requireDigest(value, label) {
  if (!DIGEST.test(value ?? "")) fail(`${label} must be SHA-256`);
  return value;
}
function requireSha(value, label) {
  if (!SHA.test(value ?? "")) fail(`${label} must be a Git SHA`);
  return value;
}
async function digestFile(path, label) {
  try { return sha256(await readFile(resolve(path))); } catch (error) {
    if (error?.code === "ENOENT") return sha256(`missing:${label}`);
    throw error;
  }
}
async function jsonFile(path, label, strict) {
  try { return JSON.parse(await readFile(resolve(path), "utf8")); } catch {
    if (strict) fail(`${label} is unavailable or invalid`);
    return null;
  }
}

export function verifyUnitProductionSemanticSnapshot(snapshot) {
  const keys = [
    "currentTargetDigest", "deployedReceiptDigest", "gatewayManifestDigest", "schema",
    "semanticDigest", "tenantManifestDigest", "unitId", "unitStateDigest",
  ];
  if (!snapshot || Object.keys(snapshot).sort().join(",") !== keys.join(",")
    || snapshot.schema !== SNAPSHOT_SCHEMA || !/^[a-z][a-z0-9-]*$/.test(snapshot.unitId ?? "")) {
    fail("unit production semantic snapshot contract is invalid");
  }
  for (const key of keys.filter((key) => key.endsWith("Digest"))) requireDigest(snapshot[key], `unit production snapshot ${key}`);
  const { semanticDigest, ...body } = snapshot;
  if (semanticDigest !== sha256(canonicalJson(body))) fail("unit production semantic snapshot digest mismatch");
  return snapshot;
}

function unavailableSnapshot(unitId) {
  const unavailable = sha256("unit-production-snapshot-unavailable");
  const body = {
    schema: SNAPSHOT_SCHEMA, currentTargetDigest: unavailable, deployedReceiptDigest: unavailable,
    gatewayManifestDigest: unavailable, tenantManifestDigest: unavailable,
    unitId: /^[a-z][a-z0-9-]*$/.test(unitId ?? "") ? unitId : "unavailable", unitStateDigest: unavailable,
  };
  return { ...body, semanticDigest: sha256(canonicalJson(body)) };
}

export async function buildUnitDeployBindings(context, { strict = false } = {}) {
  const metadata = await jsonFile(context.metadataFile, "release metadata", strict);
  const manifest = await jsonFile(context.manifestFile, "unit artifact manifest", strict && context.operation === "deploy");
  const snapshotValue = await jsonFile(context.snapshotFile, "unit production snapshot", strict);
  const snapshot = snapshotValue ? verifyUnitProductionSemanticSnapshot(snapshotValue) : unavailableSnapshot(context.unitId);
  const ready = metadata?.releaseReady ?? null;
  const controllerReady = metadata?.controllerReady ?? null;
  const artifactSha = await digestFile(context.artifactFile, "unit-artifact");
  const manifestSha = await digestFile(context.manifestFile, "unit-artifact-manifest");
  const graphDigest = await digestFile(context.deployGraphFile, "unit-deploy-graph");
  const bundleManifestDigest = await digestFile(context.deployToolBundleManifest, "deploy-tool-bundle-manifest");
  if (strict) {
    requireSha(context.sourceSha, "source SHA");
    requireSha(context.sourceTree, "source tree");
    requireDigest(context.contentDigest, "content digest");
    if (context.operation !== "deploy") fail("immutable Unit Deploy Preflight Ready currently requires a deploy operation");
    if (ready?.status !== "ready" || ready.source?.commitSha !== context.sourceSha
      || ready.source?.treeId !== context.sourceTree || ready.source?.contentDigest !== context.contentDigest
      || ready.target?.id !== context.unitId || ready.target?.mode !== context.mode
      || ready.artifact?.sha256 !== artifactSha || ready.artifact?.manifestSha256 !== manifestSha
      || manifest?.unit?.id !== context.unitId) fail("exact Unit Application Ready inputs drifted before Deploy Preflight Ready");
    requireDigest(ready.configurationDigest, "configuration digest");
    requireSha(controllerReady?.controller?.sourceSha, "controller source SHA");
    requireSha(controllerReady?.controller?.treeId, "controller tree");
    requireDigest(controllerReady?.controller?.controlDigest, "controller control digest");
    requireDigest(controllerReady?.receiptDigest, "Controller Ready receipt digest");
  }
  const safeSha = (value, label) => strict ? requireSha(value, label) : (SHA.test(value ?? "") ? value : "0".repeat(40));
  const safeDigest = (value, label) => strict ? requireDigest(value, label) : (DIGEST.test(value ?? "") ? value : sha256(`unavailable:${label}`));
  return createDeployPreflightBindings({
    candidate: {
      runId: ready?.runId ?? "unavailable", readyReceiptDigest: sha256(canonicalJson(ready ?? { status: "unavailable" })),
      source: { commitSha: safeSha(context.sourceSha, "source SHA"), treeId: safeSha(context.sourceTree, "source tree"), contentDigest: safeDigest(context.contentDigest, "content digest") },
      configurationDigest: safeDigest(ready?.configurationDigest, "configuration digest"), target: { id: context.unitId, mode: context.mode },
      artifact: { sha256: artifactSha, manifestSha256: manifestSha, buildId: manifest?.build?.buildId ?? "unavailable", deploymentId: manifest?.build?.deploymentId ?? "unavailable" },
    },
    controller: {
      sourceSha: safeSha(controllerReady?.controller?.sourceSha, "controller source SHA"), treeId: safeSha(controllerReady?.controller?.treeId, "controller tree"),
      controlDigest: safeDigest(controllerReady?.controller?.controlDigest, "controller control digest"), receiptDigest: safeDigest(controllerReady?.receiptDigest, "Controller Ready receipt digest"),
      deployToolBundleManifestDigest: bundleManifestDigest,
    },
    deployInput: {
      operation: context.operation, deployGraphDigest: graphDigest, executionMode: context.executionMode, mode: context.mode,
      remoteRootDigest: requireDigest(context.remoteRootDigest, "remote root digest"), serverIdentityDigest: requireDigest(context.serverIdentityDigest, "server identity digest"),
      target: context.unitId, tenantManifestDigest: safeDigest(ready?.configurationDigest, "configuration digest"),
    },
    productionSnapshot: snapshot,
  });
}

async function readChecks(file) {
  return (await readFile(resolve(file), "utf8")).split("\n").filter(Boolean).map((line) => {
    const [key, commandId, inputDigest, status, exitCode, dependencies, log] = line.split("\t");
    if ([key, commandId, inputDigest, status, dependencies, log].some((value) => value === undefined)) fail("invalid unit preflight checks TSV");
    return { key, commandId, inputDigest, status, exitCode: exitCode === "" ? null : Number(exitCode), dependencies: dependencies ? dependencies.split(",") : [], log: resolve(log) };
  });
}
function parseArgs(argv) {
  const command = argv.shift();
  const options = {};
  while (argv.length) {
    const key = argv.shift();
    if (!key?.startsWith("--") || argv.length === 0) fail("invalid unit preflight arguments");
    options[key.slice(2)] = argv.shift();
  }
  return { command, options };
}
async function writePrivateJson(file, value) {
  await writeFile(resolve(file), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(resolve(file), 0o600);
}
function contextFromOptions(options) {
  return {
    metadataFile: options.metadata, artifactFile: options.artifact, manifestFile: options.manifest, deployGraphFile: options.graph,
    deployToolBundleManifest: options.bundle, snapshotFile: options.snapshot, sourceSha: options.source, sourceTree: options.tree,
    contentDigest: options.content, unitId: options.unit, mode: options.mode, operation: options.operation, executionMode: options.execution,
    serverIdentityDigest: sha256(options.server ?? ""), remoteRootDigest: sha256(options.remoteRoot ?? ""),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === "bindings") {
    await writePrivateJson(options.output, await buildUnitDeployBindings(contextFromOptions(options), { strict: options.strict === "1" }));
    return;
  }
  if (command === "input-digest") {
    const bindings = JSON.parse(await readFile(resolve(options.bindings), "utf8"));
    process.stdout.write(sha256(canonicalJson({ bindings, key: options.key, commandId: options.command })));
    return;
  }
  if (command === "record") {
    const bindings = JSON.parse(await readFile(resolve(options.bindings), "utf8"));
    const result = await recordDeployPreflightEvidence({ root: resolve(options.root), attemptId: options.attempt, bindings, checks: await readChecks(options.checks) });
    process.stdout.write(`${JSON.stringify({ attemptFile: result.attemptFile, readyFile: result.readyFile })}\n`);
    return;
  }
  if (command === "verify") {
    const bindings = JSON.parse(await readFile(resolve(options.bindings), "utf8"));
    const ready = await verifyDeployPreflightReady({ file: resolve(options.ready), attemptFile: resolve(options.attempt) });
    if (canonicalJson(ready.bindings) !== canonicalJson(bindings)) fail("Unit Deploy Preflight Ready exact bindings drifted");
    process.stdout.write(`${ready.receiptDigest}\n`);
    return;
  }
  if (command === "snapshot-compare") {
    const expected = verifyUnitProductionSemanticSnapshot(JSON.parse(await readFile(resolve(options.expected), "utf8")));
    const actual = verifyUnitProductionSemanticSnapshot(JSON.parse(await readFile(resolve(options.actual), "utf8")));
    if (canonicalJson(expected) !== canonicalJson(actual)) fail("unit production semantic snapshot drifted while acquiring deploy lock");
    return;
  }
  fail("usage: unit-preflight.mjs bindings|input-digest|record|verify|snapshot-compare ...");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
