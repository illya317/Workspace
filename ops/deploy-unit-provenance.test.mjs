import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createDeployUnitAttestation,
  createDeployUnitSbom,
  verifyDeployUnitAttestation,
} from "./deploy-unit-provenance.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

const manifest = {
  unit: { id: "finance", graphSha256: "a".repeat(64) },
  artifact: { sha256: "b".repeat(64) },
  source: { commitSha: "c".repeat(40), treeSha: "d".repeat(40) },
};

test("SBOM is deterministic apart from its explicit timestamp", () => {
  const input = {
    contract: { kind: "workspace-deploy-unit-contract", id: "finance", graphSha256: "a".repeat(64) },
    packageLock: { lockfileVersion: 3, packages: { "node_modules/zod": { name: "zod", version: "4.0.0" } } },
    generatedAt: "2026-07-25T00:00:00.000Z",
  };
  assert.deepEqual(createDeployUnitSbom(input), createDeployUnitSbom(input));
});

test("Ed25519 provenance binds unit artifact, manifest, SBOM and builder", () => {
  const attestation = createDeployUnitAttestation({
    manifest,
    manifestSha256: "e".repeat(64),
    sbomSha256: "f".repeat(64),
    builderId: "cnb:workspace-unit-builder@sha256:1234",
    privateKeyPem,
  });
  assert.equal(verifyDeployUnitAttestation({
    attestation,
    manifest,
    manifestSha256: "e".repeat(64),
    sbomSha256: "f".repeat(64),
    publicKeyPem,
  }), attestation);
  assert.throws(() => verifyDeployUnitAttestation({
    attestation,
    manifest,
    manifestSha256: "0".repeat(64),
    sbomSha256: "f".repeat(64),
    publicKeyPem,
  }), /payload drifted/);
});
