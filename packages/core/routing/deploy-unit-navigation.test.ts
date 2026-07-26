import assert from "node:assert/strict";
import test from "node:test";

import {
  currentDeployUnitId,
  deployUnitIdForHref,
  parseDeployUnitNavigationManifest,
  resolveWorkspaceNavigationTarget,
  type DeployUnitNavigationManifest,
} from "./deploy-unit-navigation";

const manifest: DeployUnitNavigationManifest = {
  schemaVersion: 1,
  units: [
    { id: "workspace-shell", pagePrefixes: ["/", "/login", "/portal", "/settings"] },
    { id: "finance", pagePrefixes: ["/finance", "/finance/statements"] },
    { id: "capital-securities", pagePrefixes: ["/capital-securities"] },
  ],
};

test("parses only normalized, unique deploy-unit route manifests", () => {
  assert.deepEqual(parseDeployUnitNavigationManifest(JSON.stringify(manifest)), manifest);
  assert.equal(parseDeployUnitNavigationManifest("not-json"), null);
  assert.equal(parseDeployUnitNavigationManifest(JSON.stringify({
    schemaVersion: 1,
    units: [{ id: "finance", pagePrefixes: ["finance"] }],
  })), null);
  assert.equal(parseDeployUnitNavigationManifest(JSON.stringify({
    schemaVersion: 1,
    units: [
      { id: "finance", pagePrefixes: ["/finance"] },
      { id: "finance", pagePrefixes: ["/finance/statements"] },
    ],
  })), null);
});

test("classifies public and base-path-prefixed routes by the longest owner prefix", () => {
  assert.equal(deployUnitIdForHref("/finance/statements?period=2026", manifest), "finance");
  assert.equal(deployUnitIdForHref("/workspace/capital-securities/investors", manifest), "capital-securities");
  assert.equal(deployUnitIdForHref("/settings/account", manifest), "workspace-shell");
  assert.equal(deployUnitIdForHref("/unknown", manifest), null);
});

test("keeps monolith and same-zone navigation soft but crosses zones through the gateway", () => {
  assert.deepEqual(resolveWorkspaceNavigationTarget("/finance", {
    currentUnitId: null,
    manifest,
  }), { href: "/finance", mode: "soft", targetUnitId: null });
  assert.deepEqual(resolveWorkspaceNavigationTarget("/finance/ledger", {
    currentUnitId: "finance",
    manifest,
  }), { href: "/finance/ledger", mode: "soft", targetUnitId: "finance" });
  assert.deepEqual(resolveWorkspaceNavigationTarget("/portal", {
    currentUnitId: "finance",
    manifest,
  }), { href: "/workspace/portal", mode: "hard", targetUnitId: "workspace-shell" });
});

test("an independent zone fails safe to a hard navigation for unknown routes", () => {
  assert.deepEqual(resolveWorkspaceNavigationTarget("/future-module", {
    currentUnitId: "finance",
    manifest: null,
  }), { href: "/workspace/future-module", mode: "hard", targetUnitId: null });
  assert.equal(resolveWorkspaceNavigationTarget("https://example.com", {
    currentUnitId: "finance",
    manifest,
  }).mode, "external");
  assert.equal(currentDeployUnitId("not valid"), null);
  assert.equal(currentDeployUnitId("finance"), "finance");
});
