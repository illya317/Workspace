#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]));
}

const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digestFile = (file) => sha256(fs.readFileSync(file));

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function assertCandidate(options) {
  if (!SHA.test(options.source ?? "") || !SHA.test(options.tree ?? "") || !DIGEST.test(options.content ?? "")) {
    throw new Error("candidate source, tree, and content identities are invalid");
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: options.repository, encoding: "utf8" });
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: options.repository, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--short"], { cwd: options.repository, encoding: "utf8" });
  if (head.status !== 0 || tree.status !== 0 || status.status !== 0
    || head.stdout.trim() !== options.source || tree.stdout.trim() !== options.tree || status.stdout.trim()) {
    throw new Error("candidate source snapshot requires the exact clean frozen worktree");
  }
}

export function validateCandidateSourceSnapshot(receipt, options) {
  const snapshot = path.resolve(options.snapshot);
  if (receipt?.schemaVersion !== 1 || receipt?.kind !== "workspace-candidate-source-snapshot"
    || receipt.source?.commitSha !== options.source || receipt.source?.treeId !== options.tree
    || receipt.source?.contentDigest !== options.content || receipt.snapshot?.path !== ".cache/source-code-analysis/snapshot.json"
    || !DIGEST.test(receipt.snapshot?.sourceDigest ?? "") || !DIGEST.test(receipt.snapshot?.sha256 ?? "")
    || receipt.snapshot.sha256 !== digestFile(snapshot) || !Number.isFinite(Date.parse(receipt.createdAt ?? ""))) {
    throw new Error("candidate source snapshot receipt does not match the exact candidate and snapshot");
  }
  const { receiptDigest, ...unsigned } = receipt;
  if (!DIGEST.test(receiptDigest ?? "") || receiptDigest !== sha256(canonicalJson(unsigned))) {
    throw new Error("candidate source snapshot receipt digest is invalid");
  }
  const parsed = JSON.parse(fs.readFileSync(snapshot, "utf8"));
  if (parsed.sourceDigest !== receipt.snapshot.sourceDigest) {
    throw new Error("candidate source snapshot content is invalid");
  }
  return receipt;
}

export function createCandidateSourceSnapshot(options) {
  assertCandidate(options);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/arch/source-code-analysis/cli.ts", "--check", "--write", `--output=${options.snapshot}`],
    { cwd: options.repository, stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("candidate source snapshot generation failed");
  const parsed = JSON.parse(fs.readFileSync(options.snapshot, "utf8"));
  if (!DIGEST.test(parsed.sourceDigest ?? "")) throw new Error("candidate source snapshot sourceDigest is invalid");
  const unsigned = {
    schemaVersion: 1,
    kind: "workspace-candidate-source-snapshot",
    source: { commitSha: options.source, treeId: options.tree, contentDigest: options.content },
    snapshot: {
      path: ".cache/source-code-analysis/snapshot.json",
      sourceDigest: parsed.sourceDigest,
      sha256: digestFile(options.snapshot),
    },
    createdAt: new Date().toISOString(),
  };
  const receipt = { ...unsigned, receiptDigest: sha256(canonicalJson(unsigned)) };
  atomicJson(options.output, receipt);
  return receipt;
}

export function ensureCandidateSourceSnapshot(options) {
  if (options.output && options.source && options.tree && options.content) {
    const receipt = JSON.parse(fs.readFileSync(options.output, "utf8"));
    validateCandidateSourceSnapshot(receipt, options);
    process.stdout.write("candidate source snapshot: exact receipt matched\n");
    return receipt;
  }
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/arch/source-code-analysis/cli.ts", "--write", `--output=${options.snapshot}`],
    { cwd: options.repository, stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error("source snapshot generation failed");
  return null;
}

function parse(argv, environment = process.env) {
  const [command, ...tokens] = argv;
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`invalid argument near ${flag}`);
    values.set(flag.slice(2), value);
  }
  const repository = path.resolve(values.get("repository") ?? process.cwd());
  return {
    command,
    repository,
    snapshot: path.resolve(repository, values.get("snapshot") ?? ".cache/source-code-analysis/snapshot.json"),
    output: values.get("output")
      ? path.resolve(values.get("output"))
      : environment.RELEASE_SOURCE_SNAPSHOT_RECEIPT_FILE
        ? path.resolve(environment.RELEASE_SOURCE_SNAPSHOT_RECEIPT_FILE)
        : undefined,
    source: values.get("source") ?? environment.RELEASE_SOURCE_SHA,
    tree: values.get("tree") ?? environment.RELEASE_SOURCE_TREE,
    content: values.get("content") ?? environment.RELEASE_CONTENT_DIGEST,
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.command === "create") return createCandidateSourceSnapshot(options);
  if (options.command === "verify") {
    const receipt = JSON.parse(fs.readFileSync(options.output, "utf8"));
    return validateCandidateSourceSnapshot(receipt, options);
  }
  if (options.command === "ensure") return ensureCandidateSourceSnapshot(options);
  throw new Error("command must be create, verify, or ensure");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
