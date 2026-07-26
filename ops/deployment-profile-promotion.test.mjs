import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeploymentProfilePromotion,
  createDeploymentProfilePromotionReceipt,
  normalizeDeploymentProfilePromotionReceipt,
} from "./deployment-profile-promotion.mjs";
import { canonicalJson, sha256 } from "./deploy-unit-provenance.mjs";

const financeArtifact = { sha256: "a".repeat(64), manifestSha256: "b".repeat(64) };
const shellArtifact = { sha256: "c".repeat(64), manifestSha256: "d".repeat(64) };
const graph = { units: [{ id: "workspace-shell" }, { id: "finance" }] };
const profileBody = { graphSha256: sha256(canonicalJson(graph)), unitIds: ["workspace-shell", "finance"] };
const profile = { ...profileBody, profileSha256: sha256(canonicalJson(profileBody)) };
const releaseBody = {
  schemaVersion: 1,
  kind: "workspace-deployment-profile-release",
  profile: { id: "test", version: 1, sha256: profile.profileSha256 },
  units: [
    { unitId: "workspace-shell", artifact: shellArtifact },
    { unitId: "finance", artifact: financeArtifact },
  ],
};
const release = { ...releaseBody, releaseSetSha256: sha256(canonicalJson(releaseBody)) };
const rolloutBody = {
  profile: { sha256: profile.profileSha256 },
  targetUnitIds: ["finance"],
};
const rollout = { ...rolloutBody, rolloutSha256: sha256(canonicalJson(rolloutBody)) };
const observationResult = { status: "passed", releaseSetSha256: release.releaseSetSha256, resultSha256: "1".repeat(64) };

test("incremental promotion changes only its rollout targets but verifies the exact fleet set", () => {
  const promotion = createDeploymentProfilePromotion({
    graph,
    profile,
    release,
    rollout,
    observationResult,
    currentRouteMap: { generationId: "2".repeat(64), activeUnits: [{ unitId: "workspace-shell", artifact: shellArtifact }] },
    proposedStates: [{ unitId: "finance", active: { artifact: financeArtifact } }],
    proposedStateFiles: { finance: "/srv/workspace/proposed/finance.json" },
    promotedAt: "2026-07-25T00:00:00.000Z",
  });
  assert.deepEqual(promotion.targetUnitIds, ["finance"]);
  assert.equal(promotion.previousGenerationId, "2".repeat(64));
  const receipt = createDeploymentProfilePromotionReceipt(promotion, "3".repeat(64), "2026-07-25T00:01:00.000Z");
  assert.equal(normalizeDeploymentProfilePromotionReceipt(receipt), receipt);
});

test("promotion rejects a proposed artifact outside the tested release set", () => {
  assert.throws(() => createDeploymentProfilePromotion({
    graph,
    profile,
    release,
    rollout,
    observationResult,
    currentRouteMap: { activeUnits: [{ unitId: "workspace-shell", artifact: shellArtifact }] },
    proposedStates: [{ unitId: "finance", active: { artifact: { ...financeArtifact, sha256: "0".repeat(64) } } }],
    proposedStateFiles: { finance: "/srv/workspace/proposed/finance.json" },
  }), /does not match the exact profile release set/);
});

test("promotion rejects a deploy graph outside the signed profile digest", () => {
  assert.throws(() => createDeploymentProfilePromotion({
    graph: { units: [] },
    profile,
    release,
    rollout,
    observationResult,
    currentRouteMap: { activeUnits: [{ unitId: "workspace-shell", artifact: shellArtifact }] },
    proposedStates: [{ unitId: "finance", active: { artifact: financeArtifact } }],
    proposedStateFiles: { finance: "/srv/workspace/proposed/finance.json" },
  }), /profile graph digest drifted/);
});
