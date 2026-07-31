import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const build = readFileSync(new URL("./build-cnb-release-target.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./deploy-cnb-release-target.sh", import.meta.url), "utf8");

test("CNB target builder restores first and builds only during build", () => {
  assert.match(build, /cnb-release-artifact-cache\.sh restore/);
  assert.match(build, /deploy 只能消费 build 环节冻结的 artifact，禁止现场编译/);
  assert.match(build, /ACTION" = "build"/);
  assert.match(build, /if \[ -z "\$UNIT_ID" \]/);
  assert.match(build, /bash \.\/ops\/build-standalone-artifact\.sh/);
  assert.match(build, /bash \.\/ops\/build-deploy-unit-artifact\.sh "\$UNIT_ID"/);
  assert.match(build, /bash \.\/ops\/cnb-release-artifact-cache\.sh store/);
  assert.match(build, /ALLOW_CNB_RELEASE_INJECTION=1/);
  assert.match(build, /--content "\$\{RELEASE_CONTENT_DIGEST/);
  assert.match(build, /artifact-create/);
});

test("CNB target deploy defaults to monolith and unit release is trusted but shadow-first", () => {
  assert.match(deploy, /release-gate-receipt\.mjs artifact-verify/);
  assert.match(deploy, /--target "\$TARGET_ID"/);
  assert.match(deploy, /MODE="\$\{DEPLOY_UNIT_MODE:-shadow\}"/);
  assert.match(deploy, /exec bash \.\/ops\/deploy\.sh/);
  assert.match(deploy, /DEPLOY_UNIT_TRUSTED_BUILD=1/);
  assert.match(deploy, /exec bash \.\/ops\/deploy-unit\.sh deploy "\$UNIT_ID" "\$MODE"/);
  assert.doesNotMatch(deploy, /rollback/);
});
