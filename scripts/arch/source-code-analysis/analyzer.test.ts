import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SOURCE_CODE_ANALYSIS_ROLES } from "../../../packages/platform/source-code-analysis-contract";
import { analyzeSourceCode, classifySourceCodeRole, detectMixedResponsibilityRoles } from "./analyzer";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

test("source code analysis assigns every governed file to one declared module and role", async () => {
  const snapshot = await analyzeSourceCode(repositoryRoot);

  assert.equal(snapshot.summary.unclassifiedFileCount, 0);
  assert.equal(snapshot.summary.ambiguousFileCount, 0);
  assert.equal(snapshot.summary.missingInterfaceCount, 0);
  assert.equal(snapshot.summary.dependencyCycleCount, 0);
  assert.equal(snapshot.summary.invalidDependencyDirectionCount, 0);
  assert.equal(snapshot.summary.newUnclassifiedCapabilityFileCount, 0);
  assert.equal(snapshot.summary.ambiguousCapabilityFileCount, 0);
  assert.equal(snapshot.summary.newCapabilityContractViolationCount, 0);
  assert.equal(snapshot.summary.staleCapabilityContractBaselineCount, 0);
  assert.equal(snapshot.summary.mixedResponsibilityFileCount, 0);
  assert.equal(snapshot.summary.reciprocalRoleDependencyCount, snapshot.reciprocalRoleDependencies.length);
  assert.equal(
    snapshot.summary.runtimeReciprocalRoleDependencyCount,
    snapshot.reciprocalRoleDependencies.filter((dependency) => dependency.classification === "runtime").length,
  );
  assert.equal(
    snapshot.summary.typeAssistedReciprocalRoleDependencyCount,
    snapshot.reciprocalRoleDependencies.filter((dependency) => dependency.classification === "type-assisted").length,
  );
  assert.ok(snapshot.reciprocalRoleDependencies.every((dependency) =>
    dependency.left.moduleKey !== dependency.right.moduleKey || dependency.left.role !== dependency.right.role));
  assert.ok(snapshot.reciprocalRoleDependencies.every((dependency) =>
    dependency.left.role !== "test"
    && dependency.left.role !== "tooling"
    && dependency.right.role !== "test"
    && dependency.right.role !== "tooling"));
  assert.equal(snapshot.summary.dependencyFileCycleCount, snapshot.dependencyFileCycles.length);
  assert.equal(snapshot.summary.runtimeDependencyFileCycleCount, 0);
  assert.equal(snapshot.summary.typeAssistedDependencyFileCycleCount, 0);
  assert.deepEqual(snapshot.dependencyFileCycles, []);
  assert.deepEqual(snapshot.dependencyCycles, []);
  assert.deepEqual(snapshot.invalidDependencyDirections, []);
  assert.equal(snapshot.summary.coveragePercent, 100);
  assert.ok(snapshot.modules.some((module) => module.key === "settings"));
  assert.ok(snapshot.modules.some((module) => module.key === "finance"));
  assert.ok(snapshot.modules.some((module) => module.key === "application-shell"));
  assert.ok(snapshot.modules.some((module) => module.key === "data-model"));
  assert.ok(snapshot.modules.some((module) => module.key === "operations"));
  for (const moduleKey of ["platform", "finance", "work", "hr"]) {
    assert.ok(snapshot.capabilities.some((capability) => capability.moduleKey === moduleKey));
  }
  assert.equal(
    snapshot.capabilityDependencyEdges.reduce((sum, edge) => sum + edge.importCount, 0),
    snapshot.dependencyEdges.reduce((sum, edge) => sum + edge.importCount, 0),
  );
  assert.ok(snapshot.summary.capabilityCoveragePercent > 0);

  assert.ok(snapshot.modules.find((module) => module.key === "application-shell")!.roles.composition > 0);
  assert.ok(snapshot.modules.find((module) => module.key === "data-model")!.roles.persistence > 0);
  assert.ok(snapshot.modules.find((module) => module.key === "operations")!.roles.tooling > 0);

  for (const row of snapshot.modules) {
    const roleLines = SOURCE_CODE_ANALYSIS_ROLES.reduce((sum, role) => sum + row.roles[role], 0);
    assert.equal(roleLines, row.lines, `${row.key} role totals must equal module lines`);
  }
  for (const row of snapshot.capabilities) {
    const roleLines = SOURCE_CODE_ANALYSIS_ROLES.reduce((sum, role) => sum + row.roles[role], 0);
    assert.equal(roleLines, row.lines, `${row.moduleKey}/${row.key} role totals must equal capability lines`);
  }
  assert.equal(
    snapshot.modules.reduce((sum, row) => sum + row.lines, 0),
    snapshot.summary.lines,
  );
  assert.equal(
    snapshot.modules.reduce((sum, row) => sum + row.mixedResponsibilityFileCount, 0),
    snapshot.summary.mixedResponsibilityFileCount,
  );
});

