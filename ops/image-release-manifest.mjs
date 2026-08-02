#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const HEX_DIGEST = /^[0-9a-f]{64}$/;

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
    : value;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digestFile = (file) => sha256(readFileSync(file));

function fail(message) { throw new Error(message); }
function requireValue(options, key) {
  const value = options[key];
  if (!value) fail(`--${key.replaceAll("_", "-")} is required`);
  return value;
}

function parse(argv) {
  const command = argv.shift();
  const options = {};
  while (argv.length) {
    const key = argv.shift();
    const value = argv.shift();
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) fail(`invalid argument near ${key ?? "<empty>"}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return { command, options };
}

function migrationHead() {
  return execFileSync("find", ["prisma/migrations", "-mindepth", "1", "-maxdepth", "1", "-type", "d", "-print"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean).sort().at(-1)?.split("/").at(-1) ?? "none";
}

export function normalizeImageRelease(value) {
  if (value?.schemaVersion !== 1 || value?.kind !== "workspace-oci-release") fail("release.json schema is invalid");
  if (!SHA.test(value.source?.commitSha ?? "") || !SHA.test(value.source?.treeSha ?? "") || !HEX_DIGEST.test(value.source?.contentDigest ?? "")) {
    fail("release source identity is invalid");
  }
  if (typeof value.image?.ref !== "string" || !value.image.ref || value.image.ref.includes("@")
    || !DIGEST.test(value.image?.digest ?? "") || value.image?.platform !== "linux/amd64") {
    fail("release image identity must be an immutable linux/amd64 digest");
  }
  if (!HEX_DIGEST.test(value.artifact?.sha256 ?? "") || !HEX_DIGEST.test(value.artifact?.manifestSha256 ?? "")
    || !HEX_DIGEST.test(value.migration?.setSha256 ?? "") || typeof value.migration?.head !== "string") {
    fail("release artifact or migration identity is invalid");
  }
  if (value.build?.provider !== "github-actions" || value.build?.requiredCheck !== "CI / required"
    || value.build?.requiredConclusion !== "success" || !/^\d+$/.test(String(value.build?.runId ?? ""))
    || !/^\d+$/.test(String(value.build?.runAttempt ?? "")) || !Number.isFinite(Date.parse(value.build?.createdAt ?? ""))) {
    fail("release GitHub build identity is invalid");
  }
  const { releaseDigest, ...unsigned } = value;
  if (!HEX_DIGEST.test(releaseDigest ?? "") || releaseDigest !== sha256(JSON.stringify(canonical(unsigned)))) {
    fail("release.json digest is invalid");
  }
  return value;
}

export function createImageRelease(options) {
  const artifactManifestFile = resolve(requireValue(options, "artifact_manifest"));
  const artifactFile = resolve(requireValue(options, "artifact"));
  const artifactManifest = JSON.parse(readFileSync(artifactManifestFile, "utf8"));
  if (artifactManifest?.schemaVersion !== 2
    || !SHA.test(artifactManifest.source?.commitSha ?? "")
    || !SHA.test(artifactManifest.source?.treeSha ?? "")
    || !HEX_DIGEST.test(artifactManifest.source?.contentDigest ?? "")
    || artifactManifest.artifact?.sha256 !== digestFile(artifactFile)
    || !HEX_DIGEST.test(artifactManifest.inputs?.migrationSetSha256 ?? "")) {
    fail("standalone artifact manifest is invalid");
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  if (head !== artifactManifest.source.commitSha || tree !== artifactManifest.source.treeSha) fail("Git checkout differs from built artifact");
  const unsigned = {
    schemaVersion: 1,
    kind: "workspace-oci-release",
    source: artifactManifest.source,
    image: {
      ref: requireValue(options, "image_ref"),
      digest: requireValue(options, "image_digest"),
      platform: "linux/amd64",
    },
    artifact: {
      sha256: artifactManifest.artifact.sha256,
      manifestSha256: digestFile(artifactManifestFile),
    },
    migration: {
      head: migrationHead(),
      setSha256: artifactManifest.inputs.migrationSetSha256,
    },
    build: {
      provider: "github-actions",
      requiredCheck: "CI / required",
      requiredConclusion: "success",
      runId: requireValue(options, "github_run_id"),
      runAttempt: requireValue(options, "github_run_attempt"),
      createdAt: artifactManifest.build?.createdAt ?? new Date().toISOString(),
    },
  };
  const value = { ...unsigned, releaseDigest: sha256(JSON.stringify(canonical(unsigned))) };
  normalizeImageRelease(value);
  writeFileSync(resolve(requireValue(options, "output")), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  return value;
}

export function verifyImageRelease(options) {
  const value = normalizeImageRelease(JSON.parse(readFileSync(resolve(requireValue(options, "file")), "utf8")));
  const expected = {
    source_sha: value.source.commitSha,
    source_tree: value.source.treeSha,
    image_ref: value.image.ref,
    image_digest: value.image.digest,
  };
  for (const [key, actual] of Object.entries(expected)) {
    if (options[key] && options[key] !== actual) fail(`${key} does not match release.json`);
  }
  process.stdout.write(`${JSON.stringify(value)}\n`);
  return value;
}

export function main(argv = process.argv.slice(2)) {
  const { command, options } = parse(argv);
  if (command === "create") return createImageRelease(options);
  if (command === "verify") return verifyImageRelease(options);
  fail("usage: image-release-manifest.mjs create|verify ...");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
