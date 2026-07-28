import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("./run-cnb-release-gate.sh", import.meta.url), "utf8");
const e2e = readFileSync(new URL("./run-release-e2e.sh", import.meta.url), "utf8");

test("CNB release gate is target-independent and collects CI plus E2E results", () => {
  assert.doesNotMatch(gate, /DEPLOY_UNIT_ID|DEPLOY_UNIT_MODE/);
  assert.match(gate, /set \+e[\s\S]*npm run check:ci[\s\S]*ci_status=\$\?/);
  assert.match(gate, /set \+e[\s\S]*run-release-e2e\.sh[\s\S]*e2e_status=\$\?/);
  assert.match(gate, /CNB 公共发布门禁完整结果/);
  assert.ok(
    gate.indexOf('if [ "$ci_status" != "0" ] || [ "$e2e_status" != "0" ]')
      < gate.indexOf("release-gate-receipt.mjs cnb-create"),
  );
});

test("CNB release gate keeps build failure explicit and never fabricates E2E", () => {
  assert.match(gate, /\.next\/BUILD_ID/);
  assert.match(gate, /production build 未生成或 BUILD_ID 不匹配/);
  assert.match(gate, /e2e_status=90/);
});

test("release E2E owns one disposable database and always cleans processes", () => {
  assert.match(e2e, /PLAYWRIGHT_BROWSERS_PATH=.*\.cache\/release-check\/playwright/);
  assert.ok(e2e.indexOf("PLAYWRIGHT_BROWSERS_PATH") < e2e.indexOf("playwright install --with-deps chromium"));
  assert.match(e2e, /CREATE DATABASE/);
  assert.match(e2e, /DROP DATABASE IF EXISTS/);
  assert.match(e2e, /prisma migrate deploy/);
  assert.match(e2e, /db:seed:resources/);
  assert.match(e2e, /PLAYWRIGHT_STANDALONE_SKIP_BUILD=1/);
  assert.match(e2e, /playwright:processes:check/);
});
