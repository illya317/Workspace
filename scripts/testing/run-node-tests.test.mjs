import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  discoverNodeTests,
  groupNodeTestsByShard,
  main,
  nodeTestShardKey,
  selectAffectedNodeTests,
  selectNodeTests,
} from "./run-node-tests.mjs";

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
    "ops/build-standalone-artifact.test.mjs",
    "packages/example/domain.test.tsx",
    "packages/work/server/domain/work-plan-governance-validation.test.ts",
    "packages/work/ui/works/WorkReportPeriods.test.ts",
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
      "ops/build-standalone-artifact.test.mjs",
      "ops/nested/check.test.js",
      "packages/example/domain.test.tsx",
      "packages/work/server/domain/work-plan-governance-validation.test.ts",
      "packages/work/ui/works/WorkReportPeriods.test.ts",
      "scripts/check/action-contract-runtime.test.ts",
      "scripts/check/tool.test.cjs",
      "scripts/runtime/worker.test.mts",
    ]);
    assert.deepEqual(selectNodeTests(allTests, "tooling"), [
      "ops/build-standalone-artifact.test.mjs",
      "ops/nested/check.test.js",
      "scripts/check/tool.test.cjs",
    ]);
    assert.deepEqual(selectNodeTests(allTests, "behavior"), [
      "app/api/route.test.ts",
      "packages/example/domain.test.tsx",
      "packages/work/server/domain/work-plan-governance-validation.test.ts",
      "packages/work/ui/works/WorkReportPeriods.test.ts",
      "scripts/runtime/worker.test.mts",
    ]);
    assert.deepEqual(selectNodeTests(allTests, "contract"), [
      "scripts/check/action-contract-runtime.test.ts",
    ]);
    assert.deepEqual(selectNodeTests(allTests, "work-plan-governance"), [
      "packages/work/server/domain/work-plan-governance-validation.test.ts",
      "packages/work/ui/works/WorkReportPeriods.test.ts",
    ]);
    assert.equal(nodeTestShardKey("packages/work/value.test.ts"), "package.work");
    assert.equal(
      nodeTestShardKey("scripts/check/approval-authority-boundary.test.ts"),
      "scripts.check.repository",
    );
    assert.deepEqual(selectNodeTests(allTests, "shard", { shard: "ops" }), [
      "ops/build-standalone-artifact.test.mjs",
      "ops/nested/check.test.js",
    ]);
    assert.deepEqual(groupNodeTestsByShard(allTests).find((item) => item.key === "scripts.check")?.files, [
      "scripts/check/action-contract-runtime.test.ts",
      "scripts/check/tool.test.cjs",
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
      "ops/build-standalone-artifact.test.mjs",
      "ops/nested/check.test.js",
      "scripts/check/tool.test.cjs",
    ]);
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test("affected selection keeps changed packages, dependency closure, and matching tooling areas", () => {
  const tests = [
    "packages/core/value.test.ts",
    "packages/finance/server/ledger.test.ts",
    "packages/hr/server/roster.test.ts",
    "ops/release.test.mjs",
    "scripts/ci/classifier.test.mjs",
    "scripts/check/lint.test.mjs",
  ];
  assert.deepEqual(selectAffectedNodeTests(tests, {
    changedFiles: ["packages/core/value.ts", "scripts/ci/classifier.mjs"],
    affectedModules: ["finance", "hr"],
  }), [
    "packages/core/value.test.ts",
    "packages/finance/server/ledger.test.ts",
    "packages/hr/server/roster.test.ts",
    "scripts/ci/classifier.test.mjs",
  ]);
});

test("shared Core changes include every package consumer test", () => {
  const tests = [
    "packages/core/value.test.ts",
    "packages/finance/server/ledger.test.ts",
    "packages/hr/server/roster.test.ts",
    "ops/release.test.mjs",
  ];
  assert.deepEqual(selectAffectedNodeTests(tests, {
    changedFiles: ["packages/core/value.ts"],
  }), tests.slice(0, 3));
});
