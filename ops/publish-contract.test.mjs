import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const publish = readFileSync(new URL("./publish.sh", import.meta.url), "utf8");
const publishCnb = readFileSync(new URL("./publish-cnb.sh", import.meta.url), "utf8");
const promoteRelease = readFileSync(new URL("./promote-release-branch.sh", import.meta.url), "utf8");
const releaseToCnb = readFileSync(new URL("./release-to-cnb.sh", import.meta.url), "utf8");
const syncTenantConfig = readFileSync(new URL("./sync-tenant-config.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./deploy.sh", import.meta.url), "utf8");
const buildDeployUnitArtifact = readFileSync(new URL("./build-deploy-unit-artifact.sh", import.meta.url), "utf8");
const buildStandaloneArtifact = readFileSync(new URL("./build-standalone-artifact.sh", import.meta.url), "utf8");
const buildCnbReleaseTarget = readFileSync(new URL("./build-cnb-release-target.sh", import.meta.url), "utf8");
const deployCnbReleaseTarget = readFileSync(new URL("./deploy-cnb-release-target.sh", import.meta.url), "utf8");
const installCnbReleaseDependencies = readFileSync(new URL("./install-cnb-release-dependencies.sh", import.meta.url), "utf8");
const runCnbReleaseGate = readFileSync(new URL("./run-cnb-release-gate.sh", import.meta.url), "utf8");
const cnbRelease = readFileSync(new URL("./cnb-release.yml", import.meta.url), "utf8");
const uploadDataRelease = readFileSync(new URL("./upload-data-release.sh", import.meta.url), "utf8");

test("shell variables next to non-ASCII punctuation use explicit braces", () => {
  for (const [name, source] of Object.entries({ publish, publishCnb, releaseToCnb, deploy })) {
    assert.doesNotMatch(source, /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/u, name);
  }
});

test("prepare freezes a candidate and deploy has one CNB-gated production path", () => {
  const dispatch = publish.indexOf('case "${1:-}" in');
  const githubSetup = publish.indexOf('GITHUB_REMOTE_NAME=');
  assert.ok(dispatch >= 0 && dispatch < githubSetup);
  assert.match(publish, /prepare\)[\s\S]*?release-gate-receipt\.mjs" candidate-create/);
  assert.doesNotMatch(publish.slice(publish.indexOf("  prepare)"), publish.indexOf("  data)")), /npm run check:ci|build:next|test:e2e/);
  assert.match(publish, /deploy\)[\s\S]*?release-gate-receipt\.mjs" candidate-verify[\s\S]*?exec "\$RELEASE_SCRIPT_DIR\/publish-cnb\.sh" "\$\{deploy_args\[@\]\}"/);
  assert.doesNotMatch(publish.slice(publish.indexOf("deploy)")), /upload-data-release\.sh/);
  assert.doesNotMatch(publish, /--full|hotfix|publish-hotfix/i);
  assert.equal(existsSync(new URL("./publish-hotfix.sh", import.meta.url)), false);
  assert.equal(existsSync(new URL("./hotfix-remote-build.sh", import.meta.url)), false);
  assert.match(publish, /if \[ "\$\{#deploy_args\[@\]\}" -eq 0 \]; then\s+exec "\$RELEASE_SCRIPT_DIR\/publish-cnb\.sh"/);
});

test("prepare alone promotes main into the dedicated release worktree by fast-forward only", () => {
  const promote = publish.indexOf('"$SCRIPT_DIR/promote-release-branch.sh" promote');
  const prepareFunction = publish.indexOf("prepare_release_worktree() {");
  assert.ok(prepareFunction >= 0 && prepareFunction < promote);
  const deploy = publish.slice(publish.indexOf("  deploy)"));
  assert.match(deploy, /load_prepared_release_worktree/);
  assert.doesNotMatch(deploy, /prepare_release_worktree/);
  assert.match(promoteRelease, /promote\|verify/);
  assert.match(promoteRelease, /if \[ "\$MODE" = "verify" \]/);
  assert.match(promoteRelease, /RELEASE_PROMOTION_BRANCH="\$\{RELEASE_PROMOTION_BRANCH:-main\}"/);
  assert.match(promoteRelease, /git merge-base --is-ancestor "\$release_sha" "\$candidate_sha"/);
  assert.match(promoteRelease, /git merge --ff-only "\$RELEASE_PROMOTION_BRANCH"/);
  assert.doesNotMatch(promoteRelease, /--force|reset --hard|merge --no-ff/);
  assert.match(publish, /git -C "\$RELEASE_WORKTREE" rev-parse HEAD/);
  assert.doesNotMatch(publish, /git -C .*SOURCE_DIR.*status/);
  assert.match(publish, /RELEASE_CI_ENV_FILE/);
  assert.match(publish, /ln -s "\$RELEASE_CI_ENV_FILE" "\$release_env_target"/);
  assert.match(publish, /release \.env 必须是指向受控 CI 环境文件的符号链接/);
});

