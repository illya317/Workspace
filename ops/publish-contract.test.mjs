import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const publish = read("./publish.sh");
const controllerReady = read("./release/control/controller-ready.mjs");
const runReleaseCi = read("./run-release-ci.sh");
const publishCnb = read("./publish-cnb.sh");
const runLocalReleaseAction = read("./run-local-release-action.sh");
const runCnbReleaseStage = read("./run-cnb-release-stage.sh");
const deployTarget = read("./deploy-cnb-release-target.sh");
const deployArtifact = read("./deploy/artifact.sh");
const databaseReplacement = read("./publish-database-replacement.sh");

test("public production code release keeps ci to Ready to deploy with a separate controller proof", () => {
  assert.match(publish, /正式应用生命周期保持 ci -> Ready -> deploy/);
  assert.match(publish, /\n  ci\)/);
  assert.match(publish, /\n  controller-ready\)/);
  assert.match(publish, /\n  deploy\)/);
  assert.ok(publish.indexOf("ops/publish.sh ci") < publish.indexOf("ops/publish.sh controller-ready"));
  assert.match(publish, /prepare\|validate\|build\)[\s\S]*?应用 lifecycle 只有 ci -> Ready -> deploy；deploy 前另需 controller-ready/);
  assert.doesNotMatch(publish, /--new-plan\)|--fast\)|--cnb-from\)|--executor\)/);
});

