import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectArchive } from "./artifact-inspection.mjs";
import { rehearseArtifact } from "./rehearse-artifact.mjs";

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
  ]);
  for (const [relative, body] of files) {
    const file = path.join(contentRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
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
