import assert from "node:assert/strict";
import test from "node:test";

import { parseDeployUnitNavigationManifest } from "@workspace/core/routing";

import { createDeployUnitNavigationManifest } from "./deploy-navigation-manifest";

test("public navigation manifest is derived from the canonical deploy graph", () => {
  const manifest = createDeployUnitNavigationManifest();
  const finance = manifest.units.find((unit) => unit.id === "finance");
  const shell = manifest.units.find((unit) => unit.id === "workspace-shell");
  assert.ok(finance?.pagePrefixes.includes("/finance/statements"));
  assert.ok(shell?.pagePrefixes.includes("/portal"));
  assert.deepEqual(manifest.units.find((unit) => unit.id === "assistant")?.pagePrefixes, ["/agent"]);
  assert.deepEqual(parseDeployUnitNavigationManifest(JSON.stringify(manifest)), manifest);
});
