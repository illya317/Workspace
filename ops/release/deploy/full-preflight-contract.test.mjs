import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deploy = readFileSync(new URL("../../deploy.sh", import.meta.url), "utf8");
const helper = readFileSync(new URL("./full-preflight.sh", import.meta.url), "utf8");

function assertOrdered(source, needles) {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle, previous + 1);
    assert.ok(index >= 0, `missing Full preflight contract fragment: ${needle}`);
    assert.ok(index > previous, `out-of-order Full preflight contract fragment: ${needle}`);
    previous = index;
  }
}

test("Full deploy signs aggregate zero-write evidence and rechecks production state before mutation", () => {
  assert.match(deploy, /DEPLOY_PREFLIGHT_LOG_ROOT=.*logs\/\$DEPLOY_PREFLIGHT_ATTEMPT_ID/);
  assert.match(deploy, /chmod 600 "\$log_file"/);
  assert.match(deploy, /source "\$SCRIPT_DIR\/release\/deploy\/full-preflight\.sh"/);
  assert.match(helper, /full-preflight\.mjs" record/);
  assert.match(deploy, /full-preflight\.mjs" verify/);
  assert.match(deploy, /production\.semantic-snapshot/);
  for (const field of [
    "currentTargetDigest", "deployedReceiptDigest", "controllerReceiptDigest",
    "tenantManifestDigest", "gatewayRouteMapDigest",
  ]) assert.match(helper, new RegExp(field));
  assert.doesNotMatch(deploy, /transport\.remote-smoke[^\n]*mkdir/);
  assertOrdered(deploy, [
    "candidate-artifact-graph", "deploy-tool-bundle", "transport.connect",
    "runtime.pm2-contract", "runtime.environment", "Deploy Preflight 汇总",
    "record_deploy_preflight_receipts 1", 'full-preflight.mjs" verify',
    "acquire_remote_deploy_lock", "deploy.production-snapshot-recheck", "snapshot-compare",
    "workspace-errexit-role: mutation-barrier", "set " + "-e",
    "deploy.tenant-config", "runtime.permissions", "deploy.tools",
  ]);
  const beforeMutation = deploy.slice(0, deploy.indexOf("workspace-errexit-role: mutation-barrier"));
  assert.doesNotMatch(beforeMutation, /sync-tenant-config\.sh.*--lock-token/);
  assert.match(deploy, /production mutation=0/);
});
