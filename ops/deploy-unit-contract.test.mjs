import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const build = readFileSync("ops/build-deploy-unit-artifact.sh", "utf8");
const client = readFileSync("ops/deploy-unit.sh", "utf8");
const apply = readFileSync("ops/apply-deploy-unit.sh", "utf8");
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
  assert.match(build, /tar -C "\$STANDALONE_ROOT" -czf "\$ARTIFACT_FILE"/);
  assert.match(build, /control-plane-requirements\.mjs write/);
  assert.match(build, /assistant-runtime\.mjs bundle/);
  assert.match(build, /assistant-runtime\.mjs assert/);
  assert.match(build, /artifact-assert/);
  assert.doesNotMatch(build, /\btsc\b/);
  assert.ok(build.indexOf('npm run typecheck:scope -- "$scope"') < build.indexOf('./node_modules/.bin/next build "$APP_ROOT"'));
});

test("client deploy accepts only trusted artifacts while rollback remains an explicit operator action", () => {
  assert.match(client, /DEPLOY_UNIT_TRUSTED_BUILD/);
  assert.match(client, /artifact-assert/);
  assert.match(client, /graph-assert/);
  assert.match(client, /apply-deploy-unit\.sh' rollback/);
  assert.match(client, /apply-deploy-unit\.sh' deploy/);
  assert.match(client, /shadow\|prepare\|activate/);
  assert.match(client, /DEPLOY_PROFILE_PREPARED_STATE_ROOT/);
  assert.match(client, /deploy-notification\.mjs/);
  assert.match(client, /internal-unit-identity\.mjs/);
  assert.match(client, /internal-rpc-deployment-guard\.mjs/);
  assert.ok(client.indexOf("DEPLOY_UNIT_TRUSTED_BUILD") < client.indexOf("rsync -az"));
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
  assert.match(apply, /WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE="\$INTERNAL_SIGNING_PRIVATE_KEY_FILE"/);
  assert.match(apply, /WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE="\$INTERNAL_TRUSTED_PUBLIC_KEYS_FILE"/);
  assert.match(apply, /WORKSPACE_INTERNAL_REPLAY_DIRECTORY="\$INTERNAL_REPLAY_DIRECTORY"/);
  assert.match(apply, /internal-rpc-deployment-guard\.mjs" direct/);
  assert.match(apply, /--max-memory-restart "\$\{memory_mib\}M"/);
  assert.match(apply, /assistant-runtime\.mjs" env-assert/);
  assert.match(apply, /WECHAT_BOT_BRIDGE_URL="http:\/\/127\.0\.0\.1:\$port\$base_path\$bridge_path"/);
  assert.match(apply, /wait_for_pm2_online "\$process_name"/);
  assert.match(apply, /profile-prepared/);
  assert.ok(apply.indexOf('if [ "$MODE" = "shadow" ]') < apply.indexOf('start_release_sidecars "$manifest_copy"'));
  assert.ok(apply.indexOf('start_release_sidecars "$manifest_copy"') < apply.indexOf('switch_gateway "$generation_id"'));
  assert.ok(apply.indexOf('switch_gateway "$generation_id"') < apply.indexOf('stop_release_sidecars "$release_dir" "$active_slot"'));
  assert.ok(apply.indexOf('switch_gateway "$generation_id"') < apply.lastIndexOf('write_unit_deploy_event deploy'));
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
  assert.match(gateway, /if \[ "\$COMMITTED" = "0" \]/);
});
