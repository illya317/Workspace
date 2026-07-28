import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeployUnitSourcePlan,
  runDeployUnitSourceChecks,
} from "./run-deploy-unit-source-checks.mjs";

const unit = {
  id: "hr",
  privateSourceRoots: ["app/(modules)/hr/", "packages/hr/", "app/layout.tsx"],
};

test("deploy unit source plan selects only private roots plus release protocol tests", () => {
  const plan = createDeployUnitSourcePlan({
    allTests: [
      "app/(modules)/finance/page.test.ts",
      "app/(modules)/hr/page.test.ts",
      "app/layout.tsx",
      "packages/hr/domain.test.ts",
      "scripts/ci/protocol.test.mjs",
    ],
    unit,
    protocolTests: ["scripts/ci/protocol.test.mjs"],
  });
  assert.deepEqual(plan.lintTargets, unit.privateSourceRoots);
  assert.deepEqual(plan.nodeTests, [
    "app/(modules)/hr/page.test.ts",
    "app/layout.tsx",
    "packages/hr/domain.test.ts",
    "scripts/ci/protocol.test.mjs",
  ]);
});

test("deploy unit source checks keep lint and node tests scoped and serial", () => {
  const calls = [];
  const statuses = [];
  const status = runDeployUnitSourceChecks("hr", {
    repositoryRoot: "/workspace",
    graph: { units: [unit] },
    allTests: ["packages/hr/domain.test.ts", "scripts/ci/protocol.test.mjs"],
    protocolTests: ["scripts/ci/protocol.test.mjs"],
    prepareCache() {},
    stdout: { write() {} },
    stderr: { write() {} },
    run(command, args) {
      calls.push([command, args]);
      return statuses.shift() ?? 0;
    },
    runTests(tests, options) {
      calls.push(["node:test", tests, options]);
      return 0;
    },
  });
  assert.equal(status, 0);
  assert.match(calls[0][0], /node_modules\/\.bin\/eslint$/);
  assert.deepEqual(calls[0][1].slice(-3), unit.privateSourceRoots);
  assert.deepEqual(calls[1][1], ["packages/hr/domain.test.ts", "scripts/ci/protocol.test.mjs"]);
});

test("deploy unit source checks stop before node tests when lint fails", () => {
  let ranTests = false;
  const status = runDeployUnitSourceChecks("hr", {
    repositoryRoot: "/workspace",
    graph: { units: [unit] },
    allTests: ["packages/hr/domain.test.ts", "scripts/ci/protocol.test.mjs"],
    protocolTests: ["scripts/ci/protocol.test.mjs"],
    prepareCache() {},
    stdout: { write() {} },
    stderr: { write() {} },
    run: () => 9,
    runTests: () => { ranTests = true; return 0; },
  });
  assert.equal(status, 9);
  assert.equal(ranTests, false);
});
