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
const SNAPSHOT_SCHEMA = "workspace.production-semantic-snapshot/v1";

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
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
  try { return sha256(await readFile(path)); } catch (error) {
    if (error?.code === "ENOENT") return sha256(`missing:${label}`);
    throw error;
  }
}
async function jsonFile(path, label, strict) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch {
    if (strict) fail(`${label} is unavailable or invalid`);
    return null;
  }
}

export function verifyProductionSemanticSnapshot(snapshot) {
  const keys = [
    "controllerReceiptDigest", "currentTargetDigest", "deployedReceiptDigest",
    "gatewayRouteMapDigest", "schema", "semanticDigest", "tenantManifestDigest",
  ];
  if (!snapshot || Object.keys(snapshot).sort().join(",") !== keys.join(",")
    || snapshot.schema !== SNAPSHOT_SCHEMA) fail("production semantic snapshot contract is invalid");
  for (const key of keys.filter((key) => key.endsWith("Digest"))) requireDigest(snapshot[key], `production snapshot ${key}`);
  const { semanticDigest, ...body } = snapshot;
  if (semanticDigest !== sha256(canonicalJson(body))) fail("production semantic snapshot digest mismatch");
  return snapshot;
}

function unavailableSnapshot() {
  const missing = sha256("production-snapshot-unavailable");
  const body = {
    schema: SNAPSHOT_SCHEMA,
    controllerReceiptDigest: missing,
    currentTargetDigest: missing,
    deployedReceiptDigest: missing,
    gatewayRouteMapDigest: missing,
    tenantManifestDigest: missing,
  };
  return { ...body, semanticDigest: sha256(canonicalJson(body)) };
}

export async function buildFullDeployBindings(context, { strict = false, rehashArtifact = true } = {}) {
  const metadata = await jsonFile(resolve(context.metadataFile), "release metadata", strict);
  const manifest = await jsonFile(resolve(context.manifestFile), "artifact manifest", strict);
  const snapshotValue = await jsonFile(resolve(context.snapshotFile), "production snapshot", strict);
  const snapshot = snapshotValue ? verifyProductionSemanticSnapshot(snapshotValue) : unavailableSnapshot();
  const ready = metadata?.releaseReady ?? null;
  const controllerReady = metadata?.controllerReady ?? null;
  const artifactSha = rehashArtifact || !DIGEST.test(context.artifactSha ?? "")
    ? await digestFile(resolve(context.artifactFile), "artifact")
    : context.artifactSha;
  const manifestSha = await digestFile(resolve(context.manifestFile), "artifact-manifest");
  const graphDigest = await digestFile(resolve(context.deployGraphFile), "deploy-graph");
  const bundleManifestDigest = await digestFile(resolve(context.deployToolBundleManifest), "deploy-tool-bundle-manifest");
  if (strict) {
    requireSha(context.sourceSha, "source SHA");
    requireSha(context.sourceTree, "source tree");
    requireDigest(context.contentDigest, "content digest");
    if (ready?.status !== "ready" || ready.source?.commitSha !== context.sourceSha
      || ready.source?.treeId !== context.sourceTree || ready.source?.contentDigest !== context.contentDigest
      || ready.target?.id !== "monolith" || ready.target?.mode !== "activate"
      || ready.artifact?.sha256 !== artifactSha || ready.artifact?.manifestSha256 !== manifestSha) {
      fail("exact Application Ready inputs drifted before Deploy Preflight Ready");
    }
    requireDigest(controllerReady?.receiptDigest, "Controller Ready receipt digest");
    requireDigest(controllerReady?.controller?.controlDigest, "controller control digest");
    requireDigest(context.migrationSetDigest, "migration set digest");
  }
  const safeSha = (value, label) => strict ? requireSha(value, label) : (SHA.test(value ?? "") ? value : "0".repeat(40));
  const safeDigest = (value, label) => strict ? requireDigest(value, label) : (DIGEST.test(value ?? "") ? value : sha256(`unavailable:${label}`));
  return createDeployPreflightBindings({
    candidate: {
      runId: ready?.runId ?? "unavailable",
      readyReceiptDigest: sha256(canonicalJson(ready ?? { status: "unavailable" })),
      source: {
        commitSha: safeSha(context.sourceSha, "source SHA"),
        treeId: safeSha(context.sourceTree, "source tree"),
        contentDigest: safeDigest(context.contentDigest, "content digest"),
      },
      configurationDigest: safeDigest(ready?.configurationDigest, "configuration digest"),
      target: { id: ready?.target?.id ?? "monolith", mode: ready?.target?.mode ?? "activate" },
      artifact: {
        sha256: artifactSha, manifestSha256: manifestSha,
        buildId: manifest?.build?.buildId ?? ready?.runtime?.buildId ?? "unavailable",
        deploymentId: manifest?.build?.deploymentId ?? ready?.runtime?.deploymentId ?? ready?.runtime?.buildId ?? "unavailable",
      },
    },
    controller: {
      sourceSha: safeSha(controllerReady?.controller?.sourceSha, "controller source SHA"),
      treeId: safeSha(controllerReady?.controller?.treeId, "controller tree"),
      controlDigest: safeDigest(controllerReady?.controller?.controlDigest, "controller control digest"),
      receiptDigest: safeDigest(controllerReady?.receiptDigest, "Controller Ready receipt digest"),
      deployToolBundleManifestDigest: bundleManifestDigest,
    },
    deployInput: {
      tenantManifestDigest: safeDigest(ready?.configurationDigest, "configuration digest"),
      serverIdentityDigest: requireDigest(context.serverIdentityDigest, "server identity digest"),
      remoteRootDigest: requireDigest(context.remoteRootDigest, "remote root digest"),
      migrationSetDigest: safeDigest(context.migrationSetDigest, "migration set digest"),
      deployGraphDigest: graphDigest,
      executionMode: context.executionMode,
      runtimeMode: context.runtimeMode,
      target: "monolith",
    },
    productionSnapshot: snapshot,
  });
}

