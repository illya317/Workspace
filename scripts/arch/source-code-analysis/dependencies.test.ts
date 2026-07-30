import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSourceDependencies, type DependencySourceFile } from "./dependencies";

test("dependency analysis keeps responsibility edges within and across modules", () => {
  const files: DependencySourceFile[] = [
    {
      path: "packages/work/ui.ts",
      text: 'import "./domain";\nimport "./ui-helper";',
      moduleKey: "work",
      role: "ui",
    },
    {
      path: "packages/work/ui-helper.ts",
      text: "export const helper = true;",
      moduleKey: "work",
      role: "ui",
    },
    {
      path: "packages/work/domain.ts",
      text: 'import "./ui";',
      moduleKey: "work",
      role: "domain",
    },
    {
      path: "packages/core/domain.ts",
      text: 'import "../work/ui";',
      moduleKey: "core",
      role: "domain",
    },
    {
      path: "packages/core/domain.test.ts",
      text: 'import "../work/ui";',
      moduleKey: "core",
      role: "test",
    },
  ];

  const result = analyzeSourceDependencies(files, ["work", "core"]);

  assert.deepEqual(result.dependencies.get("core"), ["work"]);
  assert.deepEqual(result.dependencies.get("work"), []);
  assert.deepEqual(result.dependencyEdges, [
    {
      sourceModuleKey: "core",
      sourceRole: "domain",
      targetModuleKey: "work",
      targetRole: "ui",
      importCount: 1,
      valueImportCount: 1,
      typeOnlyImportCount: 0,
      dynamicImportCount: 0,
      reExportCount: 0,
      typeOnlyReExportCount: 0,
    },
    {
      sourceModuleKey: "core",
      sourceRole: "test",
      targetModuleKey: "work",
      targetRole: "ui",
      importCount: 1,
      valueImportCount: 1,
      typeOnlyImportCount: 0,
      dynamicImportCount: 0,
      reExportCount: 0,
      typeOnlyReExportCount: 0,
    },
    {
      sourceModuleKey: "work",
      sourceRole: "domain",
      targetModuleKey: "work",
      targetRole: "ui",
      importCount: 1,
      valueImportCount: 1,
      typeOnlyImportCount: 0,
      dynamicImportCount: 0,
      reExportCount: 0,
      typeOnlyReExportCount: 0,
    },
    {
      sourceModuleKey: "work",
      sourceRole: "ui",
      targetModuleKey: "work",
      targetRole: "domain",
      importCount: 1,
      valueImportCount: 1,
      typeOnlyImportCount: 0,
      dynamicImportCount: 0,
      reExportCount: 0,
      typeOnlyReExportCount: 0,
    },
    {
      sourceModuleKey: "work",
      sourceRole: "ui",
      targetModuleKey: "work",
      targetRole: "ui",
      importCount: 1,
      valueImportCount: 1,
      typeOnlyImportCount: 0,
      dynamicImportCount: 0,
      reExportCount: 0,
      typeOnlyReExportCount: 0,
    },
  ]);
  assert.deepEqual(result.reciprocalRoleDependencies, [
    {
      left: { moduleKey: "work", capabilityKey: null, role: "domain" },
      right: { moduleKey: "work", capabilityKey: null, role: "ui" },
      classification: "runtime",
      leftToRight: {
        importCount: 1,
        valueImportCount: 1,
        typeOnlyImportCount: 0,
        dynamicImportCount: 0,
        reExportCount: 0,
        typeOnlyReExportCount: 0,
        evidence: [{
          sourcePath: "packages/work/domain.ts",
          targetPath: "packages/work/ui.ts",
          kind: "valueImport",
        }],
      },
      rightToLeft: {
        importCount: 1,
        valueImportCount: 1,
        typeOnlyImportCount: 0,
        dynamicImportCount: 0,
        reExportCount: 0,
        typeOnlyReExportCount: 0,
        evidence: [{
          sourcePath: "packages/work/ui.ts",
          targetPath: "packages/work/domain.ts",
          kind: "valueImport",
        }],
      },
    },
  ]);
  assert.deepEqual(result.dependencyFileCycles.map((cycle) => ({
    classification: cycle.classification,
    paths: cycle.paths,
    cells: cycle.cells,
  })), [{
    classification: "runtime",
    paths: ["packages/work/domain.ts", "packages/work/ui.ts"],
    cells: [
      { moduleKey: "work", capabilityKey: null, role: "domain" },
      { moduleKey: "work", capabilityKey: null, role: "ui" },
    ],
  }]);
});

