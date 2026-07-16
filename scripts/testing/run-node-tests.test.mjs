import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverNodeTests, main, selectNodeTests } from "./run-node-tests.mjs";

function writeFixture(repositoryRoot, relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, "// test fixture\n");
}

function testRepository() {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "run-node-tests-"));
  for (const relativePath of [
    "app/api/route.test.ts",
    "ops/nested/check.test.js",
    "ops/release-evidence.test.mjs",
    "packages/example/domain.test.tsx",
    "scripts/check/action-contract-runtime.test.ts",
    "scripts/check/tool.test.cjs",
    "scripts/runtime/worker.test.mts",
    "scripts/testing/not-a-test.ts",
  ]) writeFixture(repositoryRoot, relativePath);
  return repositoryRoot;
}

test("discovers ops tests recursively and classifies them as tooling deterministically", () => {
  const repositoryRoot = testRepository();
  try {
    const allTests = discoverNodeTests(repositoryRoot);
    assert.deepEqual(allTests, [
      "app/api/route.test.ts",
      "ops/nested/check.test.js",
      "ops/release-evidence.test.mjs",
      "packages/example/domain.test.tsx",
      "scripts/check/action-contract-runtime.test.ts",
      "scripts/check/tool.test.cjs",
      "scripts/runtime/worker.test.mts",
    ]);
    assert.deepEqual(selectNodeTests(allTests, "tooling"), [
      "ops/nested/check.test.js",
      "ops/release-evidence.test.mjs",
      "scripts/check/tool.test.cjs",
    ]);
    assert.deepEqual(selectNodeTests(allTests, "behavior"), [
      "app/api/route.test.ts",
      "packages/example/domain.test.tsx",
      "scripts/runtime/worker.test.mts",
    ]);
    assert.deepEqual(selectNodeTests(allTests, "contract"), [
      "scripts/check/action-contract-runtime.test.ts",
    ]);
    assert.throws(() => selectNodeTests(allTests, "unknown"), /Unknown node test suite/);
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test("tooling main passes the exact sorted ops and scripts test contract to node", () => {
  const repositoryRoot = testRepository();
  let invocation;
  const sink = { write() {} };
  try {
    const status = main(["tooling"], {
      repositoryRoot,
      stdout: sink,
      stderr: sink,
      spawn(command, args, options) {
        invocation = { command, args, options };
        return { status: 0 };
      },
    });
    assert.equal(status, 0);
    assert.equal(invocation.command, process.execPath);
    assert.equal(invocation.options.cwd, repositoryRoot);
    assert.deepEqual(invocation.args.slice(-3), [
      "ops/nested/check.test.js",
      "ops/release-evidence.test.mjs",
      "scripts/check/tool.test.cjs",
    ]);
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
