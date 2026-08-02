import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const build = readFileSync("ops/build-deploy-unit-artifact.sh", "utf8");
const client = readFileSync("ops/deploy-unit.sh", "utf8");
const apply = readFileSync("ops/apply-deploy-unit.sh", "utf8");
const unitPreflight = readFileSync("ops/release/deploy/unit-preflight.sh", "utf8");
const unitLockQualification = readFileSync("ops/release/deploy/unit-lock-qualification.sh", "utf8");
const sidecar = readFileSync("ops/deploy-unit-sidecar.sh", "utf8");
const gateway = readFileSync("ops/switch-deploy-gateway.sh", "utf8");

test("unit builder uses governed typecheck and one exact Linux standalone artifact", () => {
  assert.match(build, /ALLOW_NON_LINUX_UNIT_BUILD/);
  assert.match(build, /git diff --quiet --ignore-submodules/);
  assert.match(build, /git ls-files --others --exclude-standard/);
  assert.match(build, /npm run typecheck:scope -- "\$scope"/);
  assert.match(build, /NEXT_DEPLOYMENT_ID="\$DEPLOYMENT_ID"/);
  assert.match(build, /NEXT_PUBLIC_DEPLOY_UNIT_ID="\$UNIT_ID"/);
  assert.match(build, /NEXT_PUBLIC_DEPLOY_UNIT_NAVIGATION="\$NAVIGATION_MANIFEST"/);
  assert.match(build, /render-deploy-navigation-manifest\.ts/);
  assert.match(build, /\.\/node_modules\/\.bin\/next build "\$APP_ROOT"/);
  assert.match(build, /NEXT_BUILD_ID_FILE="\$BUILD_DIRECTORY\/BUILD_ID"/);
  assert.match(build, /--build-id "\$NEXT_BUILD_ID"/);
  assert.match(build, /--deployment-id "\$DEPLOYMENT_ID"/);
  assert.match(build, /release\/candidate\/source-snapshot\.mjs ensure/);
  assert.match(build, /next_compiler_cache_unit prepare/);
  assert.match(build, /next_compiler_cache_unit store/);
  assert.match(build, /禁止组装 deploy-unit artifact/);
  assert.doesNotMatch(build, /source-code-analysis:snapshot:optional/);
  assert.match(build, /\.workspace\/source-code-analysis\/snapshot\.json/);
  assert.match(build, /runtime-tree-permissions\.mjs normalize --root "\$STANDALONE_ROOT"/);
  assert.match(build, /tar -C "\$STANDALONE_ROOT" -czf "\$ARTIFACT_FILE"/);
  assert.match(build, /control-plane-requirements\.mjs write/);
  assert.match(build, /assistant-runtime\.mjs bundle/);
  assert.match(build, /Assistant sharp runtime is incomplete/);
  assert.match(build, /assistant-runtime\.mjs assert/);
  assert.match(build, /artifact-assert/);
  assert.doesNotMatch(build, /\btsc\b/);
  assert.ok(build.indexOf('npm run typecheck:scope -- "$scope"') < build.indexOf('./node_modules/.bin/next build "$APP_ROOT"'));
});

