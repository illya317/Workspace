#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inspectArchive } from "./artifact-inspection.mjs";
import { deployUnitRuntimeVersion } from "../contracts/deploy-unit-build-identity.mjs";

const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function artifactRehearsalExpectation(options) {
  const manifest = readJson(options.manifest);
  const monolith = options.target === "monolith";
  const artifactSha256 = monolith ? manifest.artifact?.sha256 : manifest.artifact?.sha256;
  const basePath = monolith ? "/workspace" : manifest.build?.basePath;
  const version = monolith ? options.content : deployUnitRuntimeVersion(manifest.build, `${options.target} rehearsal`);
  const healthPath = monolith ? "/api/internal/health" : manifest.runtime?.healthPath;
  const versionPath = monolith ? "/api/settings/version" : manifest.runtime?.versionPath;
  if (!/^[0-9a-f]{64}$/.test(artifactSha256 ?? "")
    || !basePath?.startsWith("/") || !healthPath?.startsWith("/") || !versionPath?.startsWith("/")
    || typeof version !== "string" || version.length === 0) {
    throw new Error("artifact rehearsal manifest contract is invalid");
  }
  return {
    schemaVersion: 1,
    kind: "workspace-artifact-rehearsal",
    status: "passed",
    command: "ops/publish.sh ci",
    source: { commitSha: options.source, treeId: options.tree, contentDigest: options.content },
    configurationDigest: options.configuration,
    target: { id: options.target, mode: options.targetMode },
    artifact: {
      sha256: artifactSha256,
      manifestSha256: sha256File(options.manifest),
    },
    runtime: { basePath, healthPath, versionPath, version },
  };
}

export function validateArtifactRehearsal(receipt, options) {
  const body = artifactRehearsalExpectation(options);
  if (!Number.isFinite(Date.parse(receipt?.completedAt ?? ""))
    || JSON.stringify(receipt) !== JSON.stringify({ ...body, completedAt: receipt.completedAt })) {
    throw new Error("artifact rehearsal does not match the exact source, config, target, and artifact");
  }
  return receipt;
}

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("failed to allocate artifact rehearsal port");
  return port;
}

async function probe(url, validate, child, logs) {
  const deadline = Date.now() + 90_000;
  let lastError = "not started";
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`artifact runtime exited before readiness: ${logs()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      const text = await response.text();
      if (response.ok && validate(text)) return text;
      lastError = `${response.status} ${text.slice(0, 300)}`;
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`artifact runtime probe timed out at ${url}: ${lastError}; ${logs()}`);
}

async function executeRuntime(options, runtime) {
  const port = await unusedPort();
  const runner = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/testing/e2e-standalone.mjs");
  const child = spawn(process.execPath, [runner], {
    cwd: options.repository,
    env: {
      ...process.env,
      CI: "1",
      PORT: String(port),
      PLAYWRIGHT_PORT: String(port),
      PLAYWRIGHT_STANDALONE_ARCHIVE: options.artifact,
      PLAYWRIGHT_STANDALONE_MANIFEST: options.manifest,
      PLAYWRIGHT_STANDALONE_COMMIT: options.source,
      NEXT_PUBLIC_BUILD_VERSION: runtime.version,
      BUILD_VERSION: runtime.version,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const append = (chunk) => { output = `${output}${chunk}`.slice(-16_000); };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  try {
    const origin = `http://127.0.0.1:${port}${runtime.basePath}`;
    await probe(`${origin}${runtime.healthPath}`, (text) => {
      try { const value = JSON.parse(text); return value.status === "ok" && value.version === runtime.version; }
      catch { return false; }
    }, child, () => output);
    await probe(`${origin}${runtime.versionPath}`, (text) => {
      try { return JSON.parse(text).version === runtime.version; }
      catch { return false; }
    }, child, () => output);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
  }
}

export async function rehearseArtifact(options) {
  const body = artifactRehearsalExpectation(options);
  if (fs.existsSync(options.output)) {
    try {
      const receipt = validateArtifactRehearsal(readJson(options.output), options);
      process.stdout.write("==> 复用 exact artifact 的启动演练回执\n");
      return receipt;
    } catch { /* invalid derived evidence is replaced */ }
  }
  const manifest = readJson(options.manifest);
  inspectArchive({ artifact: options.artifact, manifest, target: options.target });
  await executeRuntime(options, body.runtime);
  const receipt = { ...body, completedAt: new Date().toISOString() };
  atomicJson(options.output, receipt);
  return receipt;
}

function parse(argv) {
  const options = { repository: process.cwd(), target: "monolith", targetMode: "activate" };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(`invalid argument: ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return {
    repository: path.resolve(options.repository), output: path.resolve(options.output),
    artifact: path.resolve(options.artifact), manifest: path.resolve(options.manifest),
    source: options.source, tree: options.tree, content: options.content,
    configuration: options.configuration, target: options.target, targetMode: options.target_mode,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  rehearseArtifact(parse(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