test("reciprocal role diagnostics stay separate from exact file cycles and edge kinds", () => {
  const files: DependencySourceFile[] = [
    {
      path: "packages/example/input.ts",
      text: 'import type { Domain } from "./domain";\nexport { helper } from "./helper";',
      moduleKey: "example",
      role: "input",
    },
    {
      path: "packages/example/domain.ts",
      text: 'import type { Input } from "./input";',
      moduleKey: "example",
      role: "domain",
    },
    {
      path: "packages/example/helper.ts",
      text: 'import "./input";\nexport const helper = true;',
      moduleKey: "example",
      role: "domain",
    },
    {
      path: "packages/example/test.ts",
      text: 'import "./domain";',
      moduleKey: "example",
      role: "test",
    },
  ];

  const result = analyzeSourceDependencies(files, ["example"]);

  assert.deepEqual(result.reciprocalRoleDependencies.map((dependency) => ({
    left: dependency.left,
    right: dependency.right,
    classification: dependency.classification,
    leftToRightKinds: dependency.leftToRight.evidence.map((item) => item.kind),
    rightToLeftKinds: dependency.rightToLeft.evidence.map((item) => item.kind),
  })), [
    {
      left: { moduleKey: "example", capabilityKey: null, role: "domain" },
      right: { moduleKey: "example", capabilityKey: null, role: "input" },
      classification: "runtime",
      leftToRightKinds: ["typeOnlyImport", "valueImport"],
      rightToLeftKinds: ["typeOnlyImport", "reExport"],
    },
  ]);
  const inputToDomain = result.dependencyEdges.find((edge) => edge.sourceRole === "input" && edge.targetRole === "domain");
  assert.equal(inputToDomain?.typeOnlyImportCount, 1);
  assert.equal(inputToDomain?.reExportCount, 1);
  assert.equal(inputToDomain?.importCount, 2);
  assert.deepEqual(result.dependencyFileCycles.map((cycle) => ({
    classification: cycle.classification,
    paths: cycle.paths,
    cells: cycle.cells,
  })), [
    {
      classification: "type-assisted",
      paths: ["packages/example/domain.ts", "packages/example/helper.ts", "packages/example/input.ts"],
      cells: [
        { moduleKey: "example", capabilityKey: null, role: "domain" },
        { moduleKey: "example", capabilityKey: null, role: "input" },
      ],
    },
    {
      classification: "runtime",
      paths: ["packages/example/helper.ts", "packages/example/input.ts"],
      cells: [
        { moduleKey: "example", capabilityKey: null, role: "domain" },
        { moduleKey: "example", capabilityKey: null, role: "input" },
      ],
    },
  ]);
});

test("production tooling, re-exports, type-only re-exports, and self-loops participate in file SCCs", () => {
  const files: DependencySourceFile[] = [
    { path: "ops/a.ts", text: 'export { b } from "./b";', moduleKey: "operations", role: "tooling" },
    { path: "ops/b.ts", text: 'export { a } from "./a";', moduleKey: "operations", role: "tooling" },
    { path: "ops/self.ts", text: 'import "./self";', moduleKey: "operations", role: "tooling" },
    { path: "ops/type-a.ts", text: 'export type { B } from "./type-b";', moduleKey: "operations", role: "tooling" },
    { path: "ops/type-b.ts", text: 'export type { A } from "./type-a";', moduleKey: "operations", role: "tooling" },
    { path: "ops/cjs-a.js", text: 'module.exports = require("./cjs-b");', moduleKey: "operations", role: "tooling" },
    { path: "ops/cjs-b.js", text: 'module.exports = require("./cjs-a");', moduleKey: "operations", role: "tooling" },
    { path: "scripts/check/equals-a.ts", text: 'import b = require("./equals-b"); export { b };', moduleKey: "tooling", role: "tooling" },
    { path: "scripts/check/equals-b.ts", text: 'import a = require("./equals-a"); export { a };', moduleKey: "tooling", role: "tooling" },
    { path: "ops/a.test.ts", text: 'import "./b.test";', moduleKey: "operations", role: "test" },
    { path: "ops/b.test.ts", text: 'import "./a.test";', moduleKey: "operations", role: "test" },
  ];

  const result = analyzeSourceDependencies(files, ["operations"]);

  assert.deepEqual(result.dependencyFileCycles.map((cycle) => ({
    classification: cycle.classification,
    paths: cycle.paths,
  })), [
    { classification: "runtime", paths: ["ops/a.ts", "ops/b.ts"] },
    { classification: "runtime", paths: ["ops/cjs-a.js", "ops/cjs-b.js"] },
    { classification: "runtime", paths: ["ops/self.ts"] },
    { classification: "type-assisted", paths: ["ops/type-a.ts", "ops/type-b.ts"] },
    { classification: "runtime", paths: ["scripts/check/equals-a.ts", "scripts/check/equals-b.ts"] },
  ]);
});

