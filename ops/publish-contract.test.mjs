import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publish = readFileSync(new URL("./publish.sh", import.meta.url), "utf8");
const publishCnb = readFileSync(new URL("./publish-cnb.sh", import.meta.url), "utf8");
const publishHotfix = readFileSync(new URL("./publish-hotfix.sh", import.meta.url), "utf8");
const hotfixRemoteBuild = readFileSync(new URL("./hotfix-remote-build.sh", import.meta.url), "utf8");
const releaseToCnb = readFileSync(new URL("./release-to-cnb.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./deploy.sh", import.meta.url), "utf8");
const cnbRelease = readFileSync(new URL("./cnb-release.yml", import.meta.url), "utf8");

test("shell variables next to non-ASCII punctuation use explicit braces", () => {
  for (const [name, source] of Object.entries({ publish, publishCnb, releaseToCnb, deploy })) {
    assert.doesNotMatch(source, /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/u, name);
  }
});

test("deploy defaults to hotfix and requires an explicit full marker for CNB", () => {
  const dispatch = publish.indexOf('case "${1:-}" in');
  const githubSetup = publish.indexOf('GITHUB_REMOTE_NAME=');
  assert.ok(dispatch >= 0 && dispatch < githubSetup);
  assert.match(publish, /deploy\)[\s\S]*?""\) exec "\$SCRIPT_DIR\/publish-hotfix\.sh"/);
  assert.match(publish, /--full\)[\s\S]*?shift[\s\S]*?exec "\$SCRIPT_DIR\/publish-cnb\.sh" "\$@"/);
  assert.match(publish, /deploy 默认为 hotfix/);
  assert.match(publish, /exec "\$SCRIPT_DIR\/publish-hotfix\.sh" "\$@"/);
});

test("SSH hotfix keeps scope open but preserves exact-source and cutover safety", () => {
  assert.match(publishHotfix, /HOTFIX_SCOPE_POLICY="\$\{HOTFIX_SCOPE_POLICY:-off\}"/);
  assert.match(publishHotfix, /classify-risk\.mjs[\s\S]*?scope policy/);
  assert.match(publishHotfix, /git status --short[\s\S]*?git bundle create/);
  assert.match(publishHotfix, /git merge-base --is-ancestor "\$RUNTIME_SHA" "\$SOURCE_SHA"/);
  assert.match(publishHotfix, /rsync[\s\S]*?deployed-release\.json[\s\S]*?node ops\/release-receipt\.mjs inspect/);
  assert.doesNotMatch(publishHotfix, /\$SERVER:\$remote_receipt_tool/);
  assert.match(publishHotfix, /RELEASE_TRANSPORT=ssh-hotfix/);
  assert.match(publishHotfix, /bash "\$SCRIPT_DIR\/deploy\.sh"/);
  assert.doesNotMatch(publishHotfix, /cnb build|release-to-cnb|publish-cnb/);
});

test("SSH hotfix builds exact source in a resource-capped Node 24 Linux container", () => {
  assert.match(hotfixRemoteBuild, /git -C "\$REMOTE_AGENT_SOURCE_DIR" bundle verify/);
  assert.match(hotfixRemoteBuild, /worktree add --detach "\$worktree" "\$SOURCE_SHA"/);
  assert.match(hotfixRemoteBuild, /docker pull "\$HOTFIX_NODE_IMAGE"/);
  assert.match(hotfixRemoteBuild, /RepoDigests/);
  assert.match(hotfixRemoteBuild, /--cpus "\$HOTFIX_BUILD_CPUS"/);
  assert.match(hotfixRemoteBuild, /--memory "\$HOTFIX_BUILD_MEMORY"/);
  assert.match(hotfixRemoteBuild, /flock -n 9/);
  assert.match(hotfixRemoteBuild, /--pids-limit 512/);
  assert.match(hotfixRemoteBuild, /--security-opt no-new-privileges:true/);
  assert.match(hotfixRemoteBuild, /REMOTE_AGENT_SOURCE_DIR:ro/);
  assert.match(hotfixRemoteBuild, /process\.versions\.node[\s\S]*?= "24"/);
  assert.match(hotfixRemoteBuild, /command -v git[\s\S]*?command -v make[\s\S]*?command -v g\+\+/);
  assert.match(hotfixRemoteBuild, /build-standalone-artifact\.sh/);
  assert.match(hotfixRemoteBuild, /trap cleanup EXIT/);
  assert.match(hotfixRemoteBuild, /cleanup[\s\S]*?trap - EXIT[\s\S]*?find "\$REMOTE_HOTFIX_BUILD_ROOT"/);
  assert.doesNotMatch(hotfixRemoteBuild, /current/);
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

test("CNB deployment requires one exact-tree local full CI receipt", () => {
  assert.match(publishCnb, /local-full-ci-receipt\.mjs verify/);
  assert.match(publishCnb, /npm run check:ci/);
  assert.match(publishCnb, /local-full-ci-receipt\.mjs create/);
  assert.ok(
    publishCnb.indexOf("local-full-ci-receipt.mjs verify")
      < publishCnb.indexOf('METADATA_FILE="$TMP_DIR/cnb-release.json"'),
  );
  for (const source of [releaseToCnb, deploy]) {
    assert.match(source, /metadata\.localFullCi\?\.treeSha !== tree/);
    assert.match(source, /metadata\.localFullCi\?\.command !== 'npm run check:ci'/);
  }
});

test("CNB Linux build has non-production Prisma generation inputs", () => {
  const buildStage = cnbRelease.slice(
    cnbRelease.indexOf("- name: build-standalone"),
    cnbRelease.indexOf("- name: deploy-to-server"),
  );
  assert.match(buildStage, /NEXTAUTH_SECRET: cnb-build-only-secret-2026/);
  assert.match(buildStage, /DATABASE_URL: postgresql:\/\/workspace:workspace@127\.0\.0\.1:5432\/workspace_ci/);
  assert.match(buildStage, /DIRECT_URL: postgresql:\/\/workspace:workspace@127\.0\.0\.1:5432\/workspace_ci/);
  assert.match(buildStage, /SHADOW_DATABASE_URL: postgresql:\/\/workspace:workspace@127\.0\.0\.1:5432\/workspace_ci_shadow/);
});
