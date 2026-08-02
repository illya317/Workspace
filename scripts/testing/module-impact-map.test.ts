import assert from "node:assert/strict";
import test from "node:test";

import {
  loadModuleImpactMap,
  resolveModuleImpact,
  validateModuleImpactMap,
} from "./module-impact-map";

const map = loadModuleImpactMap();

test("impact map is dependency metadata and has no risk classes", () => {
  assert.equal(map.schemaVersion, 2);
  assert.equal(Object.hasOwn(map, "policies"), false);
  assert.ok(map.rules.length > 0);
  assert.ok(map.rules.every((rule) => !Object.hasOwn(rule, "riskFloor")));
});

test("impact resolution reports owners and registered suites without choosing gates", () => {
  const impact = resolveModuleImpact(map, ["packages/work/server/projects.ts"]);
  assert.ok(impact.affectedModules.includes("work"));
  assert.equal(Object.hasOwn(impact, "riskFloor"), false);
  assert.ok(Array.isArray(impact.requiredSuites));
});

test("unmapped paths remain diagnostics and do not become an automatic risk tier", () => {
  const impact = resolveModuleImpact(map, ["unknown/new-module.ts"]);
  assert.equal(impact.failClosed, true);
  assert.deepEqual(impact.unmappedModulePaths, ["unknown/new-module.ts"]);
  assert.equal(Object.hasOwn(impact, "riskFloor"), false);
});

test("impact map rejects legacy risk fields", () => {
  const invalid = structuredClone(map) as unknown as Record<string, unknown>;
  const rules = invalid.rules as Array<Record<string, unknown>>;
  rules[0].riskFloor = "legacy";
  assert.throws(() => validateModuleImpactMap(invalid), /unknown keys/);
});
