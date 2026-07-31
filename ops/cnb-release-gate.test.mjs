import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("./run-cnb-release-gate.sh", import.meta.url), "utf8");
const build = readFileSync(new URL("./build-cnb-release-target.sh", import.meta.url), "utf8");
const e2e = readFileSync(new URL("./run-release-e2e.sh", import.meta.url), "utf8");

test("validate runs one full source CI without automatic risk classification", () => {
  assert.match(gate, /full-source-validation\.mjs/);
  assert.match(gate, /--content "\$RELEASE_CONTENT_DIGEST"/);
  assert.match(gate, /--result-file "\$SOURCE_RESULT_FILE"/);
  assert.match(gate, /source_status=\$\?/);
  assert.match(gate, /仍进入一次独立编译/);
});

test("deploy restores content-bound validation evidence and never reruns source gates", () => {
  const deployBranch = gate.slice(gate.indexOf('if [ "$ACTION" = "deploy" ]'));
  assert.ok(deployBranch.indexOf("cnb-release-artifact-cache.sh restore") < deployBranch.indexOf("cnb-verify"));
  assert.match(deployBranch, /--content "\$RELEASE_CONTENT_DIGEST"/);
  assert.match(deployBranch, /exit 0/);
});

test("receipt is created only after the single target compilation", () => {
  assert.ok(build.indexOf("build-standalone-artifact.sh") < build.indexOf("cnb-create"));
  assert.ok(build.indexOf("cnb-create") < build.indexOf("cnb-release-artifact-cache.sh store"));
  assert.doesNotMatch(build, /post-build/);
});

test("validate aggregates full source CI and compile status before creating evidence", () => {
  assert.match(build, /SOURCE_RESULT_FILE=.*full-source-result[\s\S]*?source_status=/);
  assert.match(build, /build_status=\$\?/);
  assert.match(build, /full-source-ci:/);
  assert.match(build, /artifact-compile:/);
  assert.ok(build.indexOf("validate 全阶段结果") < build.indexOf("cnb-create"));
  assert.ok(build.indexOf('source_status=""') < build.indexOf("cnb-release-artifact-cache.sh restore"));
  assert.match(build, /cnb-release-artifact-cache\.sh restore[\s\S]*?source_status[\s\S]*?exit "\$source_status"/);
});

test("release E2E owns one disposable database and can run the selected spec set", () => {
  assert.match(e2e, /PLAYWRIGHT_BROWSERS_PATH=.*\.cache\/release-check\/playwright/);
  assert.match(e2e, /CREATE DATABASE/);
  assert.match(e2e, /DROP DATABASE IF EXISTS/);
  assert.match(e2e, /run-selected-e2e\.mjs/);
  assert.match(e2e, /playwright:processes:check/);
});
