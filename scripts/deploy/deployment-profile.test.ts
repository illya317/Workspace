import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeploymentProfile } from "./deployment-profile";
import type { DeploymentProfileSpec } from "./deployment-profile-spec";

test("supported profiles are exact, buildable and capacity-bounded", () => {
  const full = resolveDeploymentProfile("full");
  const finance = resolveDeploymentProfile("finance-focused");
  assert.equal(full.unitIds.length, 12);
  assert.deepEqual(finance.unitIds, [
    "workspace-shell", "finance", "hr", "work", "library", "docs", "assistant",
    "capital-securities", "administration",
  ]);
  assert.ok(finance.capacity.blueGreenApplicationConnections <= 100);
  assert.ok(finance.units.every((unit) => unit.maturity === "candidate" || unit.maturity === "active"));
  assert.deepEqual(finance.units.find((unit) => unit.id === "finance")?.moduleLabels, ["财务管理"]);
});

test("profiles cannot omit a required runtime dependency", () => {
  const invalid: DeploymentProfileSpec = {
    id: "invalid-finance",
    version: 1,
    label: "invalid",
    unitIds: ["workspace-shell", "finance"],
    rollout: {
      strategy: "shadow-all-then-atomic-gateway",
      automaticRollback: true,
      requireSameSourceTree: false,
      requireSignedProvenance: true,
    },
  };
  assert.throws(
    () => resolveDeploymentProfile("invalid-finance", { specs: [invalid] }),
    /omits required runtime dependencies: workspace-shell->work, finance->work/,
  );
});

test("arbitrary or unknown profile combinations are rejected", () => {
  assert.throws(() => resolveDeploymentProfile("finance-plus-random"), /Unknown deployment profile/);
});
