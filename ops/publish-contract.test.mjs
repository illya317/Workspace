import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const publish = read("./publish.sh");
const publishEntryPreflight = read("./release/deploy/publish-entry-preflight.sh");
const publishSources = `${publish}\n${publishEntryPreflight}`;
const controllerReady = read("./release/control/controller-ready.mjs");
const controllerQualification = read("./release/control/controller-qualification-cache.mjs");
const readyArtifact = read("./release/readiness/ready-artifact.mjs");
const runReleaseCi = read("./run-release-ci.sh");
const ciAttempt = read("./release/attempts/ci-attempt.mjs");
const ciAttemptContract = read("./release/attempts/ci-attempt-contract.mjs");
const ciAttemptSources = `${ciAttempt}\n${ciAttemptContract}`;
const ciAttemptShell = read("./release/attempts/ci-attempt-shell.sh");
const deployAttemptShell = read("./release/attempts/deploy-attempt-shell.sh");
const deployBlocker = read("./release/attempts/deploy-blocker.mjs");
const artifactStaticAcceptance = read("./release/readiness/artifact-static-acceptance.mjs");
const publishCnb = read("./publish-cnb.sh");
const publishCnbPreflight = read("./release/deploy/publish-cnb-preflight.sh");
const publishCnbSources = `${publishCnb}\n${publishCnbPreflight}`;
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

