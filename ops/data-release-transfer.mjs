#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RELEASE_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UPLOAD_KIND = "workspace-data-release-upload";

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireReleaseId(value) {
  if (!RELEASE_ID_PATTERN.test(value ?? "")) fail("data release id is invalid");
  return value;
}

function requireRelativePath(value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\")) {
    fail(`${label} must be a non-empty POSIX relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === ".." || normalized.startsWith("../")) {
    fail(`${label} escapes its data release root`);
  }
  return value;
}

function regularFile(root, relativePath) {
  const canonicalRoot = realpathSync(root);
  const candidate = path.resolve(canonicalRoot, relativePath);
  if (!candidate.startsWith(`${canonicalRoot}${path.sep}`)) fail(`data release source escapes its root: ${relativePath}`);
  const stat = lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`data release source must be a regular file: ${relativePath}`);
  const canonical = realpathSync(candidate);
  if (!canonical.startsWith(`${canonicalRoot}${path.sep}`)) fail(`data release source escapes through a link: ${relativePath}`);
  return { canonical, size: stat.size };
}

function readManifest(file, expectedId) {
  const raw = readFileSync(file);
  let manifest;
  try {
    manifest = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    fail(`data release manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (![1, 2].includes(manifest?.schemaVersion)) fail("data release manifest schemaVersion must be 1 or 2");
  const id = requireReleaseId(manifest.id);
  if (expectedId && id !== expectedId) fail(`data release manifest id is ${id}, expected ${expectedId}`);
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) fail(`${id} must declare sources`);
  const seenIds = new Set();
  const seenPaths = new Set();
  const sources = manifest.sources.map((source) => {
    if (typeof source?.id !== "string" || !source.id) fail(`${id} has a source without an id`);
    if (seenIds.has(source.id)) fail(`${id} repeats source id ${source.id}`);
    seenIds.add(source.id);
    const stagedPath = requireRelativePath(source.stagedPath, `${id}.${source.id}.stagedPath`);
    if (seenPaths.has(stagedPath)) fail(`${id} repeats staged path ${stagedPath}`);
    seenPaths.add(stagedPath);
    if (!SHA256_PATTERN.test(source.sha256 ?? "")) fail(`${id}.${source.id}.sha256 is invalid`);
    return { id: source.id, stagedPath, sha256: source.sha256 };
  }).sort((left, right) => left.stagedPath.localeCompare(right.stagedPath));
  return { id, manifest, raw, sources };
}

function inspectBundle({ manifestFile, sourceRoot, expectedId }) {
  const parsed = readManifest(manifestFile, expectedId);
  const sources = parsed.sources.map((source) => {
    const file = regularFile(sourceRoot, source.stagedPath);
    const actualSha256 = sha256(readFileSync(file.canonical));
    if (actualSha256 !== source.sha256) fail(`${parsed.id}.${source.id} source sha256 differs from its manifest`);
    return { ...source, size: file.size };
  });
  const manifestSha256 = sha256(parsed.raw);
  const payloadDigest = sha256(Buffer.from([
    `manifest\0${manifestSha256}\n`,
    ...sources.map((source) => `${source.id}\0${source.stagedPath}\0${source.size}\0${source.sha256}\n`),
  ].join("")));
  return {
    schemaVersion: 1,
    kind: UPLOAD_KIND,
    releaseId: parsed.id,
    manifestSchemaVersion: parsed.manifest.schemaVersion,
    manifestSha256,
    payloadDigest,
    files: sources.map(({ stagedPath, size, sha256: digest }) => ({ path: stagedPath, size, sha256: digest })),
  };
}

export function inspectPrivateDataRelease({ configRoot, id }) {
  if (!path.isAbsolute(configRoot)) fail("WORKSPACE_CONFIG_DIR must be absolute");
  const manifestFile = path.join(configRoot, "data-release-manifests", `${id}.json`);
  const sourceRoot = path.join(configRoot, "data-release-sources", id);
  return inspectBundle({ manifestFile, sourceRoot, expectedId: id });
}

export function inspectStagedDataRelease({ bundleRoot, id }) {
  return inspectBundle({
    manifestFile: path.join(bundleRoot, "manifest.json"),
    sourceRoot: path.join(bundleRoot, "sources"),
    expectedId: id,
  });
}

function writeUploadReceipt(file, descriptor, sourceSha) {
  const receipt = {
    schemaVersion: 1,
    kind: UPLOAD_KIND,
    releaseId: descriptor.releaseId,
    payloadDigest: descriptor.payloadDigest,
    manifestSha256: descriptor.manifestSha256,
    uploadedAt: new Date().toISOString(),
    sourceCommit: sourceSha && sourceSha !== "none" ? sourceSha : null,
  };
  const resolved = path.resolve(file);
  mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.tmp-${process.pid}-${randomUUID()}`);
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, resolved);
  chmodSync(resolved, 0o600);
  return receipt;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) fail(`invalid argument: ${key ?? "<missing>"}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return { command, options };
}

function required(options, key) {
  if (!options[key]) fail(`--${key.replaceAll("_", "-")} is required`);
  return options[key];
}

export function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  let descriptor;
  if (command === "inspect-private") {
    descriptor = inspectPrivateDataRelease({ configRoot: path.resolve(required(options, "config_root")), id: requireReleaseId(required(options, "id")) });
  } else if (command === "verify-staged") {
    descriptor = inspectStagedDataRelease({ bundleRoot: path.resolve(required(options, "bundle_root")), id: requireReleaseId(required(options, "id")) });
    const expected = required(options, "payload_digest");
    if (descriptor.payloadDigest !== expected) fail(`data release payload digest is ${descriptor.payloadDigest}, expected ${expected}`);
  } else if (command === "write-receipt") {
    descriptor = inspectStagedDataRelease({ bundleRoot: path.resolve(required(options, "bundle_root")), id: requireReleaseId(required(options, "id")) });
    const expected = required(options, "payload_digest");
    if (descriptor.payloadDigest !== expected) fail(`data release payload digest is ${descriptor.payloadDigest}, expected ${expected}`);
    process.stdout.write(`${JSON.stringify(writeUploadReceipt(required(options, "output"), descriptor, options.source_sha), null, 2)}\n`);
    return;
  } else {
    fail(`unknown command: ${command ?? "<missing>"}`);
  }
  process.stdout.write(`${JSON.stringify(descriptor, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
