#!/usr/bin/env node

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(message);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function digestFile(file) {
  return sha256(readFileSync(file));
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`);
  return value;
}

function publicKeyIdentity(key) {
  const publicKey = createPublicKey(key);
  const der = publicKey.export({ type: "spki", format: "der" });
  return { publicKey, keyId: `sha256:${sha256(der)}` };
}

export function createDeployUnitSbom({ contract, packageLock, generatedAt = new Date().toISOString() }) {
  if (contract?.kind !== "workspace-deploy-unit-contract") fail("deploy unit contract is invalid");
  if (packageLock?.lockfileVersion !== 3 || !packageLock.packages || typeof packageLock.packages !== "object") {
    fail("package-lock must use lockfileVersion 3");
  }
  const components = Object.entries(packageLock.packages)
    .filter(([location, metadata]) => location && metadata && typeof metadata === "object")
    .map(([location, metadata]) => ({
      type: "library",
      name: metadata.name || location.replace(/^node_modules\//, ""),
      version: metadata.version || "workspace",
      scope: metadata.dev ? "optional" : "required",
      properties: [{ name: "workspace:lock-location", value: location }],
    }))
    .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`));
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:workspace:${contract.id}:${contract.graphSha256}`,
    version: 1,
    metadata: {
      timestamp: generatedAt,
      component: { type: "application", name: `workspace-${contract.id}`, version: contract.graphSha256.slice(0, 16) },
      properties: [
        { name: "workspace:deploy-unit", value: contract.id },
        { name: "workspace:graph-sha256", value: contract.graphSha256 },
        { name: "workspace:package-lock-sha256", value: sha256(canonicalJson(packageLock)) },
      ],
    },
    components,
  };
}

function attestationPayload({ manifest, manifestSha256, sbomSha256, builderId }) {
  return {
    predicateType: "https://workspace.local/attestation/deploy-unit/v1",
    subject: {
      unitId: manifest.unit.id,
      artifactSha256: manifest.artifact.sha256,
      manifestSha256,
      sbomSha256,
    },
    source: manifest.source,
    graphSha256: manifest.unit.graphSha256,
    builderId,
  };
}

export function createDeployUnitAttestation({ manifest, manifestSha256, sbomSha256, builderId, privateKeyPem }) {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") fail("deploy-unit signing key must be Ed25519");
  const { keyId } = publicKeyIdentity(privateKey);
  const payload = attestationPayload({
    manifest,
    manifestSha256: requireDigest(manifestSha256, "manifest digest"),
    sbomSha256: requireDigest(sbomSha256, "SBOM digest"),
    builderId: requireString(builderId, "builder id"),
  });
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-provenance",
    algorithm: "Ed25519",
    keyId,
    payload,
    signature: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64"),
  };
}

export function verifyDeployUnitAttestation({ attestation, manifest, manifestSha256, sbomSha256, publicKeyPem }) {
  if (attestation?.schemaVersion !== 1 || attestation.kind !== "workspace-deploy-unit-provenance"
    || attestation.algorithm !== "Ed25519") fail("deploy-unit provenance attestation is invalid");
  const { publicKey, keyId } = publicKeyIdentity(publicKeyPem);
  if (attestation.keyId !== keyId) fail("deploy-unit provenance key is not trusted");
  const expected = attestationPayload({
    manifest,
    manifestSha256: requireDigest(manifestSha256, "manifest digest"),
    sbomSha256: requireDigest(sbomSha256, "SBOM digest"),
    builderId: requireString(attestation.payload?.builderId, "builder id"),
  });
  if (canonicalJson(attestation.payload) !== canonicalJson(expected)) fail("deploy-unit provenance payload drifted");
  const signature = Buffer.from(requireString(attestation.signature, "provenance signature"), "base64");
  if (!verify(null, Buffer.from(canonicalJson(attestation.payload)), publicKey, signature)) {
    fail("deploy-unit provenance signature is invalid");
  }
  return attestation;
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

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  if (command === "sbom-write") {
    writeJson(required(options, "output"), createDeployUnitSbom({
      contract: JSON.parse(readFileSync(required(options, "contract"), "utf8")),
      packageLock: JSON.parse(readFileSync(required(options, "package_lock"), "utf8")),
    }));
    return;
  }
  const manifestFile = required(options, "manifest");
  const sbomFile = required(options, "sbom");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (command === "attestation-write") {
    writeJson(required(options, "output"), createDeployUnitAttestation({
      manifest,
      manifestSha256: digestFile(manifestFile),
      sbomSha256: digestFile(sbomFile),
      builderId: required(options, "builder_id"),
      privateKeyPem: readFileSync(required(options, "private_key"), "utf8"),
    }));
    return;
  }
  if (command === "attestation-assert") {
    verifyDeployUnitAttestation({
      attestation: JSON.parse(readFileSync(required(options, "attestation"), "utf8")),
      manifest,
      manifestSha256: digestFile(manifestFile),
      sbomSha256: digestFile(sbomFile),
      publicKeyPem: readFileSync(required(options, "public_key"), "utf8"),
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
