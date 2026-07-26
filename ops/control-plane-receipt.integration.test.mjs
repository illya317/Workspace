import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deploy = readFileSync(new URL("./deploy.sh", import.meta.url), "utf8");
const tenant = readFileSync(new URL("./tenant-config-manifest.mjs", import.meta.url), "utf8");
const receipt = readFileSync(new URL("./control-plane-receipt.mjs", import.meta.url), "utf8");
const controlPlaneEntrypoint = readFileSync(new URL("./deploy-control-plane.sh", import.meta.url), "utf8");

test("deploy syncs and syntax-checks the control-plane receipt tool", () => {
  assert.match(deploy, /ops\/release-receipt\.mjs ops\/control-plane-receipt\.mjs ops\/tenant-config-manifest\.mjs/);
  assert.match(deploy, /node --check '\$REMOTE_CONTROL_PLANE_RECEIPT_TOOL'/);
});

test("control-plane receipt commits after lifecycle parity and before candidate startup", () => {
  const migration = deploy.indexOf("migrate deploy");
  const resourceSeed = deploy.indexOf("seed-resources-runtime.mjs", migration);
  const workforce = deploy.indexOf("provision-agent-workforce.mjs", resourceSeed);
  const parity = deploy.indexOf("direct_fingerprint", workforce);
  const receiptWrite = deploy.indexOf("control-plane lifecycle 回执", parity);
  const candidate = deploy.indexOf("pm2 start", receiptWrite);
  assert.ok(migration >= 0 && resourceSeed > migration);
  assert.ok(workforce > resourceSeed && parity > workforce && receiptWrite > parity && candidate > receiptWrite);
  assert.match(deploy.slice(receiptWrite, candidate), /REMOTE_CONTROL_PLANE_RECEIPT_TOOL/);
  assert.match(deploy.slice(receiptWrite, candidate), /--migration-set '\$RELEASE_MIGRATION_SET_SHA'/);
  assert.match(deploy.slice(receiptWrite, candidate), /\.deployment\/tenant-config-manifest\.json/);
});

test("matching application inputs consume the receipt and skip global mutations", () => {
  const readiness = deploy.indexOf("control_plane_ready=0");
  const consume = deploy.indexOf("消费已验证的 control-plane lifecycle 回执", readiness);
  const migration = deploy.indexOf("migrate deploy", consume);
  const receiptWrite = deploy.indexOf("control-plane lifecycle 回执", migration);
  assert.ok(readiness >= 0 && consume > readiness && migration > consume && receiptWrite > migration);
  const fastPath = deploy.slice(consume, migration);
  assert.match(fastPath, /check-prisma-deploy-status\.js/);
  assert.match(fastPath, /ensure_bootstrap_progress_marker/);
  assert.doesNotMatch(fastPath, /migrate deploy|seed-resources-runtime|provision-agent-workforce/);
});

test("application-only policy cannot fall through to global lifecycle mutations", () => {
  assert.match(deploy, /CONTROL_PLANE_POLICY=\"\$\{CONTROL_PLANE_POLICY:-auto\}\"/);
  assert.match(deploy, /auto\|refresh\|require-existing/);
  const policyGate = deploy.indexOf("application-only 发布缺少与当前 artifact 精确匹配");
  const mutation = deploy.indexOf("migrate deploy", policyGate);
  assert.ok(policyGate >= 0 && mutation > policyGate);
  assert.match(deploy.slice(policyGate, mutation), /exit 1/);
});

test("control-plane-only execution commits lifecycle without starting or switching an application", () => {
  assert.match(deploy, /DEPLOY_EXECUTION_MODE=\"\$\{DEPLOY_EXECUTION_MODE:-combined\}\"/);
  assert.match(deploy, /application-only\) CONTROL_PLANE_POLICY=require-existing/);
  assert.match(deploy, /control-plane-only\) CONTROL_PLANE_POLICY=refresh/);
  const lifecycleOnly = deploy.indexOf("control-plane lifecycle 已提交");
  const candidate = deploy.indexOf("pm2 start", lifecycleOnly);
  assert.ok(lifecycleOnly >= 0 && candidate > lifecycleOnly);
  assert.match(deploy.slice(lifecycleOnly, candidate), /trap - EXIT[\s\S]*?exit 0/);
  const outerBranch = deploy.lastIndexOf('if [ "$DEPLOY_EXECUTION_MODE" = "control-plane-only" ]');
  assert.ok(outerBranch > lifecycleOnly);
  const lifecycleBranch = deploy.slice(outerBranch);
  assert.match(lifecycleBranch, /backup\.postgresql[\s\S]*lifecycle\.deploy[\s\S]*lifecycle\.verify/);
  assert.doesNotMatch(lifecycleBranch.slice(0, lifecycleBranch.indexOf("else")), /runtime\.library|runtime\.agent|runtime\.onlyoffice|health\.final/);
});

test("control-plane release has one explicit operator entrypoint", () => {
  assert.match(controlPlaneEntrypoint, /DEPLOY_EXECUTION_MODE=control-plane-only/);
  assert.match(controlPlaneEntrypoint, /CONTROL_PLANE_POLICY=refresh/);
  assert.match(controlPlaneEntrypoint, /exec "\$SCRIPT_DIR\/deploy\.sh" "\$@"/);
});

test("tenant install persists the current manifest and runtime-specific adapters stay outside the central receipt", () => {
  assert.match(tenant, /targetRoot, "\.deployment\/tenant-config-manifest\.json"/);
  assert.doesNotMatch(receipt, /qc-cache|onlyoffice|library-runtime|wecom/i);
});
