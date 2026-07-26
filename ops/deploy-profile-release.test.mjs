import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDeploymentProfileRelease,
  verifyDeploymentProfileRelease,
} from "./deploy-profile-release.mjs";
import { canonicalJson, createDeployUnitAttestation, sha256 } from "./deploy-unit-provenance.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-profile-release-"));
  const unitIds = ["workspace-shell", "finance"];
  const profileBody = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile",
    id: "test",
    version: 1,
    graphSha256: "a".repeat(64),
    unitIds,
    rollout: { strategy: "shadow-all-then-atomic-gateway", requireSignedProvenance: true },
  };
  const profile = { ...profileBody, profileSha256: sha256(canonicalJson(profileBody)) };
  for (const unitId of unitIds) {
    const unitRoot = path.join(root, unitId);
    mkdirSync(unitRoot);
    const manifest = {
      unit: { id: unitId, graphSha256: profile.graphSha256 },
      source: { commitSha: "b".repeat(40), treeSha: "c".repeat(40) },
      artifact: { sha256: (unitId === "finance" ? "d" : "e").repeat(64) },
      controlPlane: { requirementsSha256: "f".repeat(64) },
    };
    const manifestFile = path.join(unitRoot, `${unitId}-standalone.manifest.json`);
    const sbomFile = path.join(unitRoot, `${unitId}.cdx.json`);
    writeFileSync(manifestFile, JSON.stringify(manifest));
    writeFileSync(sbomFile, JSON.stringify({
      bomFormat: "CycloneDX",
      metadata: { properties: [{ name: "workspace:deploy-unit", value: unitId }] },
    }));
    const attestation = createDeployUnitAttestation({
      manifest,
      manifestSha256: sha256(Buffer.from(JSON.stringify(manifest))),
      sbomSha256: sha256(Buffer.from(JSON.stringify({
        bomFormat: "CycloneDX",
        metadata: { properties: [{ name: "workspace:deploy-unit", value: unitId }] },
      }))),
      builderId: "test-builder",
      privateKeyPem,
    });
    writeFileSync(path.join(unitRoot, `${unitId}.provenance.json`), JSON.stringify(attestation));
  }
  return { root, profile };
}

test("profile release requires the exact signed artifact set and remains fully re-verifiable", () => {
  const { root, profile } = fixture();
  const release = createDeploymentProfileRelease({
    profile,
    artifactsRoot: root,
    trustedPublicKeyPem: publicKeyPem,
    createdAt: "2026-07-25T00:00:00.000Z",
  });
  assert.deepEqual(release.units.map((unit) => unit.unitId), profile.unitIds);
  assert.match(release.releaseSetSha256, /^[0-9a-f]{64}$/);
  assert.match(release.sourceSetSha256, /^[0-9a-f]{64}$/);
  assert.equal(verifyDeploymentProfileRelease({
    release,
    profile,
    artifactsRoot: root,
    trustedPublicKeyPem: publicKeyPem,
  }), release);
});

test("profile release rejects missing or extra deploy-unit artifacts", () => {
  const { root, profile } = fixture();
  assert.throws(() => createDeploymentProfileRelease({
    profile: { ...profile, unitIds: ["finance"] },
    artifactsRoot: root,
    trustedPublicKeyPem: publicKeyPem,
  }), /profile digest drifted|artifact set must be exact/);
});
