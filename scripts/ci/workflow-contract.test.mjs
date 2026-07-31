import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const releaseConfig = fs.readFileSync(new URL("../../ops/cnb-release.yml", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const preCommit = fs.readFileSync(new URL("../../.githooks/pre-commit", import.meta.url), "utf8");
const prePush = fs.readFileSync(new URL("../../.githooks/pre-push", import.meta.url), "utf8");
const codeowners = fs.readFileSync(new URL("../../.github/CODEOWNERS", import.meta.url), "utf8");
const packager = fs.readFileSync(new URL("../../ops/build-standalone-artifact.sh", import.meta.url), "utf8");

test("normal CI is lightweight changed-file validation with stale-run cancellation", () => {
  assert.match(workflow, /name: CI \/ changed/);
  assert.match(workflow, /run: npm run check:changed/);
  assert.match(workflow, /name: CI \/ required/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.doesNotMatch(workflow, /force_full|build-standalone|test:e2e/);
  assert.doesNotMatch(workflow, /\.cache\/types|\.cache\/tsbuild/);
  assert.match(releaseConfig, /\.cache\/types/);
  assert.match(releaseConfig, /\.cache\/tsbuild/);
});

test("workflow pins third-party actions and uses the repository Node contract", () => {
  const uses = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gm)].map((match) => match[1]);
  assert.ok(uses.length > 0);
  for (const reference of uses) assert.match(reference, /^[^@]+@[0-9a-f]{40}$/);
  assert.match(workflow, /node-version-file: \.node-version/);
  assert.doesNotMatch(workflow, /node-version:\s*\d+/);
});

test("agent-selected checks and staged checks are explicit interfaces", () => {
  assert.equal(packageJson.scripts["check:agent"], "node scripts/check/run-agent-check-plan.mjs");
  assert.equal(packageJson.scripts["check:push"], "npm run check:changed");
  assert.equal(packageJson.scripts["check:precommit"], "node scripts/check/run-staged-precommit.mjs");
  assert.match(preCommit, /exact staged-tree pre-commit checks/);
  assert.doesNotMatch(prePush, /PRE_PUSH_FULL|check:push:full/);
});

test("public runtime asset symlinks cannot leak into the canonical artifact", () => {
  assert.match(packager, /public\/company/);
  assert.match(packager, /public\/assets\/agent\/avatar/);
  assert.match(packager, /public\/assets\/user\/avatar/);
  assert.match(packager, /standalone public 目录包含未登记软链/);
});

test("quality executors and operations remain code-owner protected", () => {
  for (const pattern of [
    "/.github/",
    "/package.json",
    "/scripts/ci/",
    "/scripts/check/",
    "/scripts/arch/",
    "/scripts/testing/",
    "/ops/",
    "/docs/engineering/ops/",
  ]) {
    assert.ok(codeowners.split("\n").includes(`${pattern} @illya317`), `missing CODEOWNERS rule for ${pattern}`);
  }
});
