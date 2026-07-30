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
      left: { moduleKey: "work", role: "domain" },
      right: { moduleKey: "work", role: "ui" },
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
      { moduleKey: "work", role: "domain" },
      { moduleKey: "work", role: "ui" },
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
      left: { moduleKey: "example", role: "domain" },
      right: { moduleKey: "example", role: "input" },
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
        { moduleKey: "example", role: "domain" },
        { moduleKey: "example", role: "input" },
      ],
    },
    {
      classification: "runtime",
      paths: ["packages/example/helper.ts", "packages/example/input.ts"],
      cells: [
        { moduleKey: "example", role: "domain" },
        { moduleKey: "example", role: "input" },
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
