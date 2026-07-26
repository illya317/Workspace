import assert from "node:assert/strict";
import test from "node:test";

import type { DeployGraph } from "./deploy-graph";
import { resolveDeployUnitImpact } from "./deploy-unit-impact";

function graph(): DeployGraph {
  const unit = (id: string, root: string, maturity: "candidate" | "planned" = "candidate") => ({
    id,
    kind: "business-l1" as const,
    maturity,
    coordination: "available" as const,
    registryPackages: [`@workspace/${id}`],
    moduleKeys: [id],
    moduleLabels: [id],
    impactModules: [id],
    privateSourceRoots: [root],
    pageRoutes: [`/${id}`],
    apiPrefixes: [`/api/modules/${id}`],
    compilerProjects: [`packages/${id}/tsconfig.json`],
    checks: { typecheckScopes: [id, `app-${id}`], e2eSuites: [], unmatchedChangePolicy: "fail-closed" as const },
    runtimeDependencies: [],
    runtime: {
      engine: "next-standalone" as const,
      appRoot: `apps/${id}`,
      processName: `workspace-${id}`,
      slots: { blue: { port: 4000 + id.length }, green: { port: 4100 + id.length } },
      assetPrefix: `/static/${id}`,
      healthPath: "/api/internal/health" as const,
      versionPath: "/api/settings/version" as const,
      capacity: { memoryMiB: 512, databasePoolMax: 2, blueGreenReplicaMultiplier: 2 as const },
      slo: {
        availabilityPercent: 99.9,
        p95LatencyMs: 1500,
        maximumErrorRatePercent: 1,
        canaryObservationMinutes: 15,
        recoveryTimeObjectiveMinutes: 30,
        recoveryPointObjectiveMinutes: 5,
      },
    },
  });
  return {
    schemaVersion: 1,
    lifecycle: {} as DeployGraph["lifecycle"],
    sharedImpactModules: ["core", "platform"],
    units: [
      unit("finance", "packages/finance/"),
      unit("work", "packages/work/", "planned"),
      unit("assistant", "app/api/agent/", "planned"),
      unit("external", "packages/external/"),
    ],
    contributorEdges: [
      { sourceUnitId: "work", targetUnitId: "finance", importedPackage: "@workspace/finance", files: ["packages/work/a.ts"] },
      { sourceUnitId: "assistant", targetUnitId: "work", importedPackage: "@workspace/work", files: ["app/api/agent/route.ts"] },
    ],
  };
}

test("private L1 changes include transitive runtime consumers", () => {
  const impact = resolveDeployUnitImpact(["packages/finance/server/ledger.ts"], graph());
  assert.deepEqual(impact.affectedUnitIds, ["assistant", "finance", "work"]);
  assert.deepEqual(impact.buildableUnitIds, ["finance"]);
  assert.deepEqual(impact.blockedPlannedUnitIds, ["assistant", "work"]);
  assert.equal(impact.fullTypecheckRequired, false);
});

test("independent private L1 changes remain isolated", () => {
  const impact = resolveDeployUnitImpact(["packages/external/ui/External.tsx"], graph());
  assert.deepEqual(impact.affectedUnitIds, ["external"]);
  assert.deepEqual(impact.typecheckScopes, ["app-external", "external"]);
});

test("Core, schema, and unknown code changes fan out and require the full graph", () => {
  for (const changedFile of ["packages/core/ui/Table.tsx", "prisma/schema.prisma", "scripts/new-runtime.ts"]) {
    const impact = resolveDeployUnitImpact([changedFile], graph());
    assert.deepEqual(impact.affectedUnitIds, ["assistant", "external", "finance", "work"]);
    assert.equal(impact.fullTypecheckRequired, true);
  }
  assert.equal(resolveDeployUnitImpact(["scripts/new-runtime.ts"], graph()).failClosed, true);
});

test("documentation does not trigger deploy-unit type or build work", () => {
  const impact = resolveDeployUnitImpact(["packages/finance/ARCHITECTURE.md", "docs/engineering/checks.md"], graph());
  assert.deepEqual(impact.affectedUnitIds, []);
  assert.deepEqual(impact.typecheckScopes, []);
});

test("an empty change set fails closed to the whole deploy graph", () => {
  const impact = resolveDeployUnitImpact([], graph());
  assert.deepEqual(impact.affectedUnitIds, ["assistant", "external", "finance", "work"]);
  assert.equal(impact.fullTypecheckRequired, true);
  assert.equal(impact.failClosed, true);
});
