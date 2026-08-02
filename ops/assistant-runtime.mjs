#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ASSISTANT_RUNTIME_DESCRIPTOR = Object.freeze({
  schemaVersion: 1,
  kind: "workspace-assistant-runtime",
  sidecars: [{
    id: "wecom-agent",
    processName: "workspace-assistant-wecom",
    entry: "scripts/runtime/wecom-agent-bot.mjs",
    memoryMiB: 256,
    requiredEnv: ["WECHAT_BOT_ID", "WECHAT_BOT_SECRET", "WECOM_WORKER_BRIDGE_SECRET"],
    bridgePath: "/api/integrations/wecom/agent",
    activation: "active-slot-only",
  }],
});

const RUNTIME_FILES = [
  "scripts/runtime/wecom-agent-bot.mjs",
  "scripts/runtime/wecom-agent-delivery.mjs",
  "scripts/runtime/wecom-agent-input.mjs",
  "scripts/runtime/wecom-agent-stream.mjs",
  "scripts/runtime/wecom-notification-delivery.mjs",
];
const RUNTIME_PACKAGES = ["@wecom/aibot-node-sdk", "sharp"];

export function resolveAssistantPublicOrigin(environment = process.env) {
  const candidate = (environment.WECHAT_REDIRECT_ORIGIN ?? "").trim()
    || (environment.WORKSPACE_PUBLIC_ORIGIN ?? "").trim();
  if (!candidate) {
    throw new Error(
      "Assistant sidecar requires WECHAT_REDIRECT_ORIGIN or WORKSPACE_PUBLIC_ORIGIN",
    );
  }
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Assistant sidecar public origin is invalid");
  }
  if (!["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new Error("Assistant sidecar public origin is invalid");
  }
  return url.origin;
}

function requireDirectory(directory, label) {
  const resolved = path.resolve(directory);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${label} is not a directory: ${resolved}`);
  }
  return resolved;
}

function packageDirectory(repositoryRoot, packageName) {
  return path.join(repositoryRoot, "node_modules", ...packageName.split("/"));
}

function dependencyClosure(repositoryRoot, roots) {
  const seen = new Set();
  function visit(packageName, optional = false) {
    if (seen.has(packageName)) return;
    const directory = packageDirectory(repositoryRoot, packageName);
    const packageFile = path.join(directory, "package.json");
    if (!fs.existsSync(packageFile)) {
      if (optional) return;
      throw new Error(`Missing Assistant runtime dependency: ${packageName}`);
    }
    seen.add(packageName);
    const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    for (const dependency of Object.keys(packageJson.dependencies ?? {})) visit(dependency);
    for (const dependency of Object.keys(packageJson.optionalDependencies ?? {})) visit(dependency, true);
  }
  for (const packageName of roots) visit(packageName);
  return [...seen].sort();
}

export function normalizeAssistantRuntimeDescriptor(value) {
  if (JSON.stringify(value) !== JSON.stringify(ASSISTANT_RUNTIME_DESCRIPTOR)) {
    throw new Error("Assistant runtime descriptor is invalid or unsupported");
  }
  return value;
}

export function bundleAssistantRuntime({ repositoryRoot = process.cwd(), standaloneRoot }) {
  const root = requireDirectory(repositoryRoot, "repository root");
  const output = requireDirectory(standaloneRoot, "standalone root");

  for (const relativeFile of RUNTIME_FILES) {
    const source = path.join(root, relativeFile);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`Missing Assistant runtime file: ${relativeFile}`);
    }
    const destination = path.join(output, relativeFile);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  for (const packageName of dependencyClosure(root, RUNTIME_PACKAGES)) {
    const source = packageDirectory(root, packageName);
    const destination = packageDirectory(output, packageName);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, dereference: false });
  }

  const descriptorFile = path.join(output, ".assistant-runtime.json");
  fs.writeFileSync(descriptorFile, `${JSON.stringify(ASSISTANT_RUNTIME_DESCRIPTOR, null, 2)}\n`, { mode: 0o600 });
  return { descriptorFile, packageNames: dependencyClosure(root, RUNTIME_PACKAGES), runtimeFiles: [...RUNTIME_FILES] };
}

export function readAssistantRuntimeDescriptor(releaseRoot) {
  const root = requireDirectory(releaseRoot, "Assistant release root");
  const descriptorFile = path.join(root, ".assistant-runtime.json");
  const descriptor = normalizeAssistantRuntimeDescriptor(JSON.parse(fs.readFileSync(descriptorFile, "utf8")));
  for (const sidecar of descriptor.sidecars) {
    const entry = path.resolve(root, sidecar.entry);
    if (!entry.startsWith(`${root}${path.sep}`) || !fs.statSync(entry).isFile()) {
      throw new Error(`Assistant sidecar entry is missing or unsafe: ${sidecar.entry}`);
    }
  }
  return descriptor;
}

export function assertAssistantRuntimeEnvironment({ releaseRoot, environment = process.env }) {
  const descriptor = readAssistantRuntimeDescriptor(releaseRoot);
  const missing = descriptor.sidecars.flatMap((sidecar) => sidecar.requiredEnv)
    .filter((key, index, values) => values.indexOf(key) === index)
    .filter((key) => typeof environment[key] !== "string" || environment[key].trim() === "");
  if (missing.length > 0) {
    throw new Error(`Assistant sidecar environment is incomplete: ${missing.join(", ")}`);
  }
  if ((environment.WECOM_WORKER_BRIDGE_SECRET ?? "").trim().length < 32) {
    throw new Error("Assistant sidecar WECOM_WORKER_BRIDGE_SECRET must contain at least 32 characters");
  }
  resolveAssistantPublicOrigin(environment);
  return descriptor;
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${flag} is required`);
  return value;
}

export function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (command === "bundle") {
    return bundleAssistantRuntime({
      repositoryRoot: valueAfter(argv, "--repository-root"),
      standaloneRoot: valueAfter(argv, "--standalone-root"),
    });
  }
  if (command === "assert") return readAssistantRuntimeDescriptor(valueAfter(argv, "--release-root"));
  if (command === "env-assert") {
    return assertAssistantRuntimeEnvironment({ releaseRoot: valueAfter(argv, "--release-root") });
  }
  throw new Error("Usage: assistant-runtime.mjs bundle --repository-root <dir> --standalone-root <dir> | assert|env-assert --release-root <dir>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