test("deploy keeps the prepared release frozen when main advances", () => {
  const root = mkdtempSync(join(tmpdir(), "workspace-frozen-release-"));
  const repository = join(root, "repository");
  const releaseWorktree = join(root, "release");
  const envFile = join(root, "ops.env");
  const runGit = (...args) => execFileSync("git", args, { cwd: repository, stdio: "pipe" });
  try {
    execFileSync("git", ["init", "--initial-branch=main", repository], { stdio: "pipe" });
    runGit("config", "user.name", "Release Contract Test");
    runGit("config", "user.email", "release-contract@example.invalid");
    writeFileSync(join(repository, "candidate.txt"), "one\n");
    runGit("add", "candidate.txt");
    runGit("commit", "-m", "initial");
    runGit("branch", "release");
    runGit("worktree", "add", releaseWorktree, "release");

    writeFileSync(join(repository, "candidate.txt"), "two\n");
    runGit("add", "candidate.txt");
    runGit("commit", "-m", "prepared candidate");
    const preparedSha = runGit("rev-parse", "HEAD").toString().trim();
    writeFileSync(
      envFile,
      `RELEASE_SOURCE_DIR=${releaseWorktree}\nRELEASE_BRANCH=release\nRELEASE_PROMOTION_BRANCH=main\n`,
    );
    execFileSync("bash", [new URL("./promote-release-branch.sh", import.meta.url).pathname, "promote"], {
      env: { ...process.env, OPS_ENV_FILE: envFile },
      stdio: "pipe",
    });
    assert.equal(execFileSync("git", ["-C", releaseWorktree, "rev-parse", "HEAD"]).toString().trim(), preparedSha);

    writeFileSync(join(repository, "candidate.txt"), "three\n");
    runGit("add", "candidate.txt");
    runGit("commit", "-m", "later main");
    const laterMainSha = runGit("rev-parse", "HEAD").toString().trim();
    assert.notEqual(laterMainSha, preparedSha);

    execFileSync("bash", [new URL("./promote-release-branch.sh", import.meta.url).pathname, "verify"], {
      env: { ...process.env, OPS_ENV_FILE: envFile },
      stdio: "pipe",
    });
    assert.equal(execFileSync("git", ["-C", releaseWorktree, "rev-parse", "HEAD"]).toString().trim(), preparedSha);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CNB deployment path contains no GitHub transport or deployment API", () => {
  for (const [name, source] of Object.entries({ publishCnb, releaseToCnb, deploy })) {
    assert.doesNotMatch(source, /\bgh\b|api\.github\.com|github\.com|GITHUB_TOKEN|GH_TOKEN|production-deployment|release-evidence/i, name);
  }
});

test("CNB release identity is source parent plus exact injection files", () => {
  assert.match(releaseToCnb, /\.cnb-release\.json\\n\.cnb\.yml/);
  assert.match(releaseToCnb, /git rev-parse HEAD\^/);
  assert.match(deploy, /\.cnb-release\.json\\n\.cnb\.yml/);
  assert.match(deploy, /RELEASE_CNB_INJECTION_SHA/);
});

test("CNB runs one target-independent collect-all gate before either artifact path", () => {
  assert.doesNotMatch(publish, /npm run check:ci|npm run test:e2e|local-release-gate\.sh/);
  assert.match(runCnbReleaseGate, /npm run check:ci/);
  assert.match(runCnbReleaseGate, /ci_status=\$\?/);
  assert.match(runCnbReleaseGate, /run-release-e2e\.sh/);
  assert.match(runCnbReleaseGate, /e2e_status=\$\?/);
  assert.match(runCnbReleaseGate, /scope: "full-and-unit"|cnb-create/);
  assert.ok(cnbRelease.indexOf("- name: release-gate") < cnbRelease.indexOf("- name: build-release-target"));
  assert.match(buildCnbReleaseTarget, /release-gate-receipt\.mjs cnb-verify/);
  assert.match(buildCnbReleaseTarget, /cnb-release-artifact-cache\.sh restore/);
  assert.match(deployCnbReleaseTarget, /release-gate-receipt\.mjs cnb-verify/);
  assert.doesNotMatch(installCnbReleaseDependencies, /cnb-release-artifact-cache\.sh restore/);
  assert.doesNotMatch(buildStandaloneArtifact, /\.cnb-release-gate\.json/);
  assert.doesNotMatch(buildDeployUnitArtifact, /\.cnb-release-gate\.json/);
  assert.match(publish.slice(publish.indexOf("  deploy)")), /exec "\$RELEASE_SCRIPT_DIR\/publish-cnb\.sh"/);
  assert.match(publishCnb, /release-gate-receipt\.mjs" candidate-verify/);
  assert.match(publishCnb, /完整 CI、编译和 E2E 将由 CNB 统一运行/);
  for (const source of [releaseToCnb, deploy]) {
    assert.match(source, /metadata\.releaseCandidate\?\.schemaVersion !== 1/);
    assert.match(source, /metadata\.releaseCandidate\?\.sourceSha !== sha/);
    assert.match(source, /metadata\.releaseCandidate\?\.treeSha !== tree/);
    assert.match(source, /metadata\.releaseCandidate\?\.command !== 'ops\/publish\.sh prepare'/);
  }
});

test("CNB production preflight fails before the release trigger without rerunning local checks", () => {
  assert.match(publishCnb, /production-deploy-preflight\.mjs/);
  assert.match(publishCnb, /maintenance-deploy/);
  assert.match(publishCnb, /production-bootstrap-in-progress\.json/);
  assert.match(publishCnb, /printf 'maintenance:'; sed -n 's\/\^sourceSha=\/\/p'/);
  assert.match(publishCnb, /"maintenance:\$SOURCE_SHA"\)/);
  assert.ok(
    publishCnb.indexOf("production-deploy-preflight.mjs")
      < publishCnb.indexOf('release_args=(--metadata "$METADATA_FILE"'),
  );
});

test("CNB injection metadata is packaged for release identity and timing", () => {
  assert.match(buildStandaloneArtifact, /cp \.cnb-release\.json \.next\/standalone\/\.cnb-release\.json/);
  assert.match(buildStandaloneArtifact, /cmp \.cnb-release\.json \.next\/standalone\/\.cnb-release\.json/);
  assert.match(buildStandaloneArtifact, /copy_runtime_package_tree[^\n]*server-only/);
  assert.match(buildStandaloneArtifact, /node_modules\/server-only\/empty\.js/);
  assert.match(buildStandaloneArtifact, /cp tsconfig\.json tsconfig\.base\.json \.next\/standalone\//);
});

test("genesis release metadata binds the exact deployed source and both migration histories", () => {
  assert.match(publishCnb, /--genesis-production-base/);
  assert.match(publishCnb, /genesis candidate must contain exactly 00000000000000_sanitized_baseline/);
  assert.match(publishCnb, /rev-list --max-parents=0/);
  assert.match(publishCnb, /rev-list --min-parents=2/);
  assert.match(publishCnb, /legacyMigrationSetSha256/);
  assert.match(publishCnb, /baselineChecksum/);
  assert.match(releaseToCnb, /deployment genesis metadata is invalid/);
  assert.match(deploy, /deployment genesis metadata is invalid/);
});

test("private data transfer is an explicit command outside deployment", () => {
  assert.match(publish, /data\)[\s\S]*?exec "\$SCRIPT_DIR\/upload-data-release\.sh"/);
  assert.doesNotMatch(publishCnb, /--data-release|upload-data-release/);
  assert.doesNotMatch(deploy, /apply-data-release|data-release-gate/);
  assert.match(uploadDataRelease, /data-release-uploads\/\$RELEASE_ID/);
  assert.match(uploadDataRelease, /verify-staged[\s\S]*?payload-digest/);
  assert.match(uploadDataRelease, /mv '\$REMOTE_CURRENT\.tmp' '\$REMOTE_CURRENT'/);
  assert.doesNotMatch(uploadDataRelease, /data-release-sources[^\n]*rm|data-release-manifests[^\n]*rm/);
});

test("private release inputs validate before local checks and real deploy syncs before trigger", () => {
  assert.match(publishCnb, /WORKSPACE_CONFIG_DIR="\$\{WORKSPACE_CONFIG_DIR:-\$\{LOCAL_WORKSPACE_CONFIG_DIR:-\}\}"/);
  assert.match(releaseToCnb, /WORKSPACE_CONFIG_DIR="\$\{WORKSPACE_CONFIG_DIR:-\$\{LOCAL_WORKSPACE_CONFIG_DIR:-\}\}"/);
  assert.match(publishCnb, /sync-tenant-config\.sh" --source-sha "\$SOURCE_SHA"/);
  const candidateReceipt = publishCnb.indexOf("release-gate-receipt.mjs");
  const tenantSync = publishCnb.lastIndexOf('sync-tenant-config.sh" --source-sha "$SOURCE_SHA"');
  const releaseTrigger = publishCnb.indexOf('release-to-cnb.sh" "${release_args[@]}"');
  assert.ok(candidateReceipt >= 0 && candidateReceipt < tenantSync);
  assert.ok(tenantSync < releaseTrigger);
  const syncBlock = publishCnb.slice(publishCnb.lastIndexOf("if [", tenantSync), tenantSync);
  assert.match(syncBlock, /PRINT_COMMAND_ONLY" = "0/);
  assert.match(syncTenantConfig, /--conditions=react-server --import tsx/);
  assert.match(syncTenantConfig, /tenant\.getTenantConfig\(\)/);
  assert.match(releaseToCnb, /validate-cnb-release-config\.mjs" "\$CNB_REAL_CNB_YML"/);
  assert.ok(
    publish.indexOf("validate_local_release_inputs")
      < publish.indexOf('release-gate-receipt.mjs" candidate-create'),
  );
});

test("CNB records the full deployment attempt and keeps release-processing timing separate", () => {
  assert.match(publish, /release-process-timing\.mjs" begin/);
  assert.doesNotMatch(publishCnb, /release-process-timing\.mjs" exclude/);
  assert.match(publishCnb, /release-process-timing\.mjs" snapshot/);
  assert.match(publishCnb, /release-process-timing\.mjs" complete/);
  assert.match(publishCnb, /DEPLOY_ATTEMPT_STARTED_EPOCH_SECONDS="\$\(date \+%s\)"/);
  assert.match(publishCnb, /export PUBLISH_STARTED_EPOCH_SECONDS PUBLISH_STARTED_AT/);
  assert.match(publishCnb, /deployment: \{[\s\S]*?startedAtEpochSeconds,[\s\S]*?target:/);
  assert.match(publishCnb, /releaseProcessSeconds: seconds\('RELEASE_PROCESS_SECONDS'\)/);
  assert.match(publishCnb, /releaseAttemptCount/);
  assert.match(releaseToCnb, /metadata\.deployment\?\.startedAtEpochSeconds/);
  assert.match(deploy, /metadata\.deployment\?\.startedAtEpochSeconds/);
  assert.match(publishCnb, /正式部署计时开始/);
  assert.match(publishCnb, /正式部署计时结束/);
  assert.match(publishCnb, /Ops 总耗时/);
  assert.match(publishCnb, /main 处理与 CI 已排除/);
  assert.match(publishCnb, /cnb-build-timing-summary\.mjs --input/);
  assert.match(publishCnb, /deploy-notification\.mjs full-write/);
  assert.match(publishCnb, /node '\$remote_tool' event-write/);
  assert.match(publishCnb, /--release-id "\$release_id"/);
  assert.ok(
    publishCnb.indexOf("release-gate-receipt.mjs")
      < publishCnb.indexOf('DEPLOY_ATTEMPT_STARTED_EPOCH_SECONDS="$(date +%s)"'),
  );
  assert.ok(
    publishCnb.indexOf("CNB-native 生产部署完成")
      < publishCnb.lastIndexOf('print_deploy_timing_summary "$FORMAL_DEPLOY_DURATION"'),
  );
});

test("failed or cancelled deploy attempts notify the server with duration", () => {
  assert.match(publishCnb, /record_failed_deploy_attempt/);
  assert.match(publishCnb, /130\|143\) status="cancelled"/);
  assert.match(publishCnb, /'status': status/);
  assert.match(publishCnb, /'durationSeconds': duration/);
  assert.doesNotMatch(deploy, /run_deploy_stage notification\.record/);
});

test("CNB module publish separates public activation from explicit shadow and verifies exact Gateway state", () => {
  assert.match(publishCnb, /--deploy-unit\)[\s\S]*?DEPLOY_UNIT_MODE="activate"/);
  assert.match(publishCnb, /--shadow-unit\)/);
  assert.match(publishCnb, /kind: 'unit', unitId: process\.env\.DEPLOY_UNIT_ID, mode: process\.env\.DEPLOY_UNIT_MODE/);
  assert.match(publishCnb, /receipt-source-assert/);
  assert.match(publishCnb, /gateway\/current\/unit-states/);
  assert.match(publishCnb, /CNB-native 单模块 \$\{DEPLOY_UNIT_MODE\} 部署完成/);
  assert.match(releaseToCnb, /render-cnb-release-config\.mjs/);
  assert.match(releaseToCnb, /\['shadow', 'activate'\]\.includes\(target\.mode\)/);
});

test("CNB full reports success only after both terminal build success and exact production cutover", () => {
  assert.match(publishCnb, /cnb_state="unknown"/);
  assert.match(publishCnb, /\[ "\$cnb_state" != "failure" \]/);
  assert.match(
    publishCnb,
    /if \[ "\$deployed_sha" = "\$SOURCE_SHA" \] && \[ "\$cnb_state" = "success" \]; then/,
  );
  assert.ok(
    publishCnb.indexOf('[ "$cnb_state" != "failure" ]')
      < publishCnb.indexOf('if [ "$deployed_sha" = "$SOURCE_SHA" ] && [ "$cnb_state" = "success" ]; then'),
  );
  assert.ok(
    publishCnb.indexOf('if [ "$deployed_sha" = "$SOURCE_SHA" ] && [ "$cnb_state" = "success" ]; then')
      < publishCnb.indexOf('record_final_full_deploy_event "$FORMAL_DEPLOY_DURATION"'),
  );
  assert.ok(
    publishCnb.indexOf('record_final_full_deploy_event "$FORMAL_DEPLOY_DURATION"')
      < publishCnb.lastIndexOf('CNB-native 生产部署完成'),
  );
});

test("CNB Linux build has non-production Prisma generation inputs", () => {
  const gateStage = cnbRelease.slice(
    cnbRelease.indexOf("- name: release-gate"),
    cnbRelease.indexOf("- name: build-release-target"),
  );
  const buildStage = cnbRelease.slice(
    cnbRelease.indexOf("- name: build-release-target"),
    cnbRelease.indexOf("- name: deploy-to-server"),
  );
  for (const stage of [gateStage, buildStage]) {
    assert.match(stage, /NEXTAUTH_SECRET: cnb-build-only-secret-2026/);
    assert.match(stage, /DATABASE_URL: postgresql:\/\/workspace:workspace@127\.0\.0\.1:5432\/workspace_ci/);
    assert.match(stage, /DIRECT_URL: postgresql:\/\/workspace:workspace@127\.0\.0\.1:5432\/workspace_ci/);
    assert.match(stage, /SHADOW_DATABASE_URL: postgresql:\/\/workspace:workspace@127\.0\.0\.1:5432\/workspace_ci_shadow/);
  }
});

test("CNB release uses the reusable Builder, safe caches, and timed stages", () => {
  assert.match(cnbRelease, /dockerfile: ops\/cnb-builder\.Dockerfile/);
  assert.match(cnbRelease, /workspace-release-npm-v1:\/root\/\.npm:copy-on-write/);
  assert.match(cnbRelease, /workspace-release-next-v1:\.\/\.next\/cache:copy-on-write/);
  assert.match(cnbRelease, /workspace-release-types-v1:\.\/\.cache\/types:copy-on-write/);
  assert.match(cnbRelease, /workspace-release-tsbuild-v1:\.\/\.cache\/tsbuild:copy-on-write/);
  assert.match(cnbRelease, /workspace-release-artifacts-v1:\.\/\.cache\/release-artifacts:read-write/);
  assert.match(releaseToCnb, /git commit --no-verify -m "chore\(cnb\): inject release metadata/);
  assert.match(cnbRelease, /install-cnb-release-dependencies\.sh/);
  assert.doesNotMatch(cnbRelease, /install-deploy-tools|apt-get|node_modules:copy-on-write/);
  for (const stage of ["builder.verify", "dependencies.install", "release.gate", "artifact.build", "server.deploy"]) {
    assert.match(cnbRelease, new RegExp(`run-cnb-release-stage\\.sh ${stage.replace(".", "\\.")}`));
  }
});

test("standalone artifact substages record failures without disabling errexit", () => {
  const localStageRunner = buildStandaloneArtifact.slice(
    buildStandaloneArtifact.indexOf("run_artifact_stage()"),
    buildStandaloneArtifact.indexOf("if ! printf '%s' \"$SOURCE_SHA\""),
  );
  assert.match(localStageRunner, /if ! release_timing_active_begin \"\$stage\"/);
  assert.match(localStageRunner, /\"\$@\"\n(?:\s+#.*\n)*\s+release_timing_active_passed/);
  assert.doesNotMatch(localStageRunner, /set \+e|release_timing_finish .*passed/);
  assert.match(buildStandaloneArtifact, /cleanup_artifact_timing\(\)[\s\S]*?local artifact_exit_code=\$\?/);
  assert.match(
    buildStandaloneArtifact,
    /release_timing_active_finalize_on_exit \"\$artifact_exit_code\" \|\| true[\s\S]*?return \"\$artifact_exit_code\"/,
  );
  assert.match(buildStandaloneArtifact, /trap cleanup_artifact_timing EXIT/);
});
