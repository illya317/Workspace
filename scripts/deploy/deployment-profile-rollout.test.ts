import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeploymentProfileRollout } from "./deployment-profile-rollout";

test("a Finance-private release fails early when the profile omits its signed RPC closure", () => {
  assert.throws(
    () => resolveDeploymentProfileRollout("finance-focused", ["packages/finance/server/ledger.ts"]),
    /omits signed internal RPC rollout closure.*use a profile containing the complete closure/,
  );
});

test("the full profile expands a Finance-private release to the complete signed RPC closure", () => {
  const rollout = resolveDeploymentProfileRollout("full", ["packages/finance/server/ledger.ts"]);
  assert.deepEqual(rollout.targetUnitIds, [
    "administration",
    "assistant",
    "capital-securities",
    "external",
    "finance",
    "hr",
    "inventory",
    "library",
    "production",
    "work",
    "workspace-shell",
  ]);
  assert.deepEqual(rollout.verificationUnitIds, [
    "administration",
    "assistant",
    "capital-securities",
    "docs",
    "external",
    "finance",
    "hr",
    "inventory",
    "library",
    "production",
    "work",
    "workspace-shell",
  ]);
  assert.equal(rollout.fullProfileFanout, false);
});

test("a shared Core change fans out to every unit in the selected profile", () => {
  const rollout = resolveDeploymentProfileRollout("full", ["packages/core/ui/PageSurface.tsx"]);
  assert.deepEqual(rollout.targetUnitIds, [
    "administration", "assistant", "capital-securities", "docs", "external", "finance", "hr",
    "inventory", "library", "news", "production", "work", "workspace-shell",
  ]);
  assert.equal(rollout.fullProfileFanout, true);
});

test("documentation-only changes do not create a runtime rollout", () => {
  const rollout = resolveDeploymentProfileRollout("full", ["docs/engineering/ops/deploy-units.md"]);
  assert.deepEqual(rollout.targetUnitIds, []);
  assert.deepEqual(rollout.steps, []);
});
