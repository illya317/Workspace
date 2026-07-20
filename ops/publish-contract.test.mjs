import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const publish = readFileSync(new URL("./publish.sh", import.meta.url), "utf8");
const publishCnb = readFileSync(new URL("./publish-cnb.sh", import.meta.url), "utf8");
const releaseToCnb = readFileSync(new URL("./release-to-cnb.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./deploy.sh", import.meta.url), "utf8");
const cnbRelease = readFileSync(new URL("./cnb-release.yml", import.meta.url), "utf8");

test("shell variables next to non-ASCII punctuation use explicit braces", () => {
  for (const [name, source] of Object.entries({ publish, publishCnb, releaseToCnb, deploy })) {
    assert.doesNotMatch(source, /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/u, name);
  }
});

test("deploy has one Full CNB production path", () => {
  const dispatch = publish.indexOf('case "${1:-}" in');
  const githubSetup = publish.indexOf('GITHUB_REMOTE_NAME=');
  assert.ok(dispatch >= 0 && dispatch < githubSetup);
  assert.match(publish, /deploy\)\s+shift\s+exec "\$SCRIPT_DIR\/publish-cnb\.sh" "\$@"/);
  assert.doesNotMatch(publish, /--full|hotfix|publish-hotfix/i);
  assert.equal(existsSync(new URL("./publish-hotfix.sh", import.meta.url)), false);
  assert.equal(existsSync(new URL("./hotfix-remote-build.sh", import.meta.url)), false);
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

test("CNB production preflight fails before full CI and release trigger", () => {
  assert.match(publishCnb, /production-deploy-preflight\.mjs/);
  assert.match(publishCnb, /maintenance-deploy/);
  assert.match(publishCnb, /production-bootstrap-in-progress\.json/);
  assert.ok(
    publishCnb.indexOf("production-deploy-preflight.mjs")
      < publishCnb.indexOf("local-full-ci-receipt.mjs verify"),
  );
  assert.ok(
    publishCnb.indexOf("production-deploy-preflight.mjs")
      < publishCnb.indexOf('release_args=(--metadata "$METADATA_FILE"'),
  );
});

test("CNB binds end-to-end publish timing to the success event", () => {
  assert.match(publishCnb, /PUBLISH_STARTED_EPOCH_SECONDS="\$\{PUBLISH_STARTED_EPOCH_SECONDS:-\$\(date \+%s\)\}"/);
  assert.match(publishCnb, /export PUBLISH_STARTED_EPOCH_SECONDS PUBLISH_STARTED_AT/);
  assert.match(publishCnb, /deployment: \{ startedAtEpochSeconds \}/);
  assert.match(releaseToCnb, /metadata\.deployment\?\.startedAtEpochSeconds/);
  assert.match(deploy, /metadata\.deployment\?\.startedAtEpochSeconds/);
  assert.match(publishCnb, /正式部署计时开始/);
  assert.match(publishCnb, /正式部署计时结束/);
  assert.match(publishCnb, /正式部署总耗时/);
  assert.ok(
    publishCnb.indexOf("PUBLISH_STARTED_EPOCH_SECONDS=")
      < publishCnb.indexOf("production-deploy-preflight.mjs"),
  );
  assert.ok(
    publishCnb.indexOf("CNB-native 生产部署完成")
      < publishCnb.indexOf("正式部署总耗时"),
  );
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
