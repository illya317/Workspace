#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]));
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digestReceipt = (receipt) => sha256(canonicalJson({ ...receipt, receiptDigest: null }));

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function recordDeployedBaseline({ root, deployAttemptFile, readyFile, now = () => new Date().toISOString() }) {
  const deploy = JSON.parse(fs.readFileSync(deployAttemptFile, "utf8"));
  const ready = JSON.parse(fs.readFileSync(readyFile, "utf8"));
  if (deploy?.schema !== "workspace.deploy-attempt/v1" || deploy?.kind !== "workspace-deploy-attempt"
    || deploy?.status !== "succeeded" || deploy?.exitCode !== 0
    || deploy?.receiptDigest !== digestReceipt(deploy)) {
    throw new Error("successful deploy attempt receipt is invalid");
  }
  if (ready?.kind !== "workspace-ready-artifact" || ready?.status !== "ready"
    || ready?.source?.commitSha !== deploy.source?.commit || ready?.source?.treeId !== deploy.source?.tree
    || ready?.source?.contentDigest !== deploy.source?.contentDigest
    || ready?.target?.id !== deploy.target || ready?.target?.mode !== deploy.targetMode) {
    throw new Error("deploy attempt and Application Ready do not identify the same baseline");
  }
  const unsigned = {
    schemaVersion: 1,
    kind: "workspace-deployed-release-baseline",
    target: { id: deploy.target, mode: deploy.targetMode },
    source: {
      commitSha: deploy.source.commit,
      treeId: deploy.source.tree,
      contentDigest: deploy.source.contentDigest,
    },
    deployAttempt: { id: deploy.attemptId, receiptDigest: deploy.receiptDigest },
    ready: { runId: ready.runId, receiptDigest: sha256(fs.readFileSync(readyFile)) },
    deployedAt: deploy.completedAt,
    recordedAt: now(),
  };
  const receipt = { ...unsigned, receiptDigest: sha256(canonicalJson(unsigned)) };
  atomicJson(path.join(path.resolve(root), deploy.target, deploy.targetMode, "current.json"), receipt);
  return receipt;
}

function parse(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`invalid argument near ${flag}`);
    values.set(flag.slice(2), value);
  }
  return {
    root: values.get("root"),
    deployAttemptFile: values.get("deploy-attempt"),
    readyFile: values.get("ready"),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = recordDeployedBaseline(parse(process.argv.slice(2)));
    process.stdout.write(`deployed baseline recorded: ${receipt.target.id}:${receipt.target.mode} ${receipt.source.commitSha}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
