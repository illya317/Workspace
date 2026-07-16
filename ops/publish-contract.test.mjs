import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publish = readFileSync(new URL("./publish.sh", import.meta.url), "utf8");
const publishCnb = readFileSync(new URL("./publish-cnb.sh", import.meta.url), "utf8");
const releaseToCnb = readFileSync(new URL("./release-to-cnb.sh", import.meta.url), "utf8");
const cnbPipeline = readFileSync(new URL("./cnb-release.yml", import.meta.url), "utf8");
const cnbPlaceholder = readFileSync(new URL("../.cnb.yml", import.meta.url), "utf8");

test("shell variables next to non-ASCII punctuation use explicit braces", () => {
  for (const name of ["publish.sh", "publish-cnb.sh", "release-to-cnb.sh", "deploy.sh"]) {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/u, name);
  }
});

test("the public deploy interface enters the CNB-owned module before GitHub promotion code", () => {
  assert.match(
    publish,
    /deploy\)\n\s+exec "\$SCRIPT_DIR\/publish-cnb\.sh" "\$@"/,
  );
  assert.ok(publish.indexOf('exec "$SCRIPT_DIR/publish-cnb.sh"') < publish.indexOf('source "$OPS_ENV_FILE"'));
  assert.doesNotMatch(publish, /release-evidence|production-deployment|CNB_TRIGGER_STARTED/);
});

test("CNB deployment path does not call GitHub APIs, Actions, Releases, or evidence", () => {
  const deploymentPath = [publishCnb, releaseToCnb, cnbPipeline, cnbPlaceholder].join("\n");
  assert.doesNotMatch(deploymentPath, /\bgh\b|api\.github\.com|release-evidence|GITHUB_TOKEN|GH_TOKEN/);
  assert.match(cnbPipeline, /exec bash <<'BASH'/);
  assert.match(cnbPipeline, /DATABASE_URL: postgresql:\/\/workspace:workspace@127\.0\.0\.1:5432\/workspace_ci/);
  assert.match(cnbPipeline, /SHADOW_DATABASE_URL: postgresql:\/\/workspace:workspace@127\.0\.0\.1:5432\/workspace_ci_shadow/);
  assert.match(cnbPlaceholder, /reject-direct-trigger/);
  assert.doesNotMatch(cnbPlaceholder, /bash \.\/ops\/deploy\.sh/);
  assert.match(cnbPipeline, /pg_ctlcluster 15 main start/);
  assert.match(cnbPipeline, /CREATE DATABASE workspace_ci_shadow OWNER workspace/);
  assert.match(cnbPipeline, /apt-get install[^\n]*\bshellcheck\b/);
  assert.match(cnbPipeline, /npm run deploy:preflight:ci/);
  assert.match(cnbPipeline, /npm run test:node/);
  assert.match(cnbPipeline, /build-standalone-artifact\.sh/);
  assert.match(cnbPipeline, /bash \.\/ops\/deploy\.sh/);
});

test("release request binds source parent and only injects CNB-owned files", () => {
  assert.match(releaseToCnb, /git rev-parse HEAD\^/);
  assert.match(releaseToCnb, /\.cnb-deploy-request\.json\\n\.cnb\.yml/);
  assert.match(releaseToCnb, /cnb build start-build/);
});

test("post-deploy verification binds CNB record, PM2, health, and exact source version", () => {
  assert.match(publishCnb, /record\?\.schemaVersion !== 2/);
  assert.match(publishCnb, /record\?\.cnb\?\.repository/);
  assert.match(publishCnb, /pm2.*jlist/);
  assert.match(publishCnb, /process\.env\.HEALTHCHECK_URL/);
  assert.match(publishCnb, /version\?\.version !== process\.env\.EXPECTED_SHA/);
});
