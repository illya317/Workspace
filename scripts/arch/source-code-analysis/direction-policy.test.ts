import assert from "node:assert/strict";
import test from "node:test";

import type { SourceCodeAnalysisRole } from "../../../packages/platform/source-code-analysis-contract";
import { invalidDependencyDirectionReason } from "./direction-policy";

function file(moduleKey: string, role: SourceCodeAnalysisRole, path = `packages/${moduleKey}/example.ts`) {
  return { moduleKey, role, path };
}

test("role dependencies follow the default entry-to-contract direction", () => {
  assert.equal(invalidDependencyDirectionReason(file("work", "input"), file("work", "application"), "valueImport"), null);
  assert.equal(invalidDependencyDirectionReason(file("work", "application"), file("work", "persistence"), "valueImport"), null);
  assert.equal(invalidDependencyDirectionReason(file("work", "persistence"), file("work", "domain"), "valueImport"), null);
  assert.equal(invalidDependencyDirectionReason(file("work", "domain"), file("work", "contract"), "typeOnlyImport"), null);

  assert.equal(invalidDependencyDirectionReason(file("work", "input"), file("work", "persistence"), "valueImport"), "forbiddenLayerShortcut");
  assert.equal(invalidDependencyDirectionReason(file("work", "domain"), file("work", "ui"), "valueImport"), "reverseRoleDependency");
  assert.equal(invalidDependencyDirectionReason(file("work", "contract"), file("work", "application"), "typeOnlyImport"), "reverseRoleDependency");
});

test("module dependencies point from product composition toward shared foundations", () => {
  assert.equal(invalidDependencyDirectionReason(file("work", "application"), file("platform", "application"), "valueImport"), null);
  assert.equal(invalidDependencyDirectionReason(file("platform", "application"), file("work", "contract"), "typeOnlyImport"), "upwardModuleDependency");
  assert.equal(invalidDependencyDirectionReason(file("work", "application"), file("finance", "contract"), "typeOnlyImport"), "crossBusinessDependency");
});

test("assemblies only re-export and production never imports test or tooling", () => {
  const assembly = file("work", "assembly", "packages/work/index.ts");
  assert.equal(invalidDependencyDirectionReason(assembly, file("work", "application"), "reExport"), null);
  assert.equal(invalidDependencyDirectionReason(assembly, file("work", "application"), "valueImport"), "forbiddenLayerShortcut");
  assert.equal(invalidDependencyDirectionReason(file("work", "application"), assembly, "valueImport"), "implementationImportsOwnAssembly");
  assert.equal(invalidDependencyDirectionReason(file("work", "application"), file("work", "test"), "valueImport"), "productionImportsTest");
  assert.equal(invalidDependencyDirectionReason(file("work", "test"), file("work", "application"), "valueImport"), null);
});

test("package root barrels are composition-only across module seams", () => {
  const platformRoot = file("platform", "assembly", "packages/platform/index.ts");
  assert.equal(
    invalidDependencyDirectionReason(file("work", "domain"), platformRoot, "valueImport"),
    "forbiddenLayerShortcut",
  );
  assert.equal(
    invalidDependencyDirectionReason(file("work", "assembly", "packages/work/index.ts"), platformRoot, "reExport"),
    "forbiddenLayerShortcut",
  );
  assert.equal(
    invalidDependencyDirectionReason(file("application-shell", "composition", "app/layout.tsx"), platformRoot, "valueImport"),
    null,
  );
  assert.equal(
    invalidDependencyDirectionReason(file("platform", "composition", "app/platform/page.tsx"), platformRoot, "valueImport"),
    null,
  );
});

test("unknown source-analysis modules fail closed", () => {
  assert.throws(
    () => invalidDependencyDirectionReason(file("unknown-package", "application"), file("core", "contract"), "valueImport"),
    /missing from the package dependency tier policy/,
  );
});
