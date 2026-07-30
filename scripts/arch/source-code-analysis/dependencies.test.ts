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
    },
    {
      sourceModuleKey: "core",
      sourceRole: "test",
      targetModuleKey: "work",
      targetRole: "ui",
      importCount: 1,
    },
    {
      sourceModuleKey: "work",
      sourceRole: "domain",
      targetModuleKey: "work",
      targetRole: "ui",
      importCount: 1,
    },
    {
      sourceModuleKey: "work",
      sourceRole: "ui",
      targetModuleKey: "work",
      targetRole: "domain",
      importCount: 1,
    },
    {
      sourceModuleKey: "work",
      sourceRole: "ui",
      targetModuleKey: "work",
      targetRole: "ui",
      importCount: 1,
    },
  ]);
});