async function readChecks(file) {
  const text = await readFile(file, "utf8");
  return text.split("\n").filter(Boolean).map((line) => {
    const [key, commandId, inputDigest, status, exitCode, dependencies, log] = line.split("\t");
    if ([key, commandId, inputDigest, status, dependencies, log].some((value) => value === undefined)) fail("invalid preflight checks TSV");
    return {
      key, commandId, inputDigest, status,
      exitCode: exitCode === "" ? null : Number(exitCode),
      dependencies: dependencies ? dependencies.split(",") : [],
      log: resolve(log),
    };
  });
}

function parseArgs(argv) {
  const command = argv.shift();
  const options = {};
  while (argv.length) {
    const key = argv.shift();
    if (!key?.startsWith("--") || argv.length === 0) fail("invalid full preflight arguments");
    options[key.slice(2)] = argv.shift();
  }
  return { command, options };
}
async function writePrivateJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === "bindings") {
    const context = JSON.parse(await readFile(resolve(options.context), "utf8"));
    const result = await buildFullDeployBindings(context, {
      strict: options.strict === "1", rehashArtifact: options.rehash !== "0",
    });
    await writePrivateJson(resolve(options.output), result);
    return;
  }
  if (command === "record") {
    const bindings = JSON.parse(await readFile(resolve(options.bindings), "utf8"));
    const result = await recordDeployPreflightEvidence({
      root: resolve(options.root), attemptId: options.attempt, bindings,
      checks: await readChecks(resolve(options.checks)),
    });
    process.stdout.write(`${JSON.stringify({ attemptFile: result.attemptFile, readyFile: result.readyFile })}\n`);
    return;
  }
  if (command === "verify") {
    const exactBindings = JSON.parse(await readFile(resolve(options.bindings), "utf8"));
    const ready = await verifyDeployPreflightReady({ file: resolve(options.ready), attemptFile: resolve(options.attempt) });
    if (canonicalJson(ready.bindings) !== canonicalJson(exactBindings)) fail("Deploy Preflight Ready exact bindings drifted");
    process.stdout.write(`${ready.receiptDigest}\n`);
    return;
  }
  if (command === "snapshot-compare") {
    const expected = verifyProductionSemanticSnapshot(JSON.parse(await readFile(resolve(options.expected), "utf8")));
    const actual = verifyProductionSemanticSnapshot(JSON.parse(await readFile(resolve(options.actual), "utf8")));
    if (canonicalJson(expected) !== canonicalJson(actual)) fail("production semantic snapshot drifted while acquiring deploy lock");
    return;
  }
  fail("usage: full-preflight.mjs bindings|record|verify|snapshot-compare ...");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
