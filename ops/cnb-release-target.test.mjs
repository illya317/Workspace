import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const build = readFileSync(new URL("./build-cnb-release-target.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./deploy-cnb-release-target.sh", import.meta.url), "utf8");

test("target builder restores exact cache first and otherwise compiles once inside CI", () => {
  assert.match(build, /cnb-release-artifact-cache\.sh restore/);
  assert.match(build, /assert-build-space/);
  assert.match(build, /if \[ -z "\$UNIT_ID" \]/);
  assert.match(build, /bash \.\/ops\/build-standalone-artifact\.sh/);
  assert.match(build, /bash \.\/ops\/build-deploy-unit-artifact\.sh "\$UNIT_ID"/);
  assert.match(build, /bash \.\/ops\/cnb-release-artifact-cache\.sh store/);
  assert.match(build, /--content "\$\{RELEASE_CONTENT_DIGEST/);
  assert.match(build, /artifact-create/);
  assert.doesNotMatch(build, /RELEASE_ACTION|ACTION" = "build"|ALLOW_CNB_RELEASE_INJECTION=1/);
});

test("target deploy consumes Ready, never builds, and keeps unit release shadow-first", () => {
  assert.match(deploy, /\[ "\$ACTION" = deploy \]/);
  assert.match(deploy, /RELEASE_READY_RECEIPT_FILE/);
  assert.match(deploy, /release-gate-receipt\.mjs artifact-verify/);
  assert.match(deploy, /release\/readiness\/ready-artifact\.mjs verify/);
  assert.match(deploy, /--target "\$TARGET_ID"/);
  assert.match(deploy, /MODE="\$\{DEPLOY_UNIT_MODE:-shadow\}"/);
  assert.match(deploy, /bash \.\/ops\/deploy\.sh[\s\S]*pin_production_artifact[\s\S]*exit 0/);
  assert.match(deploy, /DEPLOY_UNIT_TRUSTED_BUILD=1/);
  assert.match(deploy, /bash \.\/ops\/deploy-unit\.sh deploy "\$UNIT_ID" "\$MODE"/);
  assert.match(deploy, /if \[ "\$MODE" = "activate" \]; then pin_production_artifact; fi/);
  assert.doesNotMatch(deploy, /build-standalone-artifact|build-deploy-unit-artifact|artifact-create/);
});

test("target deploy adapter aggregates every zero-write check and explicitly handles child status", () => {
  assert.doesNotMatch(deploy, /^set -e/m);
  assert.match(deploy, /set -uo pipefail/);
  assert.match(deploy, /preflight_failed=\(\)/);
  assert.match(deploy, /preflight_blocked=\(\)/);
  assert.match(deploy, /artifact\.receipt/);
  assert.match(deploy, /application-ready\.receipt/);
  assert.match(deploy, /Deploy target adapter preflight 汇总/);
  const summary = deploy.indexOf("Deploy target adapter preflight 汇总");
  const fullDeploy = deploy.indexOf("bash ./ops/deploy.sh", summary);
  const unitDeploy = deploy.indexOf('bash ./ops/deploy-unit.sh deploy "$UNIT_ID" "$MODE"', summary);
  assert.ok(summary > 0 && fullDeploy > summary && unitDeploy > summary);
  assert.match(deploy.slice(fullDeploy), /deploy_status=\$\?[\s\S]*?exit "\$deploy_status"/);
  assert.match(deploy.slice(unitDeploy), /deploy_status=\$\?[\s\S]*?exit "\$deploy_status"/);
});

test("target deploy adapter reports independent missing inputs in one zero-write attempt", () => {
  const result = spawnSync("bash", [new URL("./deploy-cnb-release-target.sh", import.meta.url).pathname], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      RELEASE_ACTION: "invalid",
      RELEASE_READY_RECEIPT_FILE: "",
      RELEASE_CONFIGURATION_DIGEST: "",
      RELEASE_CI_RUN_ID: "",
      RELEASE_CONTENT_DIGEST: "",
      RELEASE_SOURCE_TREE: "",
      RELEASE_SOURCE_SHA: "",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Deploy target adapter preflight 汇总: failed=[1-9][0-9]* blocked=[1-9][0-9]*; production mutation=0/);
  assert.match(result.stderr, /failed: input\.action/);
  assert.match(result.stderr, /failed: input\.RELEASE_READY_RECEIPT_FILE/);
  assert.match(result.stderr, /blocked: artifact\.receipt:input/);
  assert.match(result.stderr, /blocked: application-ready\.receipt:input/);
});
