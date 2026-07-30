import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const build = readFileSync(new URL("./build-cnb-release-target.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./deploy-cnb-release-target.sh", import.meta.url), "utf8");

test("CNB target builder restores first and builds only during validate", () => {
  assert.match(build, /cnb-release-artifact-cache\.sh restore/);
  assert.match(build, /deploy 只能消费已验证 artifact，禁止现场构建/);
  assert.match(build, /if \[ -z "\$UNIT_ID" \]/);
  assert.match(build, /bash \.\/ops\/build-standalone-artifact\.sh/);
  assert.match(build, /bash \.\/ops\/build-deploy-unit-artifact\.sh "\$UNIT_ID"/);
  assert.match(build, /bash \.\/ops\/cnb-release-artifact-cache\.sh store/);
  assert.match(build, /ALLOW_CNB_RELEASE_INJECTION=1/);
  assert.match(build, /--base "\$\{RELEASE_VALIDATION_BASE_SHA/);
});

test("CNB target deploy defaults to monolith and unit release is trusted but shadow-first", () => {
  assert.match(deploy, /release-gate-receipt\.mjs cnb-verify/);
  assert.match(deploy, /MODE="\$\{DEPLOY_UNIT_MODE:-shadow\}"/);
  assert.match(deploy, /exec bash \.\/ops\/deploy\.sh/);
  assert.match(deploy, /DEPLOY_UNIT_TRUSTED_BUILD=1/);
  assert.match(deploy, /exec bash \.\/ops\/deploy-unit\.sh deploy "\$UNIT_ID" "\$MODE"/);
  assert.doesNotMatch(deploy, /rollback/);
});