test("mixed responsibility gate targets high-confidence single-file role crossings", () => {
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/library/import/example.ts",
      "library",
      'import { z } from "zod";\nimport { prisma } from "@workspace/platform/server/prisma";\nconst row = z.object({ id: z.number() });\nvoid prisma.item.findMany();',
    ),
    ["input", "persistence"],
  );
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/hr/server/domain/employee-validation.ts",
      "hr",
      'import { prisma } from "@workspace/platform/server/prisma";\nexport async function validate() { return prisma.employee.findUnique({ where: { id: 1 } }); }',
    ),
    ["domainValidation", "persistence"],
  );
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/hr/server/domain/employee-validation.ts",
      "hr",
      'import { prisma } from "@workspace/platform/server/prisma";\nexport async function validate() { return prisma.employee.update({ where: { id: 1 }, data: {} }); }',
    ),
    ["domainValidation", "persistence"],
  );
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/hr/server/employee-service.ts",
      "hr",
      'import { prisma } from "@workspace/platform/server/prisma";\nexport async function save() { return prisma.employee.update({ where: { id: 1 }, data: {} }); }',
    ),
    [],
  );
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/hr/server/domain/employee-validation.ts",
      "hr",
      'import type { Prisma } from "@workspace/platform/server/prisma";\nexport function validate(input: Prisma.EmployeeWhereInput) { return Boolean(input); }',
    ),
    [],
  );
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/agent/server/example-connector.ts",
      "agent",
      'import { z } from "zod";\nconst input = z.object({ id: z.number() });\nexport async function execute() { return fetch("/api/modules/example"); }',
    ),
    ["input", "integration"],
  );
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/platform/ui/ExamplePanel.tsx",
      "platform",
      'import { useEffect } from "react";\nexport function ExamplePanel() { useEffect(() => { void import("@wecom/jssdk"); }, []); return <div />; }',
    ),
    ["ui", "integration"],
  );
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/work/ui/ExampleForm.tsx",
      "work",
      'import { z } from "zod";\nexport function ExampleForm() { const schema = z.object({ name: z.string() }); return <div>{schema.shape.name.description}</div>; }',
    ),
    [],
  );
  assert.deepEqual(
    detectMixedResponsibilityRoles(
      "packages/work/ui/use-example-data.ts",
      "work",
      'import { useEffect } from "react";\nexport function useExampleData() { useEffect(() => { void fetch("/api/modules/work/example"); }, []); }',
    ),
    [],
  );
});

test("primary roles follow owned UI paths and distinguish application services from data adapters", () => {
  assert.equal(
    classifySourceCodeRole(
      "packages/finance/ui/assets/asset-model.ts",
      "finance",
      'import type { Asset } from "../../types";\nexport const rows: Asset[] = [];',
    ),
    "ui",
  );
  assert.equal(
    classifySourceCodeRole(
      "packages/hr/server/employee-service.ts",
      "hr",
      'import { prisma } from "@workspace/platform/server/prisma";\nexport async function save() { return prisma.employee.findMany(); }',
    ),
    "application",
  );
  assert.equal(
    classifySourceCodeRole(
      "packages/hr/server/employee-reference-adapter.ts",
      "hr",
      'import { prisma } from "@workspace/platform/server/prisma";\nexport async function load() { return prisma.employee.findMany(); }',
    ),
    "persistence",
  );
  assert.equal(
    classifySourceCodeRole(
      "packages/platform/server/workflow-policy-defaults.ts",
      "platform",
      'import type { Policy } from "./workflow-types";\nexport type Defaults = { policy: Policy };',
    ),
    "contract",
  );
  assert.equal(
    classifySourceCodeRole(
      "packages/core/index.ts",
      "core",
      'export * from "./types";\nexport type { Item } from "./contract";',
    ),
    "assembly",
  );
  assert.equal(
    classifySourceCodeRole(
      "packages/core/index.ts",
      "core",
      'export * from "./types";\nexport function execute() { return true; }',
    ),
    "application",
  );
});