test("Stage-2 preflight fails before database, source CI, or artifact build", () => {
  assert.match(publish, /printf -v release_ci_identity '%04x%04x%04x'/);
  assert.match(publish, /RELEASE_CI_RUN_ID="ci-\$\(date -u \+%Y%m%dT%H%M%SZ\)-\$release_ci_identity-\$release_ci_nonce"/);
  assert.match(publish, /RELEASE_CI_RUN_ID="ci-[\s\S]*?artifact-preflight-\$target_id-\$target_mode-\$RELEASE_CI_RUN_ID\.json/);
  assert.match(publish, /artifact-preflight\.mjs" create/);
  assert.ok(publish.indexOf('artifact-preflight.mjs" create') < publish.indexOf("ci-database-sandbox.mjs"));
  assert.doesNotMatch(runReleaseCi, /CI_RUN_NONCE|date -u \+%Y%m%dT%H%M%SZ/);
  assert.match(runReleaseCi, /CI_RUN_ID="\$RELEASE_CI_RUN_ID"/);
  assert.ok(runReleaseCi.indexOf('artifact-preflight.mjs" verify') < runReleaseCi.indexOf("run-cnb-release-gate.sh"));
  assert.ok(runReleaseCi.indexOf('artifact-preflight.mjs" verify') < runReleaseCi.indexOf("build-cnb-release-target.sh"));
  assert.match(publish, /RELEASE_CI_PREFLIGHT_STATUS/);
  assert.match(runReleaseCi, /set \+e[\s\S]*?run-cnb-release-gate\.sh[\s\S]*?build-cnb-release-target\.sh[\s\S]*?set -e/);
  assert.match(runReleaseCi, /preflight=\$PREFLIGHT_STATUS database=\$DATABASE_STATUS source=\$source_status artifact=\$artifact_status/);
  assert.ok(runReleaseCi.indexOf("source_status=$?") < runReleaseCi.indexOf("build-cnb-release-target.sh"));
  assert.ok(runReleaseCi.indexOf("build-cnb-release-target.sh") < runReleaseCi.indexOf("ready-artifact.mjs\" create"));
});

test("every CI exit finalizes one run-scoped immutable attempt receipt", () => {
  const ciCase = publish.slice(publish.indexOf("  ci)"), publish.indexOf("  controller-ready)"));
  assert.match(publish, /source "\$SCRIPT_DIR\/release\/attempts\/ci-attempt-shell\.sh"/);
  assert.match(ciCase, /release_ci_attempt_begin "\$attempt_repository" "\$RELEASE_CI_RUN_ID" "\$target_id" "\$target_mode"/);
  assert.ok(ciCase.indexOf("release_ci_attempt_begin") < ciCase.indexOf("prepare_release_worktree"));
  assert.match(ciAttemptShell, /trap 'release_ci_attempt_finalize "\$\?"' EXIT/);
  assert.match(ciAttemptShell, /\.cache\/release-attempts/);
  assert.match(ciAttemptSources, /open\(file, "wx", 0o444\)/);
  assert.match(ciAttemptSources, /receiptDigest: sha256|attempt\.receiptDigest = sha256/);
  assert.match(ciAttemptSources, /unexpected-exit/);
  assert.match(ciAttemptSources, /normalizedMessageDigest/);
  assert.match(ciAttemptSources, /normalizedMessageDigest\]\.join\("\\0"\)/);
  assert.match(ciAttemptSources, /RECURRENCE_EXIT_CODE = 42/);
  assert.match(ciAttemptSources, /release attempt receipt digest mismatch/);
  assert.doesNotMatch(ciAttemptSources, /rawOutput:|stdout:|stderr:|environment:|commandLine:/);
});

test("CI records all eight lane boundaries without reusing CI attempts during deploy", () => {
  const ciCase = publish.slice(publish.indexOf("  ci)"), publish.indexOf("  controller-ready)"));
  const deployCase = publish.slice(publish.indexOf("  deploy)"), publish.indexOf("  data)"));
  for (const lane of ["candidate-freeze", "artifact-preflight", "database"]) {
    assert.match(ciCase, new RegExp(`release_ci_attempt_lane_(?:start|pass|fail) ${lane}`));
  }
  for (const lane of ["database", "source", "artifact-build", "static-acceptance", "rehearsal", "application-ready"]) {
    assert.match(runReleaseCi, new RegExp(`release_ci_attempt_lane_(?:start|pass|fail|block) ${lane}`));
  }
  assert.match(runReleaseCi, /release_ci_attempt_lane_start source[\s\S]*?run-cnb-release-gate\.sh[\s\S]*?release_ci_attempt_lane_(?:pass|fail) source/);
  assert.match(runReleaseCi, /release_ci_attempt_lane_start artifact-build[\s\S]*?build-cnb-release-target\.sh[\s\S]*?release_ci_attempt_lane_(?:pass|fail) artifact-build/);
  assert.match(runReleaseCi, /release_ci_attempt_capture source/);
  assert.match(runReleaseCi, /release_ci_attempt_capture artifact-build/);
  assert.match(runReleaseCi, /artifact-static-acceptance\.mjs/);
  assert.match(runReleaseCi, /deploy-unit-release\.mjs" artifact-assert/);
  assert.match(artifactStaticAcceptance, /inspectArchive\(\{ artifact, manifest: parsedManifest, target \}\)/);
  assert.doesNotMatch(deployCase, /release_ci_attempt_(?:begin|finalize|lane_|patrol)|ci-attempt\.mjs/);
});

test("deploy retry is fenced by immutable classified blocker history", () => {
  const deployCase = publish.slice(publish.indexOf("  deploy)"), publish.indexOf("  data)"));
  assert.match(publish, /source "\$SCRIPT_DIR\/release\/attempts\/deploy-attempt-shell\.sh"/);
  assert.match(deployCase, /deploy-blocker\.mjs|release_deploy_attempt_tool/);
  assert.match(deployCase, /assert-clear/);
  assert.ok(deployCase.indexOf("assert-clear") < deployCase.indexOf("publish-cnb.sh"));
  assert.match(deployCase, /release_deploy_attempt_run --/);
  assert.match(deployAttemptShell, /\.cache\/release-deploy-attempts/);
  assert.match(deployAttemptShell, /chmod 400 "\$log_file"/);
  assert.match(deployCase, /--receipt "\$retry_fence_file"/);
  assert.match(deployCase, /RELEASE_DEPLOY_RETRY_FENCE_RECEIPT_FILE/);
  for (const command of ["record-admission", "record", "classify", "resolve", "assert-clear", "verify-clear", "patrol"]) {
    assert.match(deployBlocker, new RegExp(`command === "${command}"`));
  }
});

test("Ready binds preflight, aggregate source, frozen task graph, config, and artifact", () => {
  for (const option of ["--artifact-preflight", "--source-result", "--task-graph", "--source-receipt", "--artifact-receipt", "--configuration"]) {
    assert.match(runReleaseCi, new RegExp(option));
  }
  assert.match(readyArtifact, /artifactPreflightReceiptSha256/);
  assert.match(readyArtifact, /artifactPreflightIdentityDigest/);
  assert.match(publishCnb, /ready-artifact\.mjs" verify/);
  assert.ok(publishCnb.indexOf("ready-artifact.mjs\" verify") < publishCnb.indexOf("production-deploy-preflight.mjs"));
  assert.match(publishCnb, /node "\$SCRIPT_DIR\/production-deploy-preflight\.mjs"/);
  assert.doesNotMatch(publishCnb, /node ops\/production-deploy-preflight\.mjs/);
  assert.match(deployArtifact, /metadata\.releaseReady/);
  assert.doesNotMatch(deployArtifact, /releaseCandidate|releasePlan/);
  assert.match(runReleaseCi, /source-validation-\$TARGET_ID-\$CI_RUN_ID\.json/);
  assert.match(publishCnb, /source-validation-\$ready_target-\$RELEASE_RUN_ID\.json/);
  assert.match(runLocalReleaseAction, /source-validation-\$\{deploy_unit_id:-monolith\}-\$release_run_id\.json/);
  assert.match(runReleaseCi, /rehearsal-\$TARGET_ID-\$TARGET_MODE-\$CI_RUN_ID-\$RELEASE_CONFIGURATION_DIGEST\.json/);
  assert.match(publishCnb, /rehearsal-\$ready_target-\$ready_mode-\$RELEASE_RUN_ID-\$RELEASE_CONFIGURATION_DIGEST\.json/);
  assert.match(runLocalReleaseAction, /rehearsal-\$\{deploy_unit_id:-monolith\}-\$\{deploy_unit_mode:-activate\}-\$release_run_id-\$\{RELEASE_CONFIGURATION_DIGEST\}\.json/);
});

test("CI and Ready selectors reject duplicate unit choices and reserved monolith", () => {
  const invoke = (args) => spawnSync("bash", [new URL("./publish.sh", import.meta.url).pathname, ...args], {
    encoding: "utf8",
    env: { ...process.env, WORKSPACE_REPO_RUNTIME_READY: "1", OPS_ENV_FILE: "/dev/null" },
  });
  for (const args of [
    ["ci", "--deploy-unit", "finance", "--shadow-unit", "hr"],
    ["ci", "--deploy-unit", "monolith"],
    ["ci", "--shadow-unit", "monolith"],
    ["status", "--deploy-unit", "monolith"],
  ]) {
    const result = invoke(args);
    assert.equal(result.status, 2, `${args.join(" ")} unexpectedly passed: ${result.stdout}${result.stderr}`);
  }
});

test("deploy consumes the current Ready Artifact and cannot build", () => {
  const deployCase = publish.slice(publish.indexOf("  deploy)"), publish.indexOf("  data)"));
  assert.match(publishSources, /load_selected_ready\(\)[\s\S]*?ready-artifact\.mjs" current/);
  assert.match(deployCase, /cnb-release-artifact-cache\.sh restore/);
  assert.match(deployCase, /publish-cnb\.sh" --release-action deploy --direct/);
  assert.doesNotMatch(deployCase, /run-release-ci|run-cnb-release-gate|build-cnb-release-target|build-standalone-artifact|run-node-tests|with-check-lock|npm run/);
  for (const source of [runLocalReleaseAction, deployTarget]) {
    assert.doesNotMatch(source, /build-standalone-artifact|build-deploy-unit-artifact/);
  }
  assert.match(publishCnb, /--artifact-preflight/);
  assert.match(runLocalReleaseAction, /artifact-preflight-/);
  assert.match(runLocalReleaseAction, /link_ready_file "\$source_artifact_preflight_file"/);
  assert.match(deployTarget, /--artifact-preflight/);
  for (const source of [publishCnb, runLocalReleaseAction, deployTarget]) {
    assert.doesNotMatch(source, /artifact-preflight\.mjs" create|transpileConfig|assert-build-space|next build/);
  }
  assert.match(deployTarget, /Ready Receipt 与恢复后的 artifact 完全一致/);
});

test("local and target deploy adapters aggregate before dispatch and never inherit global errexit", () => {
  for (const source of [runLocalReleaseAction, deployTarget]) {
    assert.doesNotMatch(source, /^set -e/m);
    assert.match(source, /set -uo pipefail/);
    assert.match(source, /preflight_failed=\(\)/);
    assert.match(source, /preflight_blocked=\(\)/);
    assert.match(source, /production mutation=0/);
  }
  const localSummary = runLocalReleaseAction.indexOf("Local deploy adapter preflight 汇总");
  const localDispatch = runLocalReleaseAction.indexOf("bash ./ops/run-cnb-release-stage.sh", localSummary);
  assert.ok(localSummary > 0 && localDispatch > localSummary);
  assert.match(runLocalReleaseAction.slice(localDispatch), /deploy_status=\$\?[\s\S]*?exit "\$deploy_status"/);
  const targetSummary = deployTarget.indexOf("Deploy target adapter preflight 汇总");
  assert.ok(targetSummary > 0 && deployTarget.indexOf("bash ./ops/deploy.sh", targetSummary) > targetSummary);
  assert.ok(deployTarget.indexOf("bash ./ops/deploy-unit.sh", targetSummary) > targetSummary);
});

test("local deploy adapter reports independent missing inputs before creating a worktree", () => {
  const result = spawnSync("bash", [
    new URL("./run-local-release-action.sh", import.meta.url).pathname,
    "deploy",
    "/missing/release-metadata.json",
  ], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Local deploy adapter preflight 汇总: failed=[1-9][0-9]* blocked=[1-9][0-9]*; production mutation=0/);
  assert.match(result.stderr, /failed: input\.RELEASE_SOURCE_DIR/);
  assert.match(result.stderr, /failed: input\.release-metadata/);
  assert.match(result.stderr, /blocked: git\.controller-identity/);
  assert.doesNotMatch(result.stderr, /无法创建 controller injection worktree/);
});

test("publish deploy preflight aggregates before any fail-fast release mutation", () => {
  assert.match(publish, /^#!\/usr\/bin\/env bash\nset -uo pipefail/m);
  assert.doesNotMatch(publish, /^set -euo pipefail/m);
  assert.match(publishSources, /deploy_preflight_failures=\(\)/);
  assert.match(publishSources, /begin_deploy_entry_preflight[\s\S]*?record-admission/);
  assert.match(publishSources, /finish_deploy_entry_preflight/);
  for (const failure of [
    "release worktree/candidate identity 无效",
    "tenant configuration digest 无法计算",
    "本地部署凭据/目标配置无效",
    "Application Ready receipt/identity 无效",
    "Controller Ready receipt/identity 无效",
    "deploy blocker ledger 未清空",
    "Ready artifact cache 恢复/复验失败",
  ]) {
    assert.match(publishSources, new RegExp(failure));
  }
  const deployCase = publish.slice(publish.indexOf("  deploy)"), publish.indexOf("  data)"));
  assert.ok(deployCase.indexOf("begin_deploy_entry_preflight") < deployCase.indexOf("load_ready_worktree"));
  assert.doesNotMatch(deployCase, /set -(?:e|[A-Za-z]*e[A-Za-z]*)|set -o errexit/);
});

test("publish-cnb aggregates zero-write probes and enables errexit only at mutation barrier", () => {
  assert.match(publishCnb, /^#!\/bin\/bash\nset -uo pipefail/m);
  assert.match(publishCnbSources, /publish_preflight_failures=\(\)/);
  for (const probe of [
    "probe_publish_inputs",
    "probe_deploy_retry_fence",
    "probe_candidate_ready_artifact",
    "probe_controller_ready",
    "probe_production_state",
    "probe_tenant_config",
  ]) {
    assert.match(publishCnbSources, new RegExp(`${probe}\\(\\)`));
  }
  const barrier = "# workspace-errexit-role: mutation-barrier";
  const barrierIndex = publishCnb.indexOf(barrier);
  assert.ok(barrierIndex > publishCnb.indexOf("finish_publish_preflight"));
  assert.match(publishCnbSources, /deploy-blocker\.mjs" verify-clear/);
  assert.doesNotMatch(publishCnb.slice(0, barrierIndex), /(?:^|\n)\s*set\s+(?:-[A-Za-z]*e[A-Za-z]*|-o\s+errexit)(?:\s|$)/);
  assert.match(publishCnb.slice(barrierIndex), /mutation-barrier\nset -e\nrecord_release_event running 0/);
});

test("sourced deploy preflight helpers report independent failures and blocked probes in one run", () => {
  const environment = {
    ...process.env,
    WORKSPACE_REPO_RUNTIME_READY: "1",
    OPS_ENV_FILE: "/dev/null",
  };
  const publishResult = spawnSync("bash", [new URL("./publish.sh", import.meta.url).pathname, "deploy"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(publishResult.status, 1);
  const publishOutput = `${publishResult.stdout}${publishResult.stderr}`;
  for (const message of [
    "deploy 入口预检发现 failed=2 blocked=5；production mutation=0",
    "本地部署凭据/目标配置无效",
    "Application Ready receipt blocked",
    "Controller Ready receipt blocked",
    "deploy blocker ledger blocked",
    "Ready artifact cache blocked",
  ]) {
    assert.match(publishOutput, new RegExp(message));
  }

  const cnbResult = spawnSync("bash", [new URL("./publish-cnb.sh", import.meta.url).pathname, "--direct"], {
    encoding: "utf8",
    env: environment,
  });
  assert.equal(cnbResult.status, 1);
  const cnbOutput = `${cnbResult.stdout}${cnbResult.stderr}`;
  for (const message of [
    "deploy 零写入预检发现 7 项失败",
    "Deploy Retry Fence Ready blocked",
    "Application Ready/artifact blocked",
    "Controller Ready blocked",
    "tenant config dry-run blocked",
    "生产 canonical 状态 blocked",
  ]) {
    assert.match(cnbOutput, new RegExp(message));
  }
});

test("controller-ready reuses an exact ops qualification and deploy only verifies its binding", () => {
  const controllerReadyCase = publish.slice(publish.indexOf("  controller-ready)"), publish.indexOf("  status)"));
  const deployCase = publish.slice(publish.indexOf("  deploy)"), publish.indexOf("  data)"));
  assert.match(controllerReadyCase, /controller-ready\.mjs" qualify/);
  assert.doesNotMatch(controllerReadyCase, /deploy-control-compatibility|run-node-tests|with-check-lock|--controller-source|--control-digest|--changed-files/);
  assert.match(controllerQualification, /export const CONTROLLER_OPS_ARGS = Object\.freeze\(/);
  assert.match(controllerQualification, /"scripts\/check\/with-check-lock\.js"[\s\S]*?"scripts\/testing\/run-node-tests\.mjs"[\s\S]*?"shard"[\s\S]*?"ops"/);
  assert.match(controllerQualification, /export const CONTROLLER_OPS_COMMAND = \["node", \.\.\.CONTROLLER_OPS_ARGS\]\.join\(" "\)/);
  assert.match(controllerReady, /CONTROLLER_OPS_COMMAND/);
  assert.match(controllerReady, /readReusableQualification\(cacheRoot, qualificationExpected\)/);
  assert.match(controllerReady, /function runOpsTestShard\(\{ repository \}\)/);
  assert.doesNotMatch(controllerReady, /export function runOpsTestShard|runner\s*=|await runner\(/);
  assert.match(controllerReady, /const beforeTests = controllerTuple\(verifyDeployControlCompatibility/);
  assert.match(controllerReady, /if \(!opsQualification\)[\s\S]*?await runOpsTestShard\(\{ repository: path\.resolve\(repository\) \}\)/);
  assert.match(controllerReady, /const afterTests = controllerTuple\(verifyDeployControlCompatibility/);
  assert.ok(controllerReady.indexOf("const beforeTests") < controllerReady.indexOf("const reusable = readReusableQualification"));
  assert.ok(controllerReady.indexOf("const reusable = readReusableQualification") < controllerReady.indexOf("const afterTests"));
  assert.ok(controllerReady.indexOf("const afterTests") < controllerReady.indexOf("atomicWrite(target, receipt)"));
  assert.match(publishSources, /load_controller_ready\(\)[\s\S]*?controller-ready\.mjs" verify/);
  assert.match(deployCase, /"\$SCRIPT_DIR\/publish-cnb\.sh" --release-action deploy --direct/);
  assert.doesNotMatch(deployCase, /"\$RELEASE_SCRIPT_DIR\/publish-cnb\.sh"/);
  assert.doesNotMatch(deployCase, /deploy-control-compatibility\.mjs|run-node-tests\.mjs|with-check-lock\.js/);
  assert.ok(deployCase.indexOf("controller-ready.mjs") < deployCase.indexOf("publish-cnb.sh"));
});

test("status, controller-ready, and deploy select an exact target-mode Ready pointer", () => {
  assert.match(publish, /parse_ready_selector\(\)/);
  assert.match(publish, /--deploy-unit\|--shadow-unit/);
  assert.match(publish, /READY_SELECTOR_ARGS=\(--target "\$SELECTED_READY_TARGET" --target-mode "\$SELECTED_READY_MODE"\)/);
  for (const command of ["controller-ready", "status", "deploy"]) {
    assert.match(publish, new RegExp(`parse_ready_selector ${command} [01] "\\$@"`));
  }
  const deployCase = publish.slice(publish.indexOf("  deploy)"), publish.indexOf("  data)"));
  assert.match(publishSources, /load_selected_ready\(\)[\s\S]*?selected Ready target 与 receipt target 不一致；deploy 禁止重定向目标/);
  assert.doesNotMatch(deployCase, /target_id="\$SELECTED_READY_TARGET"|target_mode="\$SELECTED_READY_MODE"/);
  assert.match(runReleaseCi, /receipts\/\$TARGET_ID\/\$TARGET_MODE\/\$CI_RUN_ID-\$RELEASE_CONTENT_DIGEST-\$RELEASE_CONFIGURATION_DIGEST\.json/);
  assert.match(readyArtifact, /writeImmutableReadyReceipt/);
  assert.match(readyArtifact, /Ready Artifact receipt path already contains different immutable evidence/);
});

test("deploy binds full Controller Ready metadata while Application Ready remains the artifact identity", () => {
  assert.match(publishSources, /DEPLOY_CONTROL_RECEIPT_DIGEST/);
  assert.match(publishSources, /RELEASE_CONTROLLER_READY_RECEIPT_FILE/);
  assert.match(publishCnbSources, /controller-ready\.mjs" verify/);
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
  assert.match(publish, /release\/worktree\/controlled-environment\.mjs" ensure/);
  assert.match(publish, /--worktree "\$RELEASE_WORKTREE" --environment "\$RELEASE_CI_ENV_FILE"/);
  assert.match(publish, /--dependencies "\$RELEASE_CI_DEPENDENCIES_DIR"/);
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
