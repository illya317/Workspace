import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("./run-cnb-release-gate.sh", import.meta.url), "utf8");
const build = readFileSync(new URL("./build-cnb-release-target.sh", import.meta.url), "utf8");
const e2e = readFileSync(new URL("./run-release-e2e.sh", import.meta.url), "utf8");

test("validate runs source CI once and never falls through to compilation", () => {
  assert.match(gate, /full-source-validation\.mjs/);
  assert.match(gate, /source-verify/);
  assert.match(gate, /source-create/);
  assert.match(gate, /source_status=\$\?/);
  assert.match(gate, /不自动重跑或进入 build/);
  assert.doesNotMatch(gate, /build-standalone-artifact|build-deploy-unit-artifact/);
});

test("build and deploy never rerun the source gate", () => {
  assert.match(gate, /if \[ "\$ACTION" != "validate" \][\s\S]*?exit 0/);
  assert.match(build, /validate\)[\s\S]*?不运行 artifact 编译[\s\S]*?exit 0/);
  assert.match(build, /deploy 只能消费 build 环节冻结的 artifact，禁止现场编译/);
});

test("artifact receipt is created only after the single target compilation", () => {
  assert.ok(build.indexOf("build-standalone-artifact.sh") < build.indexOf("artifact-create"));
  assert.ok(build.indexOf("artifact-create") < build.indexOf("cnb-release-artifact-cache.sh store"));
  assert.match(build, /ACTION" = "build"/);
  assert.doesNotMatch(build, /full-source-result|full-source-ci/);
});

test("a build failure is terminal for the plan and is not retried in-process", () => {
  assert.match(build, /build_status=\$\?/);
  assert.match(build, /build 失败；该 Plan 的 build 已终止，不自动重跑/);
  assert.equal(build.match(/build-standalone-artifact\.sh/g)?.length, 1);
});

test("release E2E owns one disposable database and can run the selected spec set", () => {
  assert.match(e2e, /PLAYWRIGHT_BROWSERS_PATH=.*\.cache\/release-check\/playwright/);
  assert.match(e2e, /CREATE DATABASE/);
  assert.match(e2e, /DROP DATABASE IF EXISTS/);
  assert.match(e2e, /run-selected-e2e\.mjs/);
  assert.match(e2e, /playwright:processes:check/);
});
