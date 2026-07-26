import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CoreUiComponentRegistration } from "../../packages/core/ui/registry/component-registry";
import { findSurfaceDeclareBoundaryWarnings } from "./surface-boundaries";

test("current Core UI declarations stay within their owning Surface contracts", () => {
  assert.deepEqual(findSurfaceDeclareBoundaryWarnings(), []);
});

test("an internal renderer with declares is rejected when it has no owner rule", () => {
  const registry: CoreUiComponentRegistration[] = [{
    name: "Toolbar",
    description: "Internal renderer",
    declares: [{ name: "search", description: "Invalid parallel declaration entry" }],
  }];

  assert.deepEqual(findSurfaceDeclareBoundaryWarnings(registry), [{
    surface: "Toolbar",
    declarePath: "*",
    reason: "missing declare boundary rule",
  }]);
});

test("UI gate hard-blocks Surface declaration ownership drift", () => {
  const source = readFileSync("scripts/arch/ui-gate.ts", "utf8");
  assert.match(source, /\["surface-declare-boundaries", checkSurfaceDeclareBoundaries\]/);
});
