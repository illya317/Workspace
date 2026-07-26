import assert from "node:assert/strict";
import test from "node:test";

import { resolveFleetStatus } from "./deploy-fleet-status.mjs";

const profile = {
  kind: "workspace-deployment-profile",
  id: "finance-focused",
  version: 1,
  profileSha256: "a".repeat(64),
  unitIds: ["workspace-shell", "finance"],
  units: ["workspace-shell", "finance"].map((id) => ({ id, runtime: { slo: { availabilityPercent: 99.9 } } })),
};

function activation(unitId, port) {
  return { unitId, deploymentId: `${unitId}-1`, releaseId: `${unitId}-r1`, slot: "blue", port };
}

test("fleet status proves exact profile convergence", () => {
  const status = resolveFleetStatus({
    profile,
    routeMap: {
      kind: "workspace-gateway-route-map",
      generationId: "b".repeat(64),
      stateSetSha256: "c".repeat(64),
      activeUnits: [activation("workspace-shell", 3200), activation("finance", 3201)],
    },
  });
  assert.equal(status.status, "converged");
});

test("fleet status reports both missing and unexpected units", () => {
  const status = resolveFleetStatus({
    profile,
    routeMap: {
      kind: "workspace-gateway-route-map",
      activeUnits: [activation("workspace-shell", 3200), activation("work", 3210)],
    },
  });
  assert.equal(status.status, "drifted");
  assert.deepEqual(status.missingUnitIds, ["finance"]);
  assert.deepEqual(status.extraUnitIds, ["work"]);
});
