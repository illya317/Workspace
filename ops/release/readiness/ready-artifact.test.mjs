import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeRuntimeTree } from "../artifact/runtime-tree-permissions.mjs";
import { inspectArchive } from "./artifact-inspection.mjs";
import { rehearseArtifact } from "./rehearse-artifact.mjs";
import {
  readCurrentReadyArtifact,
  readyPointerFile,
  validateArtifactPreflightProof,
  validateSourceProof,
  writeImmutableReadyReceipt,
} from "./ready-artifact.mjs";

test("Ready receipt creation is exact-only and never overwrites immutable evidence", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ready-immutable-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "receipt.json");
  const receipt = { schemaVersion: 1, kind: "workspace-ready-artifact", runId: "ci-first" };
  writeImmutableReadyReceipt(file, receipt);
  writeImmutableReadyReceipt(file, receipt);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), receipt);
  assert.throws(
    () => writeImmutableReadyReceipt(file, { ...receipt, runId: "ci-second" }),
    /different immutable evidence/,
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), receipt);
});

test("Ready binds an exact verified Stage-2 preflight receipt digest and identity", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ready-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const validationRoot = path.join(root, "ops/release/validation");
  fs.mkdirSync(validationRoot, { recursive: true });
  fs.writeFileSync(
    path.join(validationRoot, "artifact-preflight.mjs"),
    'if (process.argv[2] !== "verify") process.exit(2);\n',
  );
  const file = path.join(root, "artifact-preflight.json");
  const identityDigest = "a".repeat(64);
  fs.writeFileSync(file, JSON.stringify({ identityDigest }));
  const proof = validateArtifactPreflightProof({
    repository: root,
    file,
    runId: "ci-20260801T000000Z-aaaaaaaaaaaa-11111111",
    source: { commitSha: "b".repeat(40), treeId: "c".repeat(40), contentDigest: "d".repeat(64) },
    configurationDigest: "e".repeat(64),
    target: "finance",
    targetMode: "shadow",
  });
  assert.equal(proof.artifactPreflightIdentityDigest, identityDigest);
  assert.equal(
    proof.artifactPreflightReceiptSha256,
    createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  );

  fs.writeFileSync(file, JSON.stringify({ identityDigest: "invalid" }));
  assert.throws(() => validateArtifactPreflightProof({
    repository: root, file,
    runId: "ci-20260801T000000Z-aaaaaaaaaaaa-11111111",
    source: { commitSha: "b".repeat(40), treeId: "c".repeat(40), contentDigest: "d".repeat(64) },
    configurationDigest: "e".repeat(64), target: "finance", targetMode: "shadow",
  }), /identity digest/);
});

test("Ready source proof rejects a passed result from another validation target", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ready-source-target-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contentDigest = "a".repeat(64);
  const runId = "ci-20260801T000000Z-aaaaaaaaaaaa-11111111";
  const sourceResultFile = path.join(root, "source-result.json");
  fs.writeFileSync(sourceResultFile, JSON.stringify({
    schemaVersion: 3,
    kind: "workspace-release-source-validation-result",
    status: "passed",
    exitCode: 0,
    sourceRunId: runId,
    contentDigest,
    validationTarget: { kind: "unit", id: "hr" },
  }));

  assert.throws(() => validateSourceProof({
    proofRoot: root,
    sourceResultFile,
    taskGraphFile: path.join(root, "unused-task-graph.json"),
    runId,
    contentDigest,
    target: "finance",
  }), /another validation target/);
});

