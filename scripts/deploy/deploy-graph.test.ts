import assert from "node:assert/strict";
import test from "node:test";

import { deployUnitBlueprints } from "./deploy-unit-spec";
import { resolveDeployGraph, summarizeDeployGraph, validateRouteOwnership } from "./deploy-graph";

const graph = resolveDeployGraph();

test("deploy graph classifies every canonical registry and impact module exactly once", () => {
  const summary = summarizeDeployGraph(graph);
  assert.equal(summary.deployUnitCount, 13);
  assert.equal(summary.activeUnitCount, 13);
  assert.equal(summary.candidateUnitCount, 0);
  assert.equal(summary.plannedUnitCount, 0);
  assert.deepEqual(summary.frozenUnitIds, []);
  assert.equal(summary.contributorEdgeCount, 0);
  assert.deepEqual(graph.sharedImpactModules, ["core", "platform"]);
  assert.equal(summary.blueGreenApplicationConnections, 98);
  assert.equal(summary.reservedControlPlaneConnections, 20);
  assert.ok(
    summary.blueGreenApplicationConnections + summary.reservedControlPlaneConnections
      <= graph.lifecycle.connectionBudget.minimumPostgresqlMaxConnections,
  );
});

test("routes and APIs are derived from the product registry rather than copied into blueprints", () => {
  const finance = graph.units.find((unit) => unit.id === "finance");
  assert.ok(finance);
  assert.deepEqual(finance.moduleKeys, ["finance"]);
  assert.deepEqual(finance.moduleLabels, ["财务管理"]);
  assert.equal(Object.hasOwn(deployUnitBlueprints.find((unit) => unit.id === "finance") ?? {}, "pageRoutes"), false);
  assert.ok(finance.pageRoutes.includes("/finance"));
  assert.ok(finance.pageRoutes.includes("/finance/statements"));
  assert.ok(finance.apiPrefixes.includes("/api/modules/finance/ledger"));

  const shell = graph.units.find((unit) => unit.id === "workspace-shell");
  assert.ok(shell);
  assert.ok(shell.pageRoutes.includes("/"));
  assert.ok(shell.pageRoutes.includes("/settings"));
  assert.ok(shell.apiPrefixes.includes("/api/auth/me"));
  assert.equal(
    shell.runtimeDependencies.find((dependency) => dependency.unitId === "work")?.protocol,
    "signed-internal-rpc",
  );

  const assistant = graph.units.find((unit) => unit.id === "assistant");
  assert.ok(assistant);
  assert.deepEqual(assistant.moduleLabels, ["智能体"]);
  assert.deepEqual(assistant.pageRoutes, ["/agent"]);
  assert.ok(assistant.apiPrefixes.includes("/api/agent"));
});

test("compiler closure follows project references and excludes the monolithic App project", () => {
  const finance = graph.units.find((unit) => unit.id === "finance");
  assert.ok(finance);
  assert.deepEqual(finance.compilerProjects, [
    "packages/core/tsconfig.json",
    "packages/finance/tsconfig.json",
    "packages/platform/tsconfig.json",
    "tsconfig.prisma-client.json",
  ]);
  assert.equal(finance.compilerProjects.includes("tsconfig.app.json"), false);
  assert.deepEqual(finance.checks.typecheckScopes, ["app-finance", "finance"]);
  assert.ok(finance.checks.e2eSuites.includes("finance-analysis-read"));
  assert.equal(finance.checks.unmatchedChangePolicy, "fail-closed");
});

test("all resolved runtime claims are conflict-free and contributors point at real units", () => {
  validateRouteOwnership(graph.units);
  const unitIds = new Set(graph.units.map((unit) => unit.id));
  for (const edge of graph.contributorEdges) {
    assert.ok(unitIds.has(edge.sourceUnitId));
    assert.ok(unitIds.has(edge.targetUnitId));
    assert.notEqual(edge.sourceUnitId, edge.targetUnitId);
    assert.ok(edge.files.length > 0);
  }
});

test("duplicate registry ownership and runtime ports fail closed", () => {
  const duplicateRegistry = deployUnitBlueprints.map((unit) => (
    unit.id === "finance"
      ? { ...unit, registryPackages: ["@workspace/finance", "@workspace/external"] }
      : unit
  ));
  assert.throws(
    () => resolveDeployGraph({ blueprints: duplicateRegistry }),
    /Registry package @workspace\/external is owned by both finance and external/,
  );

  const duplicatePort = deployUnitBlueprints.map((unit) => (
    unit.id === "finance"
      ? {
        ...unit,
        runtime: {
          ...unit.runtime,
          slots: { ...unit.runtime.slots, blue: { port: 3200 } },
        },
      }
      : unit
  ));
  assert.throws(
    () => resolveDeployGraph({ blueprints: duplicatePort }),
    /Runtime port 3200 is shared by workspace-shell:blue and finance:blue/,
  );
});

test("full-fleet blue-green database pools stay inside the reserved server budget", () => {
  const overBudget = deployUnitBlueprints.map((unit) => (
    unit.id === "work"
      ? { ...unit, runtime: { ...unit.runtime, capacity: { ...unit.runtime.capacity, databasePoolMax: 20 } } }
      : unit
  ));
  assert.throws(
    () => resolveDeployGraph({ blueprints: overBudget }),
    /above the application budget/,
  );
});

test("cross-unit route overlap fails closed", () => {
  const runtime = {
    engine: "next-standalone" as const,
    appRoot: "apps/example",
    processName: "example",
    slots: {
      blue: { port: 4000 },
      green: { port: 4100 },
    },
    assetPrefix: null,
    healthPath: "/api/internal/health" as const,
    versionPath: "/api/settings/version" as const,
    capacity: {
      memoryMiB: null,
      databasePoolMax: null,
      blueGreenReplicaMultiplier: 2 as const,
    },
    slo: {
      availabilityPercent: 99.9,
      p95LatencyMs: 1500,
      maximumErrorRatePercent: 1,
      canaryObservationMinutes: 15,
      recoveryTimeObjectiveMinutes: 30,
      recoveryPointObjectiveMinutes: 5,
    },
  };
  assert.throws(() => validateRouteOwnership([
    { id: "left", pageRoutes: ["/finance"], apiPrefixes: [], runtime },
    {
      id: "right",
      pageRoutes: ["/finance/ledger"],
      apiPrefixes: [],
      runtime: {
        ...runtime,
        slots: { blue: { port: 4001 }, green: { port: 4101 } },
      },
    },
  ]), /Route ownership conflict/);
});

test("planned units cannot be promoted without an app root and allocated runtime budgets", () => {
  const activeAssistant = deployUnitBlueprints.map((unit) => (
    unit.id === "assistant"
      ? { ...unit, maturity: "active" as const, runtime: { ...unit.runtime, appRoot: "apps/missing-assistant" } }
      : unit
  ));
  assert.throws(
    () => resolveDeployGraph({ blueprints: activeAssistant }),
    /assistant is active but app root is missing: apps\/missing-assistant/,
  );
});
