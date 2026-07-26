import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFleetObservation } from "./deploy-fleet-observation.mjs";
import { canonicalJson, sha256 } from "./deploy-unit-provenance.mjs";

const profileBody = {
  schemaVersion: 1,
  kind: "workspace-deployment-profile",
  id: "test",
  version: 1,
  unitIds: ["finance"],
  units: [{
    id: "finance",
    runtime: { slo: {
      availabilityPercent: 99.9,
      p95LatencyMs: 1500,
      maximumErrorRatePercent: 1,
      canaryObservationMinutes: 15,
      recoveryPointObjectiveMinutes: 5,
    } },
  }],
};
const profile = { ...profileBody, profileSha256: sha256(canonicalJson(profileBody)) };
const releaseBody = {
  schemaVersion: 1,
  kind: "workspace-deployment-profile-release",
  profile: { id: "test", version: 1, sha256: profile.profileSha256 },
  units: [{ unitId: "finance" }],
};
const release = { ...releaseBody, releaseSetSha256: sha256(canonicalJson(releaseBody)) };

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "workspace-deployment-profile-observation",
    releaseSetSha256: release.releaseSetSha256,
    windowStartedAt: "2026-07-25T00:00:00.000Z",
    windowEndedAt: "2026-07-25T00:15:00.000Z",
    evaluatedAt: "2026-07-25T00:15:01.000Z",
    units: [{ unitId: "finance", health: "passing", availabilityPercent: 99.95, p95LatencyMs: 1200, errorRatePercent: 0.2 }],
    disasterRecovery: {
      latestRecoverableBackupAgeMinutes: 4,
      restoreDrillAgeDays: 30,
      controlPlaneReceiptReplicated: true,
      tenantConfigReplicated: true,
    },
    ...overrides,
  };
}

test("fleet observation passes only after SLO and DR evidence", () => {
  const result = evaluateFleetObservation({ profile, release, observation: observation() });
  assert.equal(result.status, "passed");
});

test("fleet observation lists latency, error, window and RPO violations", () => {
  const result = evaluateFleetObservation({
    profile,
    release,
    observation: observation({
      windowEndedAt: "2026-07-25T00:05:00.000Z",
      units: [{ unitId: "finance", health: "passing", availabilityPercent: 99.95, p95LatencyMs: 2000, errorRatePercent: 2 }],
      disasterRecovery: {
        latestRecoverableBackupAgeMinutes: 6,
        restoreDrillAgeDays: 91,
        controlPlaneReceiptReplicated: true,
        tenantConfigReplicated: true,
      },
    }),
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.violations, [
    "finance:error-rate",
    "finance:observation-window",
    "finance:p95-latency",
    "fleet:restore-drill-stale",
    "fleet:rpo",
  ]);
});
