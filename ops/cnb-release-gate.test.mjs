import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("./run-cnb-release-gate.sh", import.meta.url), "utf8");
const build = readFileSync(new URL("./build-cnb-release-target.sh", import.meta.url), "utf8");
const e2e = readFileSync(new URL("./run-release-e2e.sh", import.meta.url), "utf8");

test("validate plans from exact base/head and runs only the affected dependency closure", () => {
  assert.match(gate, /--base "\$RELEASE_VALIDATION_BASE_SHA"/);
  assert.match(gate, /--head "\$RELEASE_SOURCE_SHA"/);
  assert.match(gate, /--diff-mode two-dot/);
  assert.match(gate, /run-affected-validation\.mjs[\s\S]*?--classification "\$CLASSIFICATION_FILE" --phase source/);
  assert.match(gate, /--result-file "\$SOURCE_RESULT_FILE"/);
  assert.match(gate, /source_status=\$\?/);
  assert.match(gate, /RELEASE_DATABASE_START_STATUS="\$database_status"/);
  assert.match(gate, /仍进入 artifact 阶段收集独立 build\/E2E 结果/);
  assert.doesNotMatch(gate, /npm run check:ci|full-ci/);
});

test("deploy restores base-bound validation evidence and never reruns source gates", () => {
  const deployBranch = gate.slice(gate.indexOf('if [ "$ACTION" = "deploy" ]'));
  assert.ok(deployBranch.indexOf("cnb-release-artifact-cache.sh restore") < deployBranch.indexOf("cnb-verify"));
  assert.match(deployBranch, /--base "\$RELEASE_VALIDATION_BASE_SHA"/);
  assert.match(deployBranch, /exit 0/);
  assert.ok(deployBranch.indexOf("exit 0") < deployBranch.indexOf("classify-risk.mjs"));
});

test("receipt is created only after target build and selected post-build checks", () => {
  assert.ok(build.indexOf("build-standalone-artifact.sh") < build.indexOf("--phase post-build"));
  assert.ok(build.indexOf("--phase post-build") < build.indexOf("cnb-create"));
  assert.ok(build.indexOf("cnb-create") < build.indexOf("cnb-release-artifact-cache.sh store"));
});

test("validate aggregates source, build, and post-build status before creating evidence", () => {
  assert.match(build, /SOURCE_RESULT_FILE=.*affected-source-result[\s\S]*?source_status=/);
  assert.match(build, /build_status=\$\?/);
  assert.match(build, /post-build\/E2E: blocked by artifact-build/);
  assert.match(build, /已收集全部可执行检查结果/);
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
