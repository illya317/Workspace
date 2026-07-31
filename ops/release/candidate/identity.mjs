#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const TREE_PATTERN = /^[0-9a-f]{40}$/;
const CONTENT_PATTERN = /^[0-9a-f]{64}$/;

function git(repositoryRoot, args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding,
    maxBuffer: 200 * 1024 * 1024,
  });
}

export function captureCandidateIdentity({ repositoryRoot, revision = "HEAD" }) {
  if (!repositoryRoot || !path.isAbsolute(repositoryRoot)) {
    throw new Error("repositoryRoot must be absolute");
  }
  const treeId = git(repositoryRoot, ["rev-parse", `${revision}^{tree}`]).trim();
  if (!TREE_PATTERN.test(treeId)) throw new Error("candidate tree id is invalid");
  const treeManifest = git(
    repositoryRoot,
    ["ls-tree", "-r", "-z", "--full-tree", treeId],
    "buffer",
  );
  return {
    schemaVersion: 1,
    kind: "workspace-candidate-content",
    treeId,
    contentDigest: createHash("sha256").update(treeManifest).digest("hex"),
  };
}

export function validateCandidateIdentity(identity, expected = {}) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)
    || identity.schemaVersion !== 1 || identity.kind !== "workspace-candidate-content"
    || !TREE_PATTERN.test(identity.treeId ?? "")
    || !CONTENT_PATTERN.test(identity.contentDigest ?? "")) {
    throw new Error("candidate content identity is invalid");
  }
  if (expected.treeId && identity.treeId !== expected.treeId) {
    throw new Error("candidate tree differs from expected content");
  }
  if (expected.contentDigest && identity.contentDigest !== expected.contentDigest) {
    throw new Error("candidate content digest differs from expected content");
  }
  return identity;
}

function parseArgs(argv) {
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
  const options = parseArgs(argv);
  if (options.command === "capture") {
    const identity = captureCandidateIdentity({
      repositoryRoot: path.resolve(options.repository ?? process.cwd()),
      revision: options.revision ?? "HEAD",
    });
    if (options.output) writeFileSync(path.resolve(options.output), `${JSON.stringify(identity, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(identity)}\n`);
    return identity;
  }
  if (options.command === "verify") {
    if (!options.file) throw new Error("verify requires --file");
    const identity = validateCandidateIdentity(JSON.parse(readFileSync(options.file, "utf8")), {
      treeId: options.tree,
      contentDigest: options.content,
    });
    process.stdout.write(`${JSON.stringify(identity)}\n`);
    return identity;
  }
  throw new Error("usage: identity.mjs capture --repository ROOT --revision REV | verify --file FILE --tree TREE --content DIGEST");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
