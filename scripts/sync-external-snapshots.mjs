#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const snapshots = [
  {
    name: "tiptap",
    npmPackage: "@tiptap/core",
    version: "3.27.1",
    upstream: "ueberdosis/tiptap",
    fork: "illya317/tiptap",
    snapshotBranch: "workspace-snapshot-v3.27.1",
    snapshotSha: "ed5488a0bedc6698498afb403736023ba170c12b",
  },
  {
    name: "hyperformula",
    npmPackage: "hyperformula",
    version: "3.3.0",
    upstream: "handsontable/hyperformula",
    fork: "illya317/hyperformula",
    snapshotBranch: "workspace-snapshot-3.3.0",
    snapshotSha: "68ae69102969784246bbd29f6646c446f0270bc7",
  },
  {
    name: "docx",
    npmPackage: "docx",
    version: "9.7.1",
    upstream: "dolanmiu/docx",
    fork: "illya317/docx",
    snapshotBranch: "workspace-snapshot-9.7.1",
    snapshotSha: "4934d310c724520ad9d3e7e6d5d47430664ea9f7",
  },
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const selectedNames = args.filter((arg) => !arg.startsWith("--"));
const selected = selectedNames.length
  ? snapshots.filter((snapshot) => selectedNames.includes(snapshot.name))
  : snapshots;

if (selected.length === 0) {
  throw new Error(`No matching snapshots for: ${selectedNames.join(", ")}`);
}

for (const snapshot of selected) {
  log(`Syncing ${snapshot.name} (${snapshot.npmPackage}@${snapshot.version})`);
  run("gh", [
    "repo",
    "sync",
    snapshot.fork,
    "--source",
    snapshot.upstream,
    "--force",
  ]);
  ensureSnapshotRef(snapshot);
}

function ensureSnapshotRef(snapshot) {
  const update = run("gh", [
    "api",
    "-X",
    "PATCH",
    `repos/${snapshot.fork}/git/refs/heads/${snapshot.snapshotBranch}`,
    "-f",
    `sha=${snapshot.snapshotSha}`,
    "-F",
    "force=true",
  ], { allowFailure: true, silent: true });

  if (update.status !== 0) {
    run("gh", [
      "api",
      `repos/${snapshot.fork}/git/refs`,
      "-f",
      `ref=refs/heads/${snapshot.snapshotBranch}`,
      "-f",
      `sha=${snapshot.snapshotSha}`,
    ]);
  }
  log(`Pinned ${snapshot.fork}#${snapshot.snapshotBranch} -> ${snapshot.snapshotSha}`);
}

function run(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(" ");
  if (!options.silent) log(`$ ${printable}`);
  if (dryRun) return { status: 0, stdout: "", stderr: "" };

  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.silent ? "pipe" : "inherit",
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`Command failed: ${printable}`);
  }
  return result;
}

function log(message) {
  console.log(`[deps:snapshot] ${message}`);
}
