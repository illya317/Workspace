import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prepare = readFileSync("ops/prepare-deploy-profile.sh", "utf8");
const client = readFileSync("ops/deploy-profile.sh", "utf8");

test("profile prepare uses one digest-addressed state root and unit prepare mode", () => {
  assert.match(prepare, /deployment-profile-rollout\.mjs assert/);
  assert.match(prepare, /profile-preparations\/\$ROLLOUT_SHA/);
  assert.match(prepare, /deploy-unit\.sh deploy "\$unit_id" prepare/);
});

test("profile client transfers exact promotion inputs and invokes server-side atomic scripts", () => {
  assert.match(client, /DEPLOY_UNIT_TRUSTED_BUILD/);
  assert.match(client, /promote-deploy-profile\.sh/);
  assert.match(client, /rollback-deploy-profile\.sh/);
  assert.match(client, /profile\.json/);
  assert.match(client, /release\.json/);
  assert.match(client, /observation\.json/);
  assert.match(client, /deploy-graph\.json/);
  assert.match(client, /DIGEST_INPUTS=\("\$PROFILE_FILE" "\$RELEASE_FILE" "\$ROLLOUT_FILE" "\$OBSERVATION_FILE" "\$GRAPH_FILE"\)/);
  assert.match(client, /content\.length/);
  const bundleBuild = client.indexOf("deploy-tool-bundle.mjs build");
  const exactSync = client.indexOf('rsync -az --delete-delay -e "$RSYNC_SSH"', bundleBuild);
  const remoteVerify = client.indexOf(
    "node '$REMOTE_TOOL_ROOT/release/control/deploy-tool-bundle.mjs' verify",
    exactSync,
  );
  const rollbackExecution = client.indexOf("'$REMOTE_TOOL_ROOT/rollback-deploy-profile.sh'");
  const promoteExecution = client.indexOf("'$REMOTE_TOOL_ROOT/promote-deploy-profile.sh'");
  assert.ok(bundleBuild >= 0 && exactSync > bundleBuild && remoteVerify > exactSync);
  assert.ok(rollbackExecution > remoteVerify && promoteExecution > remoteVerify);
  assert.match(client, /--profile deploy-unit-tools/);
  assert.doesNotMatch(client, /ops\/\.\/release\//);
  assert.doesNotMatch(client, /node --check '\$REMOTE_TOOL_ROOT\/release\//);
  assert.doesNotMatch(client, /rsync -azR/);
});
