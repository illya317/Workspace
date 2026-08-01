import assert from "node:assert/strict";
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
  assert.match(deploy, /\[ "\$MODE" != "activate" \] \|\| pin_production_artifact/);
  assert.doesNotMatch(deploy, /build-standalone-artifact|build-deploy-unit-artifact|artifact-create/);
});
