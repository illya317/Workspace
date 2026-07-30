import assert from "node:assert/strict";
import test from "node:test";

import { selectedCommands } from "./run-affected-validation.mjs";

test("affected validation selects only lanes declared by the base/head plan", () => {
  const classification = {
    riskClass: "C2",
    runStatic: true,
    runNode: true,
    runType: true,
    runPostgresql: false,
    runE2e: true,
  };
  assert.deepEqual(selectedCommands(classification, "source"), [
    ["npm", ["run", "db:generate"]],
    ["npm", ["run", "lint:changed"]],
    ["npm", ["run", "domain:changed"]],
    ["npm", ["run", "db:migration:changed"]],
    ["npm", ["run", "test:node:affected"]],
    ["npm", ["run", "typecheck:affected"]],
  ]);
  assert.deepEqual(selectedCommands(classification, "post-build"), [
    ["bash", ["./ops/run-release-e2e.sh"]],
  ]);
  assert.deepEqual(selectedCommands(classification, "post-build", { deployUnitId: "finance" }), []);
});

test("documentation-only validation does not install or run code gates", () => {
  assert.deepEqual(selectedCommands({ riskClass: "C0", runStatic: true }, "source"), [
    ["node", ["scripts/check/check-architecture-docs.js"]],
  ]);
});
