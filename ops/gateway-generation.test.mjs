import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertGatewayGeneration,
  createGatewayGeneration,
} from "./gateway-generation.mjs";
import { writePrivateJson } from "./deploy-unit-release.mjs";

function graph(financeMaturity = "active", shellMaturity = "planned") {
  return {
    schemaVersion: 1,
    lifecycle: {
      gateway: {
        basePath: "/workspace",
        legacyFallback: { host: "127.0.0.1", port: 3000, processName: "workspace" },
      },
    },
    units: [
      {
        id: "workspace-shell",
        kind: "workspace-shell",
        maturity: shellMaturity,
        pageRoutes: ["/", "/portal"],
        apiPrefixes: ["/api/auth"],
        runtime: {
          slots: { blue: { port: 3200 }, green: { port: 3300 } },
          assetPrefix: null,
        },
      },
      {
        id: "finance",
        kind: "business-l1",
        maturity: financeMaturity,
        pageRoutes: ["/finance", "/finance/statements"],
        apiPrefixes: ["/api/modules/finance", "/api/modules/finance/ledger"],
        runtime: {
          slots: { blue: { port: 3201 }, green: { port: 3301 } },
          assetPrefix: "/workspace-static/finance",
        },
      },
    ],
  };
}

function activation(slot = "blue") {
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-activation",
    unitId: "finance",
    slot,
    port: slot === "blue" ? 3201 : 3301,
    releaseId: `finance-${slot}`,
    releaseDir: `/srv/workspace/deploy-units/finance/releases/finance-${slot}`,
    deploymentId: `finance-${slot}`,
    artifact: { sha256: "a".repeat(64), manifestSha256: "b".repeat(64) },
    receiptSha256: slot === "blue" ? "c".repeat(64) : "d".repeat(64),
    activatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function state(active, previous = null) {
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-state",
    unitId: "finance",
    active,
    previous,
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-gateway-generation-"));
  const graphFile = path.join(root, "deploy-graph.json");
  const stateRoot = path.join(root, "current-states");
  const outputRoot = path.join(root, "gateway");
  mkdirSync(stateRoot);
  writePrivateJson(graphFile, graph());
  writePrivateJson(path.join(stateRoot, "finance.json"), state(activation()));
  return { root, graphFile, stateRoot, outputRoot };
}

test("generation binds route map, active state set, Nginx include, and legacy fallback", () => {
  const files = fixture();
  const manifest = createGatewayGeneration({
    ...files,
    generatedAt: "2026-07-25T01:00:00.000Z",
  });
  const generationRoot = path.join(files.outputRoot, "generations", manifest.generationId);
  assert.deepEqual(assertGatewayGeneration(generationRoot), manifest);
  const routeMap = JSON.parse(readFileSync(path.join(generationRoot, "route-map.json"), "utf8"));
  assert.equal(routeMap.fallback.unitId, "legacy-monolith");
  assert.equal(routeMap.routes.filter((route) => route.kind === "page").length, 1);
  assert.equal(routeMap.routes.find((route) => route.kind === "page").prefix, "/workspace/finance");
  assert.equal(routeMap.routes.find((route) => route.kind === "api").prefix, "/workspace/api/modules/finance");
  assert.equal(routeMap.routes.find((route) => route.kind === "asset").prefix, "/workspace-static/finance");
  const nginx = readFileSync(path.join(generationRoot, "workspace-gateway.conf"), "utf8");
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3201;/);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
});

test("an active unit without deployed state stays on the legacy Full fallback", () => {
  const files = fixture();
  writePrivateJson(files.graphFile, graph("active", "active"));
  const manifest = createGatewayGeneration({
    ...files,
    generatedAt: "2026-07-25T01:00:00.000Z",
  });
  const routeMap = JSON.parse(readFileSync(path.join(files.outputRoot, "generations", manifest.generationId, "route-map.json"), "utf8"));
  assert.equal(routeMap.fallback.unitId, "legacy-monolith");
  assert.deepEqual(routeMap.activeUnits.map((unit) => unit.unitId), ["finance"]);
});

test("state override produces a new immutable generation for cutover or rollback", () => {
  const files = fixture();
  const first = createGatewayGeneration({ ...files, generatedAt: "2026-07-25T01:00:00.000Z" });
  const override = path.join(files.root, "finance-green.json");
  writePrivateJson(override, state(activation("green"), activation("blue")));
  const second = createGatewayGeneration({
    ...files,
    stateOverrides: { finance: override },
    generatedAt: "2026-07-25T02:00:00.000Z",
  });
  assert.notEqual(first.generationId, second.generationId);
  const routeMap = JSON.parse(readFileSync(path.join(files.outputRoot, "generations", second.generationId, "route-map.json"), "utf8"));
  assert.equal(routeMap.routes.at(0).target.port, 3301);
  assert.equal(routeMap.activeUnits.at(0).slot, "green");
});

test("fallback-only generation atomically revokes every independent unit override", () => {
  const files = fixture();
  const manifest = createGatewayGeneration({
    ...files,
    fallbackOnly: true,
    generatedAt: "2026-07-25T02:00:00.000Z",
  });
  const generationRoot = path.join(files.outputRoot, "generations", manifest.generationId);
  const routeMap = JSON.parse(readFileSync(path.join(generationRoot, "route-map.json"), "utf8"));
  assert.deepEqual(routeMap.activeUnits, []);
  assert.deepEqual(routeMap.routes, []);
  assert.equal(routeMap.fallback.unitId, "legacy-monolith");
  assert.equal(routeMap.fallback.port, 3000);
  assert.equal((readFileSync(path.join(generationRoot, "workspace-gateway.conf"), "utf8").match(/proxy_pass/g) ?? []).length, 2);
});

test("create-fallback CLI requires no current unit state directory", () => {
  const files = fixture();
  const result = spawnSync(process.execPath, [
    new URL("./gateway-generation.mjs", import.meta.url).pathname,
    "create-fallback",
    "--graph", files.graphFile,
    "--output-root", files.outputRoot,
    "--generated-at", "2026-07-25T02:00:00.000Z",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const generationId = result.stdout.trim();
  const routeMap = JSON.parse(readFileSync(path.join(files.outputRoot, "generations", generationId, "route-map.json"), "utf8"));
  assert.deepEqual(routeMap.activeUnits, []);
});

test("planned units and wrong slot ports fail closed", () => {
  const files = fixture();
  writePrivateJson(files.graphFile, graph("planned"));
  assert.throws(() => createGatewayGeneration({
    ...files,
    stateOverrides: { finance: path.join(files.stateRoot, "finance.json") },
    generatedAt: "2026-07-25T01:00:00.000Z",
  }), /is planned and cannot enter/);

  writePrivateJson(files.graphFile, graph("active"));
  writePrivateJson(path.join(files.stateRoot, "finance.json"), state({ ...activation(), port: 9999 }));
  assert.throws(() => createGatewayGeneration({
    ...files,
    generatedAt: "2026-07-25T01:00:00.000Z",
  }), /active port mismatch/);
});

test("tampering any generated file invalidates the generation", () => {
  const files = fixture();
  const manifest = createGatewayGeneration({ ...files, generatedAt: "2026-07-25T01:00:00.000Z" });
  const generationRoot = path.join(files.outputRoot, "generations", manifest.generationId);
  writeFileSync(path.join(generationRoot, "workspace-gateway.conf"), "tampered\n");
  assert.throws(() => assertGatewayGeneration(generationRoot), /file drifted/);
});
