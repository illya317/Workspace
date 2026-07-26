#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalJson,
  digestFile,
  sha256,
  verifyDeployUnitAttestation,
} from "./deploy-unit-provenance.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`);
  return value;
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function unitFiles(artifactsRoot, unitId) {
  const root = path.join(artifactsRoot, unitId);
  return {
    manifest: path.join(root, `${unitId}-standalone.manifest.json`),
    sbom: path.join(root, `${unitId}.cdx.json`),
    attestation: path.join(root, `${unitId}.provenance.json`),
  };
}

function discoveredArtifactUnits(artifactsRoot) {
  if (!statSync(artifactsRoot).isDirectory()) fail("profile artifacts root must be a directory");
  return readdirSync(artifactsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const file = path.join(artifactsRoot, entry.name, `${entry.name}-standalone.manifest.json`);
      try { return statSync(file).isFile(); } catch { return false; }
    })
    .map((entry) => entry.name)
    .sort();
}

export function createDeploymentProfileRelease({
  profile,
  artifactsRoot,
  trustedPublicKeyPem,
  createdAt = new Date().toISOString(),
}) {
  if (profile?.schemaVersion !== 1 || profile.kind !== "workspace-deployment-profile") {
    fail("deployment profile is invalid");
  }
  requireDigest(profile.profileSha256, "deployment profile digest");
  const expectedProfileDigest = sha256(canonicalJson(Object.fromEntries(
    Object.entries(profile).filter(([key]) => key !== "profileSha256"),
  )));
  if (profile.profileSha256 !== expectedProfileDigest) fail("deployment profile digest drifted");
  if (!Array.isArray(profile.unitIds) || profile.unitIds.length === 0) fail("deployment profile unit set is empty");
  const discovered = discoveredArtifactUnits(artifactsRoot);
  const expected = [...profile.unitIds].sort();
  if (canonicalJson(discovered) !== canonicalJson(expected)) {
    fail(`profile artifact set must be exact: expected ${expected.join(", ")}, received ${discovered.join(", ")}`);
  }

  const units = profile.unitIds.map((unitId) => {
    const files = unitFiles(artifactsRoot, unitId);
    const manifest = readJson(files.manifest, `${unitId} manifest`);
    const sbom = readJson(files.sbom, `${unitId} SBOM`);
    const attestation = readJson(files.attestation, `${unitId} provenance`);
    if (manifest?.unit?.id !== unitId) fail(`${unitId} manifest belongs to another unit`);
    if (manifest.unit.graphSha256 !== profile.graphSha256) fail(`${unitId} artifact uses another deploy graph`);
    if (sbom?.bomFormat !== "CycloneDX" || sbom?.metadata?.properties?.find(
      (property) => property?.name === "workspace:deploy-unit",
    )?.value !== unitId) fail(`${unitId} SBOM is invalid`);
    verifyDeployUnitAttestation({
      attestation,
      manifest,
      manifestSha256: digestFile(files.manifest),
      sbomSha256: digestFile(files.sbom),
      publicKeyPem: trustedPublicKeyPem,
    });
    return {
      unitId,
      source: manifest.source,
      controlPlaneRequirementsSha256: requireDigest(
        manifest.controlPlane?.requirementsSha256,
        `${unitId} control-plane requirements digest`,
      ),
      artifact: {
        sha256: requireDigest(manifest.artifact?.sha256, `${unitId} artifact digest`),
        manifestSha256: digestFile(files.manifest),
        sbomSha256: digestFile(files.sbom),
        provenanceSha256: digestFile(files.attestation),
        provenanceKeyId: requireString(attestation.keyId, `${unitId} provenance key id`),
      },
    };
  });

  const controlPlaneDigests = new Set(units.map((unit) => unit.controlPlaneRequirementsSha256));
  if (controlPlaneDigests.size !== 1) fail("deployment profile artifacts require different control-plane floors");
  for (const unit of units) {
    requireSha(unit.source?.commitSha, `${unit.unitId} source SHA`);
    requireSha(unit.source?.treeSha, `${unit.unitId} source tree`);
  }
  const sourceSetSha256 = sha256(canonicalJson(units.map((unit) => ({ unitId: unit.unitId, source: unit.source }))));
  const body = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile-release",
    profile: { id: profile.id, version: profile.version, sha256: profile.profileSha256 },
    graphSha256: profile.graphSha256,
    sourceSetSha256,
    controlPlaneRequirementsSha256: units[0].controlPlaneRequirementsSha256,
    rollout: profile.rollout,
    units,
    createdAt,
  };
  return { ...body, releaseSetSha256: sha256(canonicalJson(body)) };
}

export function normalizeDeploymentProfileRelease(value) {
  if (value?.schemaVersion !== 1 || value.kind !== "workspace-deployment-profile-release") {
    fail("deployment profile release is invalid");
  }
  requireDigest(value.releaseSetSha256, "profile release-set digest");
  const expected = sha256(canonicalJson(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "releaseSetSha256"),
  )));
  if (value.releaseSetSha256 !== expected) fail("deployment profile release-set digest drifted");
  if (!Array.isArray(value.units) || value.units.length === 0) fail("deployment profile release has no units");
  return value;
}

export function verifyDeploymentProfileRelease({
  release,
  profile,
  artifactsRoot,
  trustedPublicKeyPem,
}) {
  const normalized = normalizeDeploymentProfileRelease(release);
  const rebuilt = createDeploymentProfileRelease({
    profile,
    artifactsRoot,
    trustedPublicKeyPem,
    createdAt: normalized.createdAt,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(normalized)) {
    fail("deployment profile release no longer matches its exact signed artifact set");
  }
  return normalized;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`invalid argument: ${key ?? "<missing>"}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function required(options, key) {
  return requireString(options[key], `--${key.replaceAll("_", "-")}`);
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  if (command === "write") {
    const release = createDeploymentProfileRelease({
      profile: readJson(required(options, "profile"), "deployment profile"),
      artifactsRoot: required(options, "artifacts_root"),
      trustedPublicKeyPem: readFileSync(required(options, "trusted_public_key"), "utf8"),
    });
    writeFileSync(required(options, "output"), `${JSON.stringify(release, null, 2)}\n`, { mode: 0o600 });
    return;
  }
  if (command === "assert") {
    normalizeDeploymentProfileRelease(readJson(required(options, "release"), "deployment profile release"));
    process.stdout.write("MATCH\n");
    return;
  }
  if (command === "verify") {
    verifyDeploymentProfileRelease({
      release: readJson(required(options, "release"), "deployment profile release"),
      profile: readJson(required(options, "profile"), "deployment profile"),
      artifactsRoot: required(options, "artifacts_root"),
      trustedPublicKeyPem: readFileSync(required(options, "trusted_public_key"), "utf8"),
    });
    process.stdout.write("MATCH\n");
    return;
  }
  fail(`unknown command: ${command ?? "<missing>"}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
