import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const promote = readFileSync("ops/promote-deploy-profile.sh", "utf8");
const rollback = readFileSync("ops/rollback-deploy-profile.sh", "utf8");
const sidecar = readFileSync("ops/deploy-unit-sidecar.sh", "utf8");

function assertOrdered(source, fragments) {
  let previous = -1;
  for (const fragment of fragments) {
    const index = source.indexOf(fragment, previous + 1);
    assert.ok(index > previous, `missing or out-of-order fragment: ${fragment}`);
    previous = index;
  }
}

test("profile promotion requires SLO evidence and switches one generated Gateway set", () => {
  assert.match(promote, /--observation-result/);
  assert.match(promote, /gateway-generation\.mjs/);
  assert.match(promote, /switch-deploy-gateway\.sh/);
  assert.match(promote, /exec 9>"\$LOCK_FILE"/);
  assert.match(promote, /deploy-notification\.mjs" profile-write/);
  assert.match(promote, /source "\$SCRIPT_DIR\/deploy-unit-sidecar\.sh"/);
  assert.ok(promote.indexOf('switch-deploy-gateway.sh') < promote.indexOf('deploy-notification.mjs" profile-write'));
  const handoff = promote.slice(promote.indexOf('GENERATION_ID="$(node'));
  assertOrdered(handoff, [
    'workspace_suspend_monolith_wecom_sidecar "$MONOLITH_WECOM_PROCESS_NAME"',
    'workspace_stop_deploy_unit_sidecar assistant "$ASSISTANT_OLD_RELEASE"',
    '"$SCRIPT_DIR/switch-deploy-gateway.sh" --generation "$GATEWAY_ROOT/generations/$GENERATION_ID"',
    'workspace_start_deploy_unit_sidecar',
    'ASSISTANT_HANDOFF_COMMITTED=1',
  ]);
  assert.match(promote, /--generation "\$OLD_GATEWAY_TARGET"/);
  assert.match(promote, /workspace_restore_monolith_wecom_sidecar/);
});

test("profile rollback consumes a digest-bound promotion receipt and rejects stale generations", () => {
  assert.match(rollback, /receipt-assert/);
  assert.match(rollback, /previousGenerationId/);
  assert.match(rollback, /exec 9>"\$LOCK_FILE"/);
  assert.match(rollback, /CURRENT_GENERATION_ID/);
  assert.match(rollback, /PROMOTED_GENERATION_ID/);
  assert.match(rollback, /switch-deploy-gateway\.sh/);
  assert.match(rollback, /source "\$SCRIPT_DIR\/deploy-unit-sidecar\.sh"/);
  const handoff = rollback.slice(rollback.indexOf("trap cleanup_sidecar_transition EXIT"));
  assertOrdered(handoff, [
    'workspace_stop_deploy_unit_sidecar assistant "$CURRENT_ASSISTANT_RELEASE"',
    '"$SCRIPT_DIR/switch-deploy-gateway.sh" --generation "$TARGET"',
    'workspace_start_deploy_unit_sidecar',
    'ASSISTANT_HANDOFF_COMMITTED=1',
  ]);
  assert.match(rollback, /--generation "\$CURRENT_GATEWAY_TARGET"/);
  assert.match(rollback, /workspace_activate_monolith_wecom_sidecar/);
  assert.match(rollback, /workspace_restore_monolith_wecom_sidecar/);
  assert.match(sidecar, /pm2 delete "\$opposite_process"/);
});
