import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDeploymentProfileRollout } from "./deployment-profile-rollout.mjs";
import { canonicalJson, sha256 } from "./deploy-unit-provenance.mjs";

function rollout(overrides = {}) {
  const body = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile-rollout",
    profile: { id: "finance-focused", version: 1, sha256: "a".repeat(64) },
    changedFiles: ["packages/finance/server/example.ts"],
    targetUnitIds: ["finance"],
    verificationUnitIds: ["assistant", "finance", "work"],
    fullProfileFanout: false,
    failClosed: false,
    canaryObservationMinutes: 30,
    strategy: "shadow-all-then-atomic-gateway",
    steps: [],
    ...overrides,
  };
  return { ...body, rolloutSha256: sha256(canonicalJson(body)) };
}

test("profile rollout is digest-bound and includes every target in verification", () => {
  assert.equal(normalizeDeploymentProfileRollout(rollout()).targetUnitIds[0], "finance");
  assert.throws(() => normalizeDeploymentProfileRollout(rollout({ verificationUnitIds: ["work"] })), /include every target/);
});

test("profile rollout rejects repeated or malformed target units", () => {
  assert.throws(() => normalizeDeploymentProfileRollout(rollout({ targetUnitIds: ["finance", "finance"] })), /repeats units/);
  assert.throws(() => normalizeDeploymentProfileRollout({ ...rollout(), rolloutSha256: "b".repeat(64) }), /digest drifted/);
});
