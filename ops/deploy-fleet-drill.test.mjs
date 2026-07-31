import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createGatewayGeneration } from "./gateway-generation.mjs";
import { rollbackDeployUnitState, writePrivateJson } from "./deploy-unit-release.mjs";

function activation(unit, slot, generation) {
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-activation",
    unitId: unit.id,
    slot,
    port: unit.runtime.slots[slot].port,
    releaseId: `${unit.id}-${generation}`,
    releaseDir: `/srv/workspace/deploy-units/${unit.id}/releases/${unit.id}-${generation}`,
    deploymentId: `${unit.id}-${generation}`,
    artifact: {
      sha256: Buffer.from(`${unit.id}:${generation}`).toString("hex").padEnd(64, "0").slice(0, 64),
      manifestSha256: Buffer.from(`${unit.id}:manifest:${generation}`).toString("hex").padEnd(64, "1").slice(0, 64),
    },
    receiptSha256: Buffer.from(`${unit.id}:receipt:${generation}`).toString("hex").padEnd(64, "2").slice(0, 64),
    activatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function state(unit, active, previous = null) {
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-state",
    unitId: unit.id,
    active,
    previous,
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

test("the 13-unit fleet switches one private L1 and rolls it back without moving other routes", () => {
  const graph = JSON.parse(execFileSync(process.execPath, [
    "--conditions=react-server",
    "--import", "tsx",
    "scripts/deploy/check-deploy-graph.ts",
    "--json",
  ], { encoding: "utf8" }));
  graph.units = graph.units.map((unit) => ({ ...unit, maturity: "active" }));
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-fleet-drill-"));
  const graphFile = path.join(root, "deploy-graph.json");
  const stateRoot = path.join(root, "states");
  const outputRoot = path.join(root, "gateway");
  mkdirSync(stateRoot);
  writePrivateJson(graphFile, graph);
  for (const unit of graph.units) {
    writePrivateJson(path.join(stateRoot, `${unit.id}.json`), state(unit, activation(unit, "blue", "v1")));
  }
  const initial = createGatewayGeneration({
    graphFile,
    stateRoot,
    outputRoot,
    generatedAt: "2026-07-25T01:00:00.000Z",
  });
  const finance = graph.units.find((unit) => unit.id === "finance");
  const currentFinance = JSON.parse(readFileSync(path.join(stateRoot, "finance.json"), "utf8"));
  const promotedFinance = state(finance, activation(finance, "green", "v2"), currentFinance.active);
  const promotedFile = path.join(root, "finance-promoted.json");
  writePrivateJson(promotedFile, promotedFinance);
  const promoted = createGatewayGeneration({
    graphFile,
    stateRoot,
    stateOverrides: { finance: promotedFile },
    outputRoot,
    generatedAt: "2026-07-25T02:00:00.000Z",
  });
  const promotedMap = JSON.parse(readFileSync(path.join(outputRoot, "generations", promoted.generationId, "route-map.json"), "utf8"));
  assert.equal(promotedMap.activeUnits.length, 13);
  assert.equal(promotedMap.activeUnits.find((unit) => unit.unitId === "finance").port, 3301);
  assert.ok(promotedMap.activeUnits.filter((unit) => unit.unitId !== "finance").every((unit) => unit.slot === "blue"));

  const rollbackFile = path.join(root, "finance-rollback.json");
  writePrivateJson(rollbackFile, rollbackDeployUnitState(promotedFinance, "2026-07-25T03:00:00.000Z"));
  const rolledBack = createGatewayGeneration({
    graphFile,
    stateRoot,
    stateOverrides: { finance: rollbackFile },
    outputRoot,
    generatedAt: "2026-07-25T03:00:00.000Z",
  });
  assert.notEqual(rolledBack.generationId, promoted.generationId);
  const initialMap = JSON.parse(readFileSync(path.join(outputRoot, "generations", initial.generationId, "route-map.json"), "utf8"));
  const rolledBackMap = JSON.parse(readFileSync(path.join(outputRoot, "generations", rolledBack.generationId, "route-map.json"), "utf8"));
  assert.deepEqual(
    rolledBackMap.activeUnits.map(({ unitId, slot, port, artifact }) => ({ unitId, slot, port, artifact })),
    initialMap.activeUnits.map(({ unitId, slot, port, artifact }) => ({ unitId, slot, port, artifact })),
  );
});
