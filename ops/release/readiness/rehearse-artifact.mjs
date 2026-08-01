#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inspectArchive } from "./artifact-inspection.mjs";
import { deployUnitRuntimeVersion } from "../contracts/deploy-unit-build-identity.mjs";
import { ensureInternalUnitIdentity } from "../../internal-unit-identity.mjs";

export const DEPLOY_UNIT_IDENTITY_ENVIRONMENT_KEYS = [
  "WORKSPACE_DEPLOY_UNIT_ID",
  "WORKSPACE_DEPLOY_SLOT",
  "WORKSPACE_DEPLOY_CURRENT_STATE_FILE",
  "WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE",
  "WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE",
  "WORKSPACE_INTERNAL_REPLAY_DIRECTORY",
];

export const DEPLOY_UNIT_REHEARSAL_ENVIRONMENT_KEYS = [
  ...DEPLOY_UNIT_IDENTITY_ENVIRONMENT_KEYS,
  "WORKSPACE_INTERNAL_ORIGIN",
  "PG_POOL_MAX",
  "PG_APPLICATION_NAME",
];

const FATAL_RUNTIME_CONTRACT = /WORKSPACE_(?:DEPLOY|INTERNAL)_[A-Z_]+[^\n]{0,240}(?:must|required|missing|invalid)/i;

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

export async function probeRuntimeEndpoint(url, validate, child, logs, controls = {}) {
  const now = controls.now ?? (() => Date.now());
  const fetchImpl = controls.fetchImpl ?? fetch;
  const sleep = controls.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  const deadline = now() + (controls.timeoutMs ?? 90_000);
  let lastError = "not started";
  while (now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`artifact runtime exited before readiness: ${logs()}`);
    }
    let response;
    let text;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(2_000) });
      text = await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(250);
      continue;
    }
    if (response.ok && validate(text)) return text;
    lastError = `${response.status} ${text.slice(0, 300)}`;
    const runtimeLogs = logs();
    if (response.status >= 500 && FATAL_RUNTIME_CONTRACT.test(`${text}\n${runtimeLogs}`)) {
      throw new Error(`artifact runtime contract failed at ${url}: ${lastError}; ${runtimeLogs}`);
    }
    await sleep(250);
  }
  throw new Error(`artifact runtime probe timed out at ${url}: ${lastError}; ${logs()}`);
}

export function artifactRehearsalRuntimeEnvironment({
  baseEnvironment = process.env,
  identity,
  manifest,
  options,
  port,
  rehearsalRoot,
  runtime,
}) {
  const environment = {
    ...baseEnvironment,
    CI: "1",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    PLAYWRIGHT_PORT: String(port),
    PLAYWRIGHT_STANDALONE_ARCHIVE: options.artifact,
    PLAYWRIGHT_STANDALONE_MANIFEST: options.manifest,
    PLAYWRIGHT_STANDALONE_COMMIT: options.source,
    NEXT_PUBLIC_BUILD_VERSION: runtime.version,
    BUILD_VERSION: runtime.version,
  };
  for (const key of DEPLOY_UNIT_IDENTITY_ENVIRONMENT_KEYS) delete environment[key];
  if (options.target === "monolith") return environment;
  const databasePoolMax = manifest.runtime?.capacity?.databasePoolMax;
  if (!Number.isSafeInteger(databasePoolMax) || databasePoolMax <= 0 || !identity || !rehearsalRoot) {
    throw new Error("deploy-unit rehearsal runtime identity is incomplete");
  }
  const slot = "blue";
  return {
    ...environment,
    WORKSPACE_DEPLOY_UNIT_ID: options.target,
    WORKSPACE_DEPLOY_SLOT: slot,
    WORKSPACE_DEPLOY_CURRENT_STATE_FILE: path.join(rehearsalRoot, "gateway/current/unit-states", `${options.target}.json`),
    WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE: identity.privateKeyFile,
    WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE: identity.trustedPublicKeysFile,
    WORKSPACE_INTERNAL_REPLAY_DIRECTORY: identity.replayDirectory,
    WORKSPACE_INTERNAL_ORIGIN: `http://127.0.0.1:${port}`,
    PG_POOL_MAX: String(databasePoolMax),
    PG_APPLICATION_NAME: `workspace-${options.target}-${slot}`,
  };
}

export function prepareArtifactRehearsalRuntime({ manifest, options, port, runtime }) {
  if (options.target === "monolith") {
    return {
      environment: artifactRehearsalRuntimeEnvironment({ manifest, options, port, runtime }),
      root: null,
      cleanup() {},
    };
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-artifact-rehearsal-"));
  try {
    const identity = ensureInternalUnitIdentity({ root: path.join(root, "identity"), unitId: options.target });
    fs.mkdirSync(path.join(root, "gateway/current/unit-states"), { recursive: true, mode: 0o700 });
    return {
      environment: artifactRehearsalRuntimeEnvironment({
        identity,
        manifest,
        options,
        port,
        rehearsalRoot: root,
        runtime,
      }),
      root,
      cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
    };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export async function terminateRuntimeChild(child, controls = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const schedule = controls.schedule ?? setTimeout;
  const cancel = controls.cancel ?? clearTimeout;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = schedule(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, controls.graceMs ?? 8_000);
  try { await exited; }
  finally { cancel(timer); }
}

async function executeRuntime(options, runtime) {
  const port = await unusedPort();
  const runner = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/testing/e2e-standalone.mjs");
  const manifest = readJson(options.manifest);
  const rehearsal = prepareArtifactRehearsalRuntime({ manifest, options, port, runtime });
  let child = null;
  let output = "";
  try {
    child = spawn(process.execPath, [runner], {
      cwd: options.repository,
      env: rehearsal.environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const append = (chunk) => { output = `${output}${chunk}`.slice(-16_000); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const origin = `http://127.0.0.1:${port}${runtime.basePath}`;
    await probeRuntimeEndpoint(`${origin}${runtime.healthPath}`, (text) => {
      try { const value = JSON.parse(text); return value.status === "ok" && value.version === runtime.version; }
      catch { return false; }
    }, child, () => output);
    await probeRuntimeEndpoint(`${origin}${runtime.versionPath}`, (text) => {
      try { return JSON.parse(text).version === runtime.version; }
      catch { return false; }
    }, child, () => output);
  } finally {
    try { await terminateRuntimeChild(child); }
    finally { rehearsal.cleanup(); }
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
