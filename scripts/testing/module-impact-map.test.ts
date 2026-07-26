import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  loadModuleImpactMap,
  resolveModuleImpact,
  validateModuleImpactMap,
} from "./module-impact-map";

const map = loadModuleImpactMap();

test("the checked-in impact map is valid and every registered spec exists", () => {
  assert.equal(map.schemaVersion, 1);
  assert.ok(map.modules.length > 0);
  assert.ok(map.rules.length > 0);

  for (const suite of map.suites) {
    for (const spec of suite.specs) {
      assert.equal(fs.existsSync(spec), true, `${suite.id} references missing spec ${spec}`);
    }
  }
});

test("account settings changes select save and reload coverage without failing closed", () => {
  const impact = resolveModuleImpact(map, [
    "packages/platform/ui/settings/AccountSettingsPanel.tsx",
  ]);

  assert.deepEqual(impact.requiredSuites, ["settings-account-save"]);
  assert.deepEqual(impact.matchedRuleIds, ["settings-account-save"]);
  assert.equal(impact.riskFloor, "C2");
  assert.equal(impact.failClosed, false);
});

test("broad platform settings pages fail closed when account-save does not cover them", () => {
  const changedPath = "packages/platform/ui/settings/pages.tsx";
  const impact = resolveModuleImpact(map, [changedPath]);

  assert.deepEqual(impact.affectedModules, ["platform"]);
  assert.deepEqual(impact.matchedRuleIds, []);
  assert.deepEqual(impact.requiredSuites, []);
  assert.deepEqual(impact.unmappedModulePaths, [changedPath]);
  assert.deepEqual(impact.unmappedWritePaths, [changedPath]);
  assert.equal(impact.riskFloor, "C3");
  assert.equal(impact.failClosed, true);
});

test("module write paths without a write-capable E2E mapping fail closed to C3", () => {
  const impact = resolveModuleImpact(map, [
    "app/api/modules/hr/roster/employees/route.ts",
  ]);

  assert.deepEqual(impact.affectedModules, ["hr"]);
  assert.deepEqual(impact.potentialWritePaths, [
    "app/api/modules/hr/roster/employees/route.ts",
  ]);
  assert.deepEqual(impact.unmappedWritePaths, [
    "app/api/modules/hr/roster/employees/route.ts",
  ]);
  assert.equal(impact.riskFloor, "C3");
  assert.equal(impact.failClosed, true);
});

test("finance read UI selects its focused suite", () => {
  const impact = resolveModuleImpact(map, [
    "packages/finance/ui/analysis/ManagementAnalysisClient.tsx",
  ]);

  assert.deepEqual(impact.requiredSuites, ["finance-analysis-read"]);
  assert.equal(impact.riskFloor, "C2");
  assert.equal(impact.failClosed, false);
});

test("registered route shells use the C2 module readiness fast path", () => {
  const impact = resolveModuleImpact(map, [
    "app/(modules)/hr/roster/page.tsx",
    "app/(modules)/work/project/page.tsx",
  ]);

  assert.deepEqual(impact.requiredSuites, ["module-readiness"]);
  assert.deepEqual(impact.matchedRuleIds, ["hr-readiness", "work-readiness"]);
  assert.deepEqual(impact.affectedModules, ["hr", "work"]);
  assert.equal(impact.riskFloor, "C2");
  assert.equal(impact.failClosed, false);
});

test("explicit read-only UI can use C2 while unclassified UI remains C3", () => {
  const readOnlyImpact = resolveModuleImpact(map, [
    "packages/work/ui/home/WorkHomePage.tsx",
  ]);
  assert.deepEqual(readOnlyImpact.requiredSuites, ["module-readiness"]);
  assert.equal(readOnlyImpact.riskFloor, "C2");
  assert.equal(readOnlyImpact.failClosed, false);

  const unclassifiedImpact = resolveModuleImpact(map, [
    "packages/work/ui/tabs/ProjectTab.tsx",
  ]);
  assert.deepEqual(unclassifiedImpact.unmappedWritePaths, [
    "packages/work/ui/tabs/ProjectTab.tsx",
  ]);
  assert.equal(unclassifiedImpact.riskFloor, "C3");
  assert.equal(unclassifiedImpact.failClosed, true);
});

test("finance server writes select the read suite but still fail closed", () => {
  const changedPath = "packages/finance/server/ledger/reclass-rules/mutations.ts";
  const impact = resolveModuleImpact(map, [changedPath]);

  assert.deepEqual(impact.requiredSuites, ["finance-ledger-read"]);
  assert.deepEqual(impact.unmappedWritePaths, [changedPath]);
  assert.equal(impact.riskFloor, "C3");
  assert.equal(impact.failClosed, true);
});

test("unknown and malformed paths fail closed instead of silently skipping tests", () => {
  const impact = resolveModuleImpact(map, [
    "packages/new-module/server/write.ts",
    "../outside.ts",
  ]);

  assert.deepEqual(impact.unmappedModulePaths, [
    "../outside.ts",
    "packages/new-module/server/write.ts",
  ]);
  assert.equal(impact.riskFloor, "C3");
  assert.equal(impact.failClosed, true);
});

test("root shell files are explicitly owned and fail closed without focused coverage", () => {
  const impact = resolveModuleImpact(map, ["app/layout.tsx", "app/page.tsx"]);
  assert.deepEqual(impact.affectedModules, ["shell"]);
  assert.deepEqual(impact.unmappedModulePaths, ["app/layout.tsx", "app/page.tsx"]);
  assert.equal(impact.riskFloor, "C3");
  assert.equal(impact.failClosed, true);
});

test("known modules without a coverage rule also fail closed", () => {
  const changedPath = "packages/hr/ui/profile/UnregisteredEditor.tsx";
  const impact = resolveModuleImpact(map, [changedPath]);

  assert.deepEqual(impact.affectedModules, ["hr"]);
  assert.deepEqual(impact.unmappedModulePaths, [changedPath]);
  assert.deepEqual(impact.requiredSuites, []);
  assert.equal(impact.riskFloor, "C3");
  assert.equal(impact.failClosed, true);
});

test("validation rejects duplicate ids and references to unknown suites", () => {
  const duplicateSuite = structuredClone(map);
  duplicateSuite.suites.push(structuredClone(duplicateSuite.suites[0]));
  assert.throws(
    () => validateModuleImpactMap(duplicateSuite),
    /duplicate id/,
  );

  const unknownSuite = structuredClone(map);
  unknownSuite.rules[0].requiredSuites = ["missing-suite"];
  assert.throws(
    () => validateModuleImpactMap(unknownSuite),
    /references unknown suite/,
  );

  const contradictoryRule = structuredClone(map);
  contradictoryRule.rules[0].traits = ["read-only", "write"];
  assert.throws(
    () => validateModuleImpactMap(contradictoryRule),
    /cannot be both read-only and write/,
  );
});
