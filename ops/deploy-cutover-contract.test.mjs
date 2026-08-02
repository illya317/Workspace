import assert from "node:assert/strict";
import test from "node:test";

import { readDeploySourceContract } from "./deploy/source-contract.mjs";

const deploy = readDeploySourceContract();

function assertOrdered(source, needles) {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle, previous + 1);
    assert.ok(index >= 0, "missing deploy contract fragment: " + needle);
    assert.ok(index > previous, "out-of-order deploy contract fragment: " + needle);
    previous = index;
  }
}

test("completed marker reconciliation runs before release-order checks and preserves current-candidate resume", () => {
  assertOrdered(deploy, [
    "acquire_remote_deploy_lock",
    "reconcile_completed_deploy_markers",
    "verify_release_order",
  ]);
  assert.match(deploy, /all\(value == source for value in marker_sources\)[\s\S]*?print\('CLEAN'\)/);
  assert.match(deploy, /all\(value == os\.environ\['EXPECTED_CANDIDATE'\] for value in marker_sources\)[\s\S]*?print\('RESUME'\)/);
  assert.match(deploy, /marker_action\\" = 'RESUME'[\s\S]*?保留并进入锁内 resume/);
  assertOrdered(deploy, [
    "temporary.replace(path)",
    "release_committed=1",
    "rm -f '$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy'",
    "rm -f '$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'",
  ]);
});

test("current switches atomically and deployed-release is the rollback commit point", () => {
  assert.equal(
    /ln -sfn [^\n]*'\$REMOTE_DIR\/current'/.test(deploy),
    false,
    "current must never use unlink-before-create ln -sfn",
  );
  assert.match(
    deploy,
    /atomic_switch_current\(\)[\s\S]*?ln -s "\\\$current_target" "\\\$current_swap_tmp"[\s\S]*?mv -Tf "\\\$current_swap_tmp" '\$REMOTE_DIR\/current'/,
  );
  assert.match(deploy, /atomic_switch_current \\"\\\$old_release\\"/);
  assert.match(deploy, /atomic_switch_current \\"\\\$release_dir\\"/);
  assertOrdered(deploy, [
    "assert_release_version 'http://127.0.0.1:3000/workspace/api/settings/version' 'public'",
    'atomic_switch_current \\"\\$release_dir\\"',
    "'$REMOTE_RELEASE_RECEIPT_TOOL' write",
    "release_committed=1",
  ]);
  assertOrdered(deploy, [
    "rollback_cutover()",
    "deployed-release 原子记录已绑定当前 candidate",
    "candidate_cleanup_failed=0",
  ]);
});

test("every uncommitted failure removes candidate, and unknown candidate state fences all other writers first", () => {
  const rollbackStart = deploy.indexOf("rollback_cutover()");
  const rollbackEnd = deploy.indexOf("trap rollback_cutover EXIT", rollbackStart);
  const rollback = deploy.slice(rollbackStart, rollbackEnd);
  assertOrdered(rollback, [
    'pm2 delete "\\$cutover_candidate_name"',
    'rollback_candidate_pid=\\$(pm2_pid_or_unavailable "\\$cutover_candidate_name")',
    "candidate_cleanup_failed=1",
    "candidate 无法确认停止；立即隔离 public 与 WeCom",
    "pm2 delete '$PM2_NAME'",
    "pm2 delete '$PM2_WECOM_BOT_NAME'",
    "rollback_public_pid=",
    "rollback_wecom_pid=",
    "pm2 save ||",
  ]);
  assert.match(
    deploy,
    /锁内清理遗留 candidate[\s\S]*?pm2 delete '\$PM2_NAME-candidate'[\s\S]*?candidate writer is still active before release verification[\s\S]*?pm2 save[\s\S]*?if \[ ! -e \\"\\\$maintenance_marker\\" \]/,
  );
});

test("every non-CLEAN marker path and failed CLEAN proof fences all managed writers", () => {
  assert.match(deploy, /marker_action\\" = 'RESUME'[\s\S]*?fence_all_writers[\s\S]*?进入锁内 resume/);
  assert.match(deploy, /marker_action\\" = 'CONFLICT'[\s\S]*?fence_all_writers[\s\S]*?writer 已保持隔离/);
  assert.match(deploy, /marker_action\\" != 'CLEAN'[\s\S]*?fence_all_writers[\s\S]*?action 无效/);
  assert.match(
    deploy,
    /if ! \([\s\S]*?marker reconciliation runtime version[\s\S]*?\); then[\s\S]*?fence_all_writers[\s\S]*?CLEAN marker 无法证明/,
  );
});
