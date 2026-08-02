import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_RUNTIME_SCRIPT_REGISTRATIONS,
  sourceModuleDeclarationsForPath,
} from "./declarations";

function declaredModuleKeys(relativePath: string) {
  return sourceModuleDeclarationsForPath(relativePath).map((declaration) => declaration.key);
}

test("production runtime owns ops and release/runtime script source", () => {
  assert.deepEqual(declaredModuleKeys("ops/cnb-ci.sh"), ["operations"]);
  assert.deepEqual(declaredModuleKeys("ops/cnb-release.sh"), ["operations"]);
  assert.deepEqual(declaredModuleKeys("ops/deploy-image.sh"), ["operations"]);
  assert.deepEqual(declaredModuleKeys("scripts/runtime/wecom-agent-bot.mjs"), ["operations"]);
  assert.deepEqual(declaredModuleKeys("scripts/migrate/sqlite-to-postgresql.mjs"), ["operations"]);
  assert.deepEqual(declaredModuleKeys("scripts/import/import-product-master.mjs"), ["operations"]);
  assert.deepEqual(declaredModuleKeys("scripts/repair/repair-finance-consolidation-entry.mjs"), ["operations"]);
  assert.deepEqual(declaredModuleKeys("scripts/check/check-prisma-deploy-status.js"), ["operations"]);
  assert.deepEqual(declaredModuleKeys("scripts/testing/module-impact-map.ts"), ["operations"]);
});

test("every registered production script resolves only to production runtime", () => {
  for (const registeredPath of PRODUCTION_RUNTIME_SCRIPT_REGISTRATIONS) {
    assert.deepEqual(declaredModuleKeys(registeredPath), ["operations"], registeredPath);
  }
});

test("development governance owns the remaining scripts, e2e, and engineering config", () => {
  assert.deepEqual(declaredModuleKeys("scripts/check/check-domain.js"), ["tooling"]);
  assert.deepEqual(declaredModuleKeys("scripts/runtime/start-local-dev.mjs"), ["tooling"]);
  assert.deepEqual(declaredModuleKeys("e2e/settings/module-management.spec.ts"), ["tooling"]);
  assert.deepEqual(declaredModuleKeys("next.config.ts"), ["tooling"]);
  assert.deepEqual(declaredModuleKeys("playwright.config.ts"), ["tooling"]);
  assert.deepEqual(declaredModuleKeys("dependency-cruiser.config.cjs"), ["tooling"]);
});

test("root runtime instrumentation belongs to the application shell", () => {
  assert.deepEqual(declaredModuleKeys("instrumentation.ts"), ["application-shell"]);
});

test("public module APIs remain owned by their business module", () => {
  assert.deepEqual(declaredModuleKeys("app/api/open/v1/hr/generated/roster/route.ts"), ["hr"]);
});