test("import type nodes and static template dynamic imports participate in dependency analysis", () => {
  const files: DependencySourceFile[] = [
    {
      path: "packages/work/application.ts",
      text: 'type Contract = import("./contract").Contract;\nvoid import(`./runtime`, { with: { type: "json" } });\nrequire(`./runtime`);',
      moduleKey: "work",
      role: "application",
    },
    { path: "packages/work/contract.ts", text: "export type Contract = string;", moduleKey: "work", role: "contract" },
    { path: "packages/work/runtime.ts", text: "export const runtime = true;", moduleKey: "work", role: "application" },
  ];

  const result = analyzeSourceDependencies(files, ["work"]);
  const applicationToContract = result.dependencyEdges.find((edge) => edge.targetRole === "contract");
  const applicationToApplication = result.dependencyEdges.find((edge) => edge.targetRole === "application");
  assert.equal(applicationToContract?.typeOnlyImportCount, 1);
  assert.equal(applicationToApplication?.dynamicImportCount, 1);
  assert.equal(applicationToApplication?.valueImportCount, 1);
});

test("capability dependency edges preserve every L1 import while carrying nullable ownership", () => {
  const files: DependencySourceFile[] = [
    {
      path: "packages/work/server/meetings/application.ts",
      text: 'import "../projects";\nimport "../../../core/contract";',
      moduleKey: "work",
      capabilityKey: "meetings",
      role: "application",
    },
    {
      path: "packages/work/server/projects.ts",
      text: "export const projects = true;",
      moduleKey: "work",
      capabilityKey: "projects",
      role: "application",
    },
    {
      path: "packages/core/contract.ts",
      text: "export const contract = true;",
      moduleKey: "core",
      capabilityKey: null,
      role: "contract",
    },
  ];

  const result = analyzeSourceDependencies(files, ["work", "core"]);
  assert.equal(
    result.capabilityDependencyEdges.reduce((sum, edge) => sum + edge.importCount, 0),
    result.dependencyEdges.reduce((sum, edge) => sum + edge.importCount, 0),
  );
  assert.deepEqual(result.capabilityDependencyEdges.map((edge) => ({
    source: `${edge.sourceModuleKey}/${edge.sourceCapabilityKey}`,
    target: `${edge.targetModuleKey}/${edge.targetCapabilityKey}`,
  })), [
    { source: "work/meetings", target: "core/null" },
    { source: "work/meetings", target: "work/projects" },
  ]);
});

test("unresolved internal source imports fail closed while assets and known generated targets stay external", () => {
  assert.throws(
    () => analyzeSourceDependencies([{
      path: "packages/work/application.ts",
      text: 'import "./missing";\nimport "@workspace/finance/missing";\nimport "@/missing";',
      moduleKey: "work",
      role: "application",
    }], ["work"]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /packages\/work\/application\.ts -> \.\/missing/);
      assert.match(error.message, /@workspace\/finance\/missing/);
      assert.match(error.message, /@\/missing/);
      return true;
    },
  );

  const generatedTargets = new Set(["generated/prisma/client.ts"]);
  const result = analyzeSourceDependencies([{
    path: "packages/platform/server/prisma.ts",
    text: 'import icon from "./icon.svg";\nimport data from "./fixture.json";\nimport React from "react";\nimport { PrismaClient } from "../../../generated/prisma/client";',
    moduleKey: "platform",
    role: "persistence",
  }], ["platform"], generatedTargets);
  assert.deepEqual(result.dependencyEdges, []);

  assert.throws(
    () => analyzeSourceDependencies([{
      path: "packages/platform/server/prisma.ts",
      text: 'import { PrismaClient } from "../../../generated/prisma/clinet";',
      moduleKey: "platform",
      role: "persistence",
    }], ["platform"], generatedTargets),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /generated\/prisma\/clinet/);
      assert.match(error.message, /npm run db:generate/);
      return true;
    },
  );
});