test("unit builder makes only the trusted release dependency link portable", () => {
  assert.match(build, /\[ "\$\{PROJECT_ROOT##\*\/\}" = "release" \] \|\| return 0/);
  assert.match(build, /\[ -L "\$PROJECT_ROOT\/node_modules" \] \|\| return 0/);
  assert.match(build, /source_link_target" != "\$trusted_node_modules"/);
  assert.match(build, /standalone release\/node_modules 包含任意依赖链接/);
  assert.match(build, /ln -s "\.\.\/source\/node_modules" "\$temporary_link"/);
  assert.match(build, /mv -Tf "\$temporary_link" "\$packaged_release_node_modules"/);
  assert.match(build, /standalone 禁止 absolute symlink/);
  assert.doesNotMatch(build, /rm[^\n]*packaged_release_node_modules/);
});

test("client deploy accepts only trusted artifacts while rollback remains an explicit operator action", () => {
  assert.doesNotMatch(client.slice(0, client.indexOf("PROJECT_ROOT")), /^set -e/m);
  assert.match(client, /set -uo pipefail/);
  assert.match(client, /DEPLOY_UNIT_TRUSTED_BUILD/);
  assert.match(client, /artifact-assert/);
  assert.match(client, /graph-assert/);
  assert.match(client, /apply-deploy-unit\.sh' rollback/);
  assert.match(client, /apply-deploy-unit\.sh' deploy/);
  assert.match(client, /shadow\|prepare\|activate/);
  assert.match(client, /DEPLOY_PROFILE_PREPARED_STATE_ROOT/);
  assert.doesNotMatch(readFileSync("ops/deploy-notification.mjs", "utf8"), /^import .*cnb-build-timing-summary/m);
  assert.match(client, /WORKSPACE_MONOLITH_WECOM_PROCESS_NAME/);
  const bundleBuild = client.indexOf("deploy-tool-bundle.mjs build");
  const exactSync = client.indexOf('rsync -az --delete-delay -e "$RSYNC_SSH"', bundleBuild);
  const remoteVerify = client.indexOf(
    "node '$REMOTE_TOOL_ROOT/release/control/deploy-tool-bundle.mjs' verify",
    exactSync,
  );
  const firstToolExecution = client.indexOf("'$REMOTE_TOOL_ROOT/apply-deploy-unit.sh' rollback");
  assert.ok(bundleBuild >= 0 && exactSync > bundleBuild && remoteVerify > exactSync);
  assert.ok(firstToolExecution > remoteVerify);
  assert.match(client, /--profile deploy-unit-tools/);
  const artifactPreflight = client.indexOf("artifact-assert");
  const sharedLock = client.indexOf("acquire_remote_deploy_lock", artifactPreflight);
  const remoteToolWrite = client.indexOf("mkdir -p '$REMOTE_TOOL_ROOT'", sharedLock);
  const remoteStagingWrite = client.indexOf("mkdir -p '$REMOTE_STAGING'", sharedLock);
  assert.ok(artifactPreflight >= 0 && sharedLock > artifactPreflight);
  assert.ok(remoteToolWrite > sharedLock && remoteStagingWrite > sharedLock);
  assert.doesNotMatch(client.slice(sharedLock), /sync-tenant-config\.sh --source-sha/);
  assert.match(client.slice(0, sharedLock), /tenant-config\.production-baseline/);
  assert.match(client, /DEPLOY_LOCK_TOKEN='\$REMOTE_DEPLOY_LOCK_TOKEN'/);
  assert.match(client, /install -o root -g root -m 0755[\s\S]*?production-runtime-pm2\.sh[\s\S]*?WORKSPACE_RUNTIME_PM2_RUNNER/);
  assert.match(apply, /runtime_pm2\(\)[\s\S]*?runner_environment=\(WORKSPACE_RUNTIME_PM2_TARGET=unit\)[\s\S]*?sudo -n -- env "\$\{runner_environment\[@\]\}"/);
  assert.match(apply, /runtime_pm2 start "\$release_dir\/\$server_entry"/);
  assert.doesNotMatch(apply, /load_runtime_environment/);
  assert.match(unitLockQualification, /apply-deploy-unit 只能消费已获取的共享 deploy\.lock/);
  assert.match(apply, /qualify_apply_deploy_unit_lock "\$CONFIG_ROOT" "\$LOCK_FILE" "\$LOCK_OWNER_FILE"/);
  assert.ok(apply.indexOf("qualify_apply_deploy_unit_lock") < apply.indexOf('mkdir -p "$CONFIG_ROOT"'));
  assert.doesNotMatch(client, /ops\/\.\/release\//);
  assert.doesNotMatch(client, /node --check '\$REMOTE_TOOL_ROOT\/release\//);
  assert.doesNotMatch(client, /rsync -azR/);
  assert.ok(client.indexOf("DEPLOY_UNIT_TRUSTED_BUILD") < bundleBuild);
});

test("unit deploy aggregates zero-write diagnostics and crosses one lock-held mutation barrier", () => {
  assert.match(client, /preflight_failed=\(\)/);
  assert.match(client, /preflight_blocked=\(\)/);
  assert.match(client, /deploy-tool-bundle\.build/);
  assert.match(client, /artifact\.assert/);
  assert.match(client, /gateway\.graph-assert/);
  assert.match(client, /tenant-config\.dry-run/);
  assert.match(client, /runtime\.remote-contract/);
  assert.match(client, /production\.semantic-snapshot/);
  assert.match(unitPreflight, /unit_preflight_record_receipts/);
  assert.match(client, /unit_preflight_verify_ready/);
  assert.match(client, /Unit Deploy Preflight 汇总/);
  const summary = client.indexOf("Unit Deploy Preflight 汇总");
  const record = client.indexOf("unit_preflight_finalize_evidence");
  const verifyReady = client.indexOf("unit_preflight_verify_ready", record);
  const lock = client.indexOf("if ! acquire_remote_deploy_lock", summary);
  const lockedSnapshot = client.indexOf('capture_unit_production_snapshot "$DEPLOY_PREFLIGHT_LOCKED_SNAPSHOT_FILE"', lock);
  const compare = client.indexOf('unit-preflight.mjs" snapshot-compare', lockedSnapshot);
  const marker = client.indexOf("# workspace-errexit-role: mutation-barrier", compare);
  const errexit = client.indexOf("set " + "-e", marker);
  assert.ok(summary > 0 && record < summary && verifyReady > summary && lock > verifyReady);
  assert.ok(lockedSnapshot > lock && compare > lockedSnapshot);
  assert.ok(marker > compare && errexit > marker);
  assert.doesNotMatch(client.slice(marker), /sync-tenant-config\.sh --source-sha/);
  assert.doesNotMatch(client.slice(0, marker), /mkdir -p '\$REMOTE_TOOL_ROOT'|mkdir -p '\$REMOTE_STAGING'/);
  assert.match(client, /set -o errexit[\s\S]*?exec 9>>'\$lock_file'/);
});

test("unit deploy reports all independent input failures before acquiring the production lock", () => {
  const result = spawnSync("bash", ["ops/deploy-unit.sh", "rollback", "invalid!"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unit Deploy Preflight 汇总: failed=[1-9][0-9]* blocked=[1-9][0-9]*; production mutation=0/);
  assert.match(result.stderr, /failed: input\.unit-id/);
  assert.match(result.stderr, /failed: input\.SERVER/);
  assert.match(result.stderr, /failed: input\.deploy-key/);
  assert.match(result.stderr, /blocked: transport\.connect/);
  assert.doesNotMatch(result.stderr, /Unit deploy 未获取 shared deploy\.lock/);
});

test("server apply checks control plane before PM2 and commits Gateway only after health receipt", () => {
  const deployBody = apply.slice(apply.indexOf("deploy_unit()"), apply.indexOf("rollback_unit()"));
  const controlPlane = deployBody.indexOf("control-plane-assert");
  const runtimeStart = deployBody.indexOf("start_release");
  const receipt = deployBody.indexOf("receipt-write");
  const state = deployBody.indexOf("state-promote");
  const gatewaySwitch = deployBody.indexOf("switch_gateway \"$generation_id\"");
  assert.ok(controlPlane > 0 && controlPlane < runtimeStart);
  assert.ok(runtimeStart < receipt && receipt < state && state < gatewaySwitch);
  assert.match(apply, /state-rollback/);
  assert.match(apply, /safe_extract_artifact/);
  assert.match(apply, /PG_POOL_MAX="\$database_pool_max"/);
  assert.match(apply, /WORKSPACE_INTERNAL_ORIGIN="\$\{WORKSPACE_INTERNAL_ORIGIN:-\$\{WORKSPACE_PUBLIC_ORIGIN:-http:\/\/127\.0\.0\.1\}\}"/);
  assert.match(apply, /internal-unit-identity\.mjs" ensure/);
  assert.match(apply, /WORKSPACE_DEPLOY_UNIT_ID="\$UNIT_ID"/);
  assert.match(apply, /WORKSPACE_DEPLOY_SLOT="\$slot"/);
  assert.match(apply, /WORKSPACE_DEPLOY_CURRENT_STATE_FILE="\$CURRENT_STATE_FILE"/);
  assert.match(apply, /WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE="\$INTERNAL_SIGNING_PRIVATE_KEY_FILE"/);
  assert.match(apply, /WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE="\$INTERNAL_TRUSTED_PUBLIC_KEYS_FILE"/);
  assert.match(apply, /WORKSPACE_INTERNAL_REPLAY_DIRECTORY="\$INTERNAL_REPLAY_DIRECTORY"/);
  assert.match(apply, /internal-rpc-deployment-guard\.mjs" direct/);
  assert.match(apply, /--max-memory-restart "\$\{memory_mib\}M"/);
  assert.match(sidecar, /\$assistant_runtime_tool" env-assert/);
  assert.match(sidecar, /WECHAT_BOT_BRIDGE_URL="http:\/\/127\.0\.0\.1:\$port\$base_path\$bridge_path"/);
  assert.match(sidecar, /workspace_sidecar_wait_online "\$process_name"/);
  assert.match(sidecar, /workspace_sidecar_wait_absent "\$process_name"/);
  assert.match(sidecar, /pm2 delete "\$opposite_process"/);
  assert.match(sidecar, /workspace_suspend_monolith_wecom_sidecar/);
  assert.match(sidecar, /workspace_restore_monolith_wecom_sidecar/);
  assert.match(sidecar, /workspace_capture_gateway_assistant_owner/);
  assert.match(sidecar, /WORKSPACE_DEPLOY_SLOT="\$slot"/);
  assert.match(sidecar, /WORKSPACE_DEPLOY_CURRENT_STATE_FILE=/);
  assert.match(apply, /profile-prepared/);
  assert.ok(deployBody.indexOf('if [ "$MODE" = "shadow" ]') < deployBody.indexOf('prepare_sidecar_handoff "$CURRENT_STATE_FILE"'));
  assert.ok(deployBody.indexOf('stop_previous_sidecar_for_handoff') < deployBody.indexOf('switch_gateway "$generation_id"'));
  assert.ok(deployBody.indexOf('switch_gateway "$generation_id"') < deployBody.indexOf('start_next_sidecar_for_handoff'));
  assert.ok(deployBody.indexOf('start_next_sidecar_for_handoff') < deployBody.indexOf('pm2 delete "$(read_json_field "$manifest_copy" runtime.processName)-$active_slot"'));
  assert.ok(deployBody.indexOf('switch_gateway "$generation_id"') < deployBody.lastIndexOf('write_unit_deploy_event deploy'));
  assert.match(apply, /if \[ "\$MODE" = "shadow" \][\s\S]*?write_unit_deploy_event deploy[^\n]*shadow/);
  assert.ok(apply.indexOf('internal-unit-identity.mjs" ensure') < apply.indexOf('pm2 delete "$process_name"'));
});

test("Gateway switch validates, replaces one include, tests Nginx, and restores on reload failure", () => {
  assert.match(gateway, /gateway-generation\.mjs/);
  assert.match(gateway, /expected exactly one legacy \/workspace location/);
  assert.match(gateway, /atomic_replace/);
  assert.match(gateway, /sudo nginx -t/);
  assert.match(gateway, /sudo systemctl reload nginx/);
  assert.ok(gateway.indexOf("atomic_replace \"$CURRENT_SWAP\" \"$CURRENT_LINK\"") < gateway.indexOf("sudo nginx -t"));
  assert.ok(gateway.indexOf("sudo systemctl reload nginx") < gateway.indexOf('write_committed_generation "$GENERATION_ID"'));
  assert.match(gateway, /if \[ "\$COMMITTED" = "0" \]/);
});
