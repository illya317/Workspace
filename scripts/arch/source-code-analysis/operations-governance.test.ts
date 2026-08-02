import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { analyzeOperationsModules, parseOperationsModulePolicy } from "./operations-module-policy";
import { analyzeOperationsSize, parseOperationsSizePolicy } from "./operations-size-policy";

test("operations deployment modules have one owner and acyclic registered directions", async () => {
  const result = await analyzeOperationsModules(process.cwd());
  assert.deepEqual(result.violations, []);
});

test("release worktree and deploy helpers have one owner with explicit composition dependencies", () => {
  const policy = parseOperationsModulePolicy(JSON.parse(readFileSync(
    new URL("./operations-module-policy.json", import.meta.url), "utf8",
  )));
  assert.deepEqual(policy.modules.find((module) => module.name === "release-deploy"), {
    name: "release-deploy",
    include: ["ops/release/deploy/"],
    allowedDependencies: ["release-candidate", "release-control", "release-readiness"],
  });
  for (const helper of [
    "ops/release/deploy/publish-entry-preflight.sh",
    "ops/release/deploy/publish-cnb-preflight.sh",
    "ops/release/deploy/unit-preflight.mjs",
  ]) {
    const owners = policy.modules.filter((module) => module.include.some((entry) =>
      entry.endsWith("/") ? helper.startsWith(entry) : helper === entry));
    assert.deepEqual(owners.map((owner) => owner.name), ["release-deploy"]);
  }
  assert.ok(policy.modules.find((module) => module.name === "orchestration")
    ?.allowedDependencies.includes("release-deploy"));
  assert.deepEqual(policy.modules.find((module) => module.name === "release-worktree"), {
    name: "release-worktree",
    include: ["ops/release/worktree/"],
    allowedDependencies: [],
  });
  assert.deepEqual(policy.modules.find((module) => module.name === "transport")?.include, [
    "ops/deploy/transport-preflight.sh",
    "ops/deploy/transport.sh",
  ]);
  assert.deepEqual(policy.modules.find((module) => module.name === "deploy-contract-test")?.allowedDependencies, [
    "transport",
  ]);
});

test("operations scripts cannot grow past their current debt cap", async () => {
  const result = await analyzeOperationsSize(process.cwd());
  assert.deepEqual(result.violations, []);
});

test("operations policies reject unsorted directions and baseline expansion shapes", () => {
  assert.throws(() => parseOperationsModulePolicy({
    schemaVersion: 1,
    modules: [
      { name: "a", include: ["ops/deploy/a.sh"], allowedDependencies: ["c", "b"] },
      { name: "b", include: ["ops/deploy/b.sh"], allowedDependencies: [] },
      { name: "c", include: ["ops/deploy/c.sh"], allowedDependencies: [] },
    ],
  }), /dependencies must be sorted/);
  assert.throws(() => parseOperationsSizePolicy({
    schemaVersion: 1,
    defaultMaxLines: 450,
    legacyCaps: { "outside/file.sh": 500 },
  }), /invalid operations legacy cap/);
});
