import assert from "node:assert/strict";
import test from "node:test";

import { analyzeOperationsModules, parseOperationsModulePolicy } from "./operations-module-policy";
import { analyzeOperationsSize, parseOperationsSizePolicy } from "./operations-size-policy";

test("operations deployment modules have one owner and acyclic registered directions", async () => {
  const result = await analyzeOperationsModules(process.cwd());
  assert.deepEqual(result.violations, []);
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
