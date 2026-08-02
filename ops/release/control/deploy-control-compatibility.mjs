#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const EXACT_CONTROL_FILES = new Set([
  "docs/engineering/ops/ci-cd.md",
  "ops/cnb-builder-contract.test.mjs",
  "ops/cnb-release-artifact-cache.sh",
  "ops/deploy-cnb-release-target.sh",
  "ops/deploy-contract.test.mjs",
  "ops/deploy-cutover-contract.test.mjs",
  "ops/deploy-notification.test.mjs",
  "ops/deploy.sh",
  "ops/publish-cnb.sh",
  "ops/publish-contract.test.mjs",
  "ops/publish.sh",
  "ops/production-deploy-preflight.mjs",
  "ops/production-deploy-preflight.test.mjs",
  "ops/reconcile-runtime-config-permissions.sh",
  "ops/release-receipt.mjs",
  "ops/release-receipt.test.mjs",
  "ops/run-cnb-release-stage.sh",
  "ops/run-local-release-action.sh",
  "ops/sync-tenant-config.sh",
  "ops/tenant-config-manifest.test.mjs",
  "scripts/arch/source-code-analysis/operations-module-policy.json",
  "scripts/arch/source-code-analysis/operations-size-policy.json",
]);
const CONTROL_PREFIXES = [
  "ops/deploy/",
  "ops/release/control/",
  "ops/release/deploy/",
  "ops/release/diagnostics/",
];

function git(repository, args, encoding = "utf8") {
  return execFileSync("git", args, { cwd: repository, encoding, maxBuffer: 64 * 1024 * 1024 });
}

export function isDeployControlPath(file) {
  return EXACT_CONTROL_FILES.has(file) || CONTROL_PREFIXES.some((prefix) => file.startsWith(prefix));
}

export function verifyDeployControlCompatibility({ repository, readySource, controllerSource = "HEAD" }) {
  const root = path.resolve(repository);
  if (!SHA_PATTERN.test(readySource ?? "")) throw new Error("Ready source SHA is invalid");
  if (git(root, ["status", "--porcelain", "--untracked-files=all"]).trim()) {
    throw new Error("deploy controller worktree must be clean");
  }
  const sourceSha = git(root, ["rev-parse", controllerSource]).trim();
  const treeId = git(root, ["rev-parse", `${controllerSource}^{tree}`]).trim();
  if (!SHA_PATTERN.test(sourceSha) || !SHA_PATTERN.test(treeId)) throw new Error("deploy controller identity is invalid");
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", readySource, sourceSha], { cwd: root });
  if (ancestry.status !== 0) throw new Error("deploy controller must be a descendant of the Ready source");
  const changedFiles = git(root, [
    "diff", "--no-renames", "--name-only", "-z", readySource, sourceSha,
  ], "buffer").toString("utf8").split("\0").filter(Boolean);
  const forbidden = changedFiles.filter((file) => !isDeployControlPath(file));
  if (forbidden.length > 0) {
    throw new Error(`deploy controller drift includes artifact/source inputs: ${forbidden.join(", ")}`);
  }
  const controlEntries = git(root, ["ls-tree", "-r", "-z", "--full-tree", treeId], "buffer")
    .toString("utf8").split("\0").filter(Boolean)
    .filter((entry) => isDeployControlPath(entry.slice(entry.indexOf("\t") + 1)));
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-controller",
    sourceSha,
    treeId,
    controlDigest: createHash("sha256").update(controlEntries.join("\0")).digest("hex"),
    controlFileCount: controlEntries.length,
    changedFiles,
    requiresValidation: changedFiles.length > 0,
  };
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

export function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.command !== "verify") {
    throw new Error("usage: deploy-control-compatibility.mjs verify --repository ROOT --ready-source SHA");
  }
  const result = verifyDeployControlCompatibility({
    repository: options.repository,
    readySource: options.ready_source,
    controllerSource: options.controller_source ?? "HEAD",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