test("ci aggregates independent preflight, source, and artifact results before Ready", () => {
  assert.match(publish, /set \+e[\s\S]*?validate_release_inputs[\s\S]*?capture_release_configuration_identity[\s\S]*?cache-prune\.mjs" prune[\s\S]*?set -e/);
  assert.match(publish, /RELEASE_CI_PREFLIGHT_STATUS/);
  assert.match(runReleaseCi, /set \+e[\s\S]*?run-cnb-release-gate\.sh[\s\S]*?build-cnb-release-target\.sh[\s\S]*?set -e/);
  assert.match(runReleaseCi, /preflight=\$PREFLIGHT_STATUS database=\$DATABASE_STATUS source=\$source_status artifact=\$artifact_status/);
  assert.ok(runReleaseCi.indexOf("source_status=$?") < runReleaseCi.indexOf("build-cnb-release-target.sh"));
  assert.ok(runReleaseCi.indexOf("build-cnb-release-target.sh") < runReleaseCi.indexOf("ready-artifact.mjs\" create"));
});

test("Ready binds the aggregate source result, frozen task graph, receipts, config, and artifact", () => {
  for (const option of ["--source-result", "--task-graph", "--source-receipt", "--artifact-receipt", "--configuration"]) {
    assert.match(runReleaseCi, new RegExp(option));
  }
  assert.match(publishCnb, /ready-artifact\.mjs" verify/);
  assert.ok(publishCnb.indexOf("ready-artifact.mjs\" verify") < publishCnb.indexOf("production-deploy-preflight.mjs"));
  assert.match(publishCnb, /node "\$SCRIPT_DIR\/production-deploy-preflight\.mjs"/);
  assert.doesNotMatch(publishCnb, /node ops\/production-deploy-preflight\.mjs/);
  assert.match(deployArtifact, /metadata\.releaseReady/);
  assert.doesNotMatch(deployArtifact, /releaseCandidate|releasePlan/);
});

test("deploy consumes the current Ready Artifact and cannot build", () => {
  const deployCase = publish.slice(publish.indexOf("  deploy)"), publish.indexOf("  data)"));
  assert.match(deployCase, /ready-artifact\.mjs" current/);
  assert.match(deployCase, /cnb-release-artifact-cache\.sh restore/);
  assert.match(deployCase, /publish-cnb\.sh" --release-action deploy --direct/);
  assert.doesNotMatch(deployCase, /run-release-ci|run-cnb-release-gate|build-cnb-release-target|build-standalone-artifact|run-node-tests|with-check-lock|npm run/);
  for (const source of [runLocalReleaseAction, deployTarget]) {
    assert.doesNotMatch(source, /build-standalone-artifact|build-deploy-unit-artifact/);
  }
  assert.match(deployTarget, /Ready Receipt 与恢复后的 artifact 完全一致/);
});

test("controller-ready tests one exact controller tuple and deploy only verifies its receipt", () => {
  const controllerReadyCase = publish.slice(publish.indexOf("  controller-ready)"), publish.indexOf("  status)"));
  const deployCase = publish.slice(publish.indexOf("  deploy)"), publish.indexOf("  data)"));
  assert.match(controllerReadyCase, /controller-ready\.mjs" qualify/);
  assert.doesNotMatch(controllerReadyCase, /deploy-control-compatibility|run-node-tests|with-check-lock|--controller-source|--control-digest|--changed-files/);
  assert.match(controllerReady, /const OPS_TEST_COMMAND = "node scripts\/check\/with-check-lock\.js -- node scripts\/testing\/run-node-tests\.mjs shard ops"/);
  assert.match(controllerReady, /function runOpsTestShard\(\{ repository \}\)/);
  assert.doesNotMatch(controllerReady, /export function runOpsTestShard|runner\s*=|await runner\(/);
  assert.match(controllerReady, /const beforeTests = controllerTuple\(verifyDeployControlCompatibility/);
  assert.match(controllerReady, /passedOpsTestEvidence\(await runOpsTestShard\(\{ repository: path\.resolve\(repository\) \}\)\)/);
  assert.match(controllerReady, /const afterTests = controllerTuple\(verifyDeployControlCompatibility/);
  assert.ok(controllerReady.indexOf("beforeTests") < controllerReady.indexOf("await runOpsTestShard"));
  assert.ok(controllerReady.indexOf("await runOpsTestShard") < controllerReady.indexOf("afterTests"));
  assert.ok(controllerReady.indexOf("afterTests") < controllerReady.indexOf("atomicWrite(target, receipt)"));
  assert.match(deployCase, /controller-ready\.mjs" verify/);
  assert.match(deployCase, /"\$SCRIPT_DIR\/publish-cnb\.sh" --release-action deploy --direct/);
  assert.doesNotMatch(deployCase, /"\$RELEASE_SCRIPT_DIR\/publish-cnb\.sh"/);
  assert.doesNotMatch(deployCase, /deploy-control-compatibility\.mjs|run-node-tests\.mjs|with-check-lock\.js/);
  assert.ok(deployCase.indexOf("controller-ready.mjs") < deployCase.indexOf("publish-cnb.sh"));
});

test("deploy binds full Controller Ready metadata while Application Ready remains the artifact identity", () => {
  assert.match(publish, /DEPLOY_CONTROL_RECEIPT_DIGEST/);
  assert.match(publish, /RELEASE_CONTROLLER_READY_RECEIPT_FILE/);
  assert.match(publishCnb, /controller-ready\.mjs" verify/);
  assert.match(publishCnb, /DEPLOY_CONTROL_SOURCE_SHA='\$DEPLOY_CONTROL_SOURCE_SHA'/);
  assert.match(publishCnb, /DEPLOY_CONTROL_TREE_ID='\$DEPLOY_CONTROL_TREE_ID'/);
  assert.match(publishCnb, /DEPLOY_CONTROL_DIGEST='\$DEPLOY_CONTROL_DIGEST'/);
  assert.match(publishCnb, /const controllerReady = JSON\.parse/);
  assert.match(publishCnb, /schemaVersion: 3,[\s\S]*?releaseReady,[\s\S]*?controllerReady,/);
  assert.match(runLocalReleaseAction, /worktree add --detach "\$injection_worktree" "\$RELEASE_CONTROLLER_SOURCE_SHA"/);
  assert.match(runLocalReleaseAction, /worktree remove --force "\$injection_worktree"/);
  assert.doesNotMatch(runLocalReleaseAction, /worktree prune/);
  assert.match(runCnbReleaseStage, /git rev-parse HEAD\^/);
  assert.match(runCnbReleaseStage, /Application Ready source\/tree\/content 无法复现/);
  assert.match(deployArtifact, /verifyControllerReadyReceipt/);
  assert.match(deployArtifact, /controllerSource: 'HEAD\^'/);
  assert.match(deployArtifact, /metadata\.source\?\.commitSha !== sha/);
  assert.doesNotMatch(deployArtifact, /RELEASE_SOURCE_SHA="\$\(git rev-parse HEAD\^/);
});

test("old split CNB actions are rejected before any production work", () => {
  const actionGuard = publishCnb.indexOf("旧 validate/build 发布动作已删除");
  const directGuard = publishCnb.indexOf("远端 CNB 分段发布已删除");
  const sourceCapture = publishCnb.indexOf("SOURCE_SHA=\"$(git rev-parse HEAD)\"");
  assert.ok(actionGuard > 0 && directGuard > actionGuard && sourceCapture > directGuard);
  assert.match(deployTarget, /旧 validate\/build 动作已删除/);
});

test("release worktree uses the controlled CI environment and stays immutable for deploy", () => {
  assert.match(publish, /release \.env 必须是指向受控 CI 环境文件的符号链接/);
  assert.match(publish, /promote-release-branch\.sh" promote/);
  assert.match(publish, /promote-release-branch\.sh" verify/);
  assert.match(publishCnb, /\[ -z "\$\(git status --short\)" \]/);
});

test("database replacement follows the same ci then deploy boundary", () => {
  assert.match(databaseReplacement, /\n  ci\)/);
  assert.match(databaseReplacement, /publish\.sh" ci/);
  assert.match(databaseReplacement, /\n  deploy\)/);
  assert.match(databaseReplacement, /publish\.sh" deploy/);
  assert.doesNotMatch(databaseReplacement, /\n  prepare\)|\n  validate\)|\n  build\)|publish\.sh" (?:prepare|validate|build)/);
});

test("shell variables next to non-ASCII punctuation use explicit braces", () => {
  for (const source of [publish, publishCnb, runLocalReleaseAction, deployTarget]) {
    assert.doesNotMatch(source, /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/u);
  }
});
