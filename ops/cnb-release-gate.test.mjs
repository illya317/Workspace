import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("./run-cnb-release-gate.sh", import.meta.url), "utf8");
const build = readFileSync(new URL("./build-cnb-release-target.sh", import.meta.url), "utf8");
const ci = readFileSync(new URL("./run-release-ci.sh", import.meta.url), "utf8");
const publish = readFileSync(new URL("./publish.sh", import.meta.url), "utf8");
const deploy = readFileSync(new URL("./deploy-cnb-release-target.sh", import.meta.url), "utf8");
const e2e = readFileSync(new URL("./run-release-e2e.sh", import.meta.url), "utf8");

test("source gate freezes one CI-run task graph and emits evidence only after aggregate success", () => {
  assert.match(gate, /--run-id "\$CHECK_SOURCE_RUN_ID"/);
  assert.match(gate, /--task-graph "\$CHECK_TASK_GRAPH_FILE"/);
  assert.match(gate, /--run-id "\$CHECK_SOURCE_RUN_ID"/);
  assert.match(gate, /source-validation-\$TARGET_ID-\$CHECK_SOURCE_RUN_ID\.json/);
  assert.match(gate, /source_status=\$\?/);
  assert.ok(gate.indexOf("source_status=$?") < gate.indexOf("source-create"));
  assert.doesNotMatch(gate, /build-standalone-artifact|build-deploy-unit-artifact|CHECK_SOURCE_PLAN_ID/);
});

test("artifact task restores exact cache or compiles one target once", () => {
  assert.match(build, /cnb-release-artifact-cache\.sh restore/);
  assert.equal(build.match(/build-standalone-artifact\.sh/g)?.length, 1);
  assert.equal(build.match(/build-deploy-unit-artifact\.sh/g)?.length, 1);
  assert.ok(build.indexOf("build_status=$?") < build.indexOf("artifact-create"));
  assert.ok(build.indexOf("artifact-create") < build.indexOf("cnb-release-artifact-cache.sh store"));
  assert.doesNotMatch(build, /full-source-validation|CHECK_SOURCE_PLAN_ID/);
});

test("one CI invocation runs source and artifact tasks and reports both statuses", () => {
  assert.match(ci, /run-cnb-release-gate\.sh[\s\S]*?source_status=\$\?[\s\S]*?build-cnb-release-target\.sh[\s\S]*?artifact_status=\$\?/);
  assert.match(ci, /rehearse-artifact\.mjs[\s\S]*?rehearsal_status=\$\?/);
  assert.match(ci, /未签发 Ready Artifact/);
  assert.match(ci, /rehearsal-\$TARGET_ID-\$TARGET_MODE-\$CI_RUN_ID-\$RELEASE_CONFIGURATION_DIGEST\.json/);
});

test("one channel-neutral CI database sandbox migrates before source, artifact, and rehearsal", () => {
  assert.match(publish, /ci-database-sandbox\.mjs[\s\S]*?run-release-ci\.sh/);
  assert.match(publish, /RELEASE_CI_DATABASE_CA_FILE/);
  assert.doesNotMatch(publish, /CI database CA is required/);
  assert.match(ci, /RELEASE_CI_DATABASE_STATUS/);
  assert.match(ci, /database=\$DATABASE_STATUS/);
  assert.match(ci, /artifact_status.*DATABASE_STATUS.*rehearse-artifact\.mjs/s);
  assert.match(ci, /rm -f "\$REHEARSAL_FILE"/);
});

test("deployment requires Ready evidence and contains no compilation fallback", () => {
  assert.match(deploy, /ready-artifact\.mjs verify/);
  assert.match(deploy, /RELEASE_SOURCE_RESULT_FILE/);
  assert.match(deploy, /CHECK_TASK_GRAPH_FILE/);
  assert.doesNotMatch(deploy, /build-standalone-artifact|build-deploy-unit-artifact|npm run/);
});

test("release E2E owns one disposable database and can run the selected spec set", () => {
  assert.match(e2e, /PLAYWRIGHT_BROWSERS_PATH=.*\.cache\/release-check\/playwright/);
  assert.match(e2e, /CREATE DATABASE/);
  assert.match(e2e, /DROP DATABASE IF EXISTS/);
  assert.match(e2e, /run-selected-e2e\.mjs/);
  assert.match(e2e, /playwright:processes:check/);
});
