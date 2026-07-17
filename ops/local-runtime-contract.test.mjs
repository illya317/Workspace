import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const runtime = read("scripts/runtime/run-with-repo-node.sh");
const entries = [
  ".githooks/pre-commit",
  ".githooks/pre-push",
  "ops/publish.sh",
  "ops/publish-cnb.sh",
  "ops/publish-hotfix.sh",
  "ops/release-to-cnb.sh",
];

test("local Git and release entries bootstrap the repository Node runtime", () => {
  for (const entry of entries) {
    const source = read(entry);
    assert.match(source, /WORKSPACE_REPO_RUNTIME_READY/);
    assert.match(source, /scripts\/runtime\/run-with-repo-node\.sh/);
  }
});

test("repository runtime selects Node and keeps temporary files in governed local paths", () => {
  assert.match(runtime, /\.node-version/);
  assert.match(runtime, /WORKSPACE_NODE_BINARY/);
  assert.match(runtime, /\.cache\/runtime-tmp/);
  assert.match(runtime, /export TMPDIR=/);
  assert.match(runtime, /export PATH=/);
  assert.match(runtime, /WORKSPACE_REPO_RUNTIME_READY=1/);
  const runtimePath = fileURLToPath(new URL("../scripts/runtime/run-with-repo-node.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", runtimePath], {
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("package metadata declares the same Node major as .node-version", () => {
  const packageJson = JSON.parse(read("package.json"));
  const requiredMajor = read(".node-version").trim();
  assert.equal(packageJson.engines?.node, `${requiredMajor}.x`);
});

test("repository scripts avoid the tsx CLI IPC server", () => {
  const packageJson = JSON.parse(read("package.json"));
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    assert.equal(command.includes("npx tsx"), false, `${name} uses npx tsx`);
    assert.equal(command.startsWith("tsx "), false, `${name} starts with tsx`);
    assert.equal(command.includes("-- tsx "), false, `${name} runs tsx through a lock wrapper`);
    assert.equal(command.includes("&& tsx "), false, `${name} chains tsx directly`);
  }

  assert.doesNotMatch(read("scripts/check/run-domain-validation-changed.js"), /spawnSync\(["']npx["'], \[["']tsx["']/);
  assert.doesNotMatch(read("ops/build-standalone-artifact.sh"), /\bnpx\s+tsx\b/);
  assert.match(read("scripts/check/with-check-lock.js"), /commandRest\.includes\("--import"\)/);
});

test("Playwright process cleanup skips only a sandbox EPERM", () => {
  const source = read("scripts/check/check-playwright-processes.ts");
  assert.match(source, /\.code === "EPERM"/);
  assert.match(source, /process\.exit\(0\)/);
  assert.match(source, /Unable to inspect the process table/);
  assert.match(source, /process\.exitCode = 1/);
});