test("real tar root entry is accepted while the deployment runtime is inspected", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ready-archive-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contentRoot = path.join(root, "content");
  const contentDigest = "a".repeat(64);
  const files = new Map([
    [".server-entry", "server.js\n"],
    ["server.js", "console.log('ready');\n"],
    [".next/BUILD_ID", `${contentDigest}\n`],
    [".next/routes-manifest.json", '{"basePath":"/workspace"}\n'],
    ["prisma/schema.prisma", "generator client {}\n"],
    ["prisma/migrations/migration_lock.toml", 'provider = "postgresql"\n'],
    ["node_modules/prisma/build/index.js", "export {};\n"],
    ["seed-resources-runtime.mjs", "export {};\n"],
    ["scripts/check/check-prisma-deploy-status.js", "module.exports = {};\n"],
    ["ops/apply-data-release.mjs", "export {};\n"],
    ["source/node_modules/next/package.json", "{}\n"],
  ]);
  for (const [relative, body] of files) {
    const file = path.join(contentRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  fs.mkdirSync(path.join(contentRoot, "release"), { recursive: true });
  fs.symlinkSync("../source/node_modules", path.join(contentRoot, "release/node_modules"));
  normalizeRuntimeTree(contentRoot);
  const artifact = path.join(root, "artifact.tgz");
  execFileSync("tar", ["-C", contentRoot, "-czf", artifact, "."]);
  const runtime = inspectArchive({
    artifact,
    manifest: { source: { contentDigest }, build: { buildId: contentDigest } },
    target: "monolith",
  });
  assert.equal(runtime.serverEntry, "server.js");
  assert.equal(runtime.buildId, contentDigest);
  assert.equal(runtime.basePath, "/workspace");
  assert.ok(runtime.entryCount >= files.size);

  fs.symlinkSync("/etc/passwd", path.join(contentRoot, "unsafe-link"));
  const unsafeArtifact = path.join(root, "unsafe-artifact.tgz");
  execFileSync("tar", ["-C", contentRoot, "-czf", unsafeArtifact, "."]);
  assert.throws(() => inspectArchive({
    artifact: unsafeArtifact,
    manifest: { source: { contentDigest }, build: { buildId: contentDigest } },
    target: "monolith",
  }), /unsafe symlink/);
});

test("exact archive is started and its health/version rehearsal is reusable", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ready-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contentRoot = path.join(root, "content");
  const contentDigest = "b".repeat(64);
  const source = "c".repeat(40);
  const server = `
const http = require('node:http');
const base = '/workspace';
const version = process.env.BUILD_VERSION;
const app = http.createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === base + '/api/internal/health') return response.end(JSON.stringify({status:'ok', version}));
  if (request.url === base + '/api/settings/version') return response.end(JSON.stringify({version}));
  response.statusCode = 404; response.end('{}');
});

app.listen(Number(process.env.PORT), process.env.HOSTNAME);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close(() => process.exit(0)));
`;
  const files = new Map([
    [".server-entry", "server.js\n"], ["server.js", server],
    [".next/BUILD_ID", `${contentDigest}\n`], [".next/routes-manifest.json", '{"basePath":"/workspace"}\n'],
    [".next/static/.keep", "static\n"], ["prisma/schema.prisma", "generator client {}\n"],
    ["prisma/migrations/migration_lock.toml", 'provider = "postgresql"\n'],
    ["node_modules/prisma/build/index.js", "module.exports = {};\n"],
    ["seed-resources-runtime.mjs", "export {};\n"],
    ["scripts/check/check-prisma-deploy-status.js", "module.exports = {};\n"],
    ["ops/apply-data-release.mjs", "export {};\n"],
  ]);
  for (const [relative, body] of files) {
    const file = path.join(contentRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  normalizeRuntimeTree(contentRoot);
  const artifact = path.join(root, "artifact.tgz");
  execFileSync("tar", ["-C", contentRoot, "-czf", artifact, "."]);
  const artifactSha = (await import("node:crypto")).createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
  const manifest = path.join(root, "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 2,
    source: { commitSha: source, treeSha: "d".repeat(40), contentDigest },
    artifact: { sha256: artifactSha, sizeBytes: fs.statSync(artifact).size },
    build: { buildId: contentDigest },
  }));
  const output = path.join(root, "rehearsal.json");
  const options = {
    repository: root, output, artifact, manifest, source, tree: "d".repeat(40), content: contentDigest,
    configuration: "e".repeat(64), target: "monolith", targetMode: "activate",
  };
  const first = await rehearseArtifact(options);
  const second = await rehearseArtifact(options);
  assert.equal(first.status, "passed");
  assert.deepEqual(second, first);
  assert.equal(first.runtime.version, contentDigest);
});

test("Ready pointers isolate target and mode and reject cross-target receipts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ready-selector-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const writeSelection = (target, mode, source) => {
    const receiptFile = path.join(root, "receipts", target, mode, `${source}.json`);
    fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
    fs.writeFileSync(receiptFile, JSON.stringify({
      schemaVersion: 1,
      kind: "workspace-ready-artifact",
      status: "ready",
      target: { id: target, mode },
      source: { commitSha: source },
    }));
    const pointerFile = readyPointerFile(root, target, mode);
    fs.mkdirSync(path.dirname(pointerFile), { recursive: true });
    fs.writeFileSync(pointerFile, JSON.stringify({
      schemaVersion: 2,
      kind: "workspace-ready-pointer",
      target: { id: target, mode },
      receipt: path.relative(root, receiptFile).split(path.sep).join("/"),
    }));
    return pointerFile;
  };

  writeSelection("monolith", "activate", "a".repeat(40));
  const activatePointer = writeSelection("finance", "activate", "b".repeat(40));
  const shadowPointer = writeSelection("finance", "shadow", "c".repeat(40));
  assert.notEqual(activatePointer, shadowPointer);
  assert.equal(readCurrentReadyArtifact({ root }).receipt.source.commitSha, "a".repeat(40));
  assert.equal(readCurrentReadyArtifact({ root, target: "finance", targetMode: "activate" }).receipt.source.commitSha, "b".repeat(40));
  assert.equal(readCurrentReadyArtifact({ root, target: "finance", targetMode: "shadow" }).receipt.source.commitSha, "c".repeat(40));

  const shadowPointerValue = JSON.parse(fs.readFileSync(shadowPointer, "utf8"));
  const activatePointerValue = JSON.parse(fs.readFileSync(activatePointer, "utf8"));
  shadowPointerValue.receipt = activatePointerValue.receipt;
  fs.writeFileSync(shadowPointer, JSON.stringify(shadowPointerValue));
  assert.throws(
    () => readCurrentReadyArtifact({ root, target: "finance", targetMode: "shadow" }),
    /receipt does not match selected target finance:shadow/,
  );

  shadowPointerValue.receipt = path.relative(
    root,
    path.join(root, "receipts", "finance", "shadow", `${"c".repeat(40)}.json`),
  ).split(path.sep).join("/");
  shadowPointerValue.target.mode = "activate";
  fs.writeFileSync(shadowPointer, JSON.stringify(shadowPointerValue));
  assert.throws(
    () => readCurrentReadyArtifact({ root, target: "finance", targetMode: "shadow" }),
    /pointer is invalid/,
  );
});

test("Ready selector fails closed for missing target and forbids monolith shadow", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-ready-selector-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(
    () => readCurrentReadyArtifact({ root, target: "finance", targetMode: "activate" }),
    /no Ready Artifact for finance:activate/,
  );
  assert.throws(() => readyPointerFile(root, "monolith", "shadow"), /must be activate/);
});
