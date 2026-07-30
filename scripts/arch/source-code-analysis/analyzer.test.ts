import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { SOURCE_CODE_ANALYSIS_ROLES } from "../../../packages/platform/source-code-analysis-contract";
import { analyzeSourceCode, detectMixedResponsibilityRoles } from "./analyzer";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

test("source code analysis assigns every governed file to one declared module and role", async () => {
  const snapshot = await analyzeSourceCode(repositoryRoot);

  assert.equal(snapshot.summary.unclassifiedFileCount, 0);
  assert.equal(snapshot.summary.ambiguousFileCount, 0);
  assert.equal(snapshot.summary.missingInterfaceCount, 0);
  assert.equal(snapshot.summary.dependencyCycleCount, 0);
  assert.equal(snapshot.summary.mixedResponsibilityFileCount, 0);
  assert.deepEqual(snapshot.dependencyCycles, []);
  assert.equal(snapshot.summary.coveragePercent, 100);
  assert.ok(snapshot.modules.some((module) => module.key === "settings"));
  assert.ok(snapshot.modules.some((module) => module.key === "finance"));
  assert.ok(snapshot.modules.some((module) => module.key === "application-shell"));
  assert.ok(snapshot.modules.some((module) => module.key === "data-model"));
  assert.ok(snapshot.modules.some((module) => module.key === "operations"));

  assert.ok(snapshot.modules.find((module) => module.key === "application-shell")!.roles.composition > 0);
  assert.ok(snapshot.modules.find((module) => module.key === "data-model")!.roles.persistence > 0);
  assert.ok(snapshot.modules.find((module) => module.key === "operations")!.roles.tooling > 0);

  for (const row of snapshot.modules) {
    const roleLines = SOURCE_CODE_ANALYSIS_ROLES.reduce((sum, role) => sum + row.roles[role], 0);
    assert.equal(roleLines, row.lines, `${row.key} role totals must equal module lines`);
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
    ["ui", "input"],
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
