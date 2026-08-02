import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const state = read("../../deploy/state.sh");
const cutover = read("../../deploy/atomic-cutover.sh");
const runLocal = read("../../run-local-release-action.sh");
const releaseReceipt = read("../../release-receipt.mjs");

test("same-application retries distinguish pure no-op from controller activation", () => {
  const branch = state.slice(state.indexOf('if [ "$order_action" = "noop" ]'));
  assert.ok(branch.indexOf("run_healthcheck") < branch.indexOf("activate-controller"));
  assert.match(branch, /Application 与 Controller 均相同[\s\S]*?纯 no-op/);
  assert.match(branch, /Application no-op；仅激活 Controller Ready/);
  assert.match(branch, /不重建、不重启应用/);
  assert.match(branch, /--controller-source '\$RELEASE_CONTROLLER_SOURCE_SHA'/);
  assert.doesNotMatch(branch.slice(0, branch.indexOf('if [ "$order_action" != "deploy" ]')), /pm2|migrate|build_artifact|deploy_remote_artifact/);
});

test("schema-v4 receipt propagation binds controller identity at every canonical write seam", () => {
  assert.match(releaseReceipt, /schemaVersion: 4/);
  assert.match(releaseReceipt, /schema v4 deployed-release controller is required/);
  assert.match(releaseReceipt, /command === "activate-controller"/);
  for (const option of [
    "controller-source", "controller-tree", "controller-control-digest", "controller-receipt-digest",
  ]) assert.match(cutover, new RegExp(`--${option}`));
});

test("local injection cleanup removes only its exact worktree", () => {
  assert.match(runLocal, /cd "\$RELEASE_SOURCE_DIR"[\s\S]*?worktree remove --force "\$injection_worktree"/);
  assert.doesNotMatch(runLocal, /worktree prune/);
});
