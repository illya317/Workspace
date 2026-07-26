import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { findComponentLocalUiConfigs } from "./structure-hardcoding";

function source(code: string) {
  const relPath = "packages/finance/ui/Fixture.tsx";
  return {
    relPath,
    sourceFile: ts.createSourceFile(relPath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  };
}

test("does not report explicitly typed DataSurface column declarations", () => {
  const drift = findComponentLocalUiConfigs([source(`
    const reportColumns: DataSurfaceColumnSpec<Row>[] = [
      { key: "name" },
      { key: "status" },
      { key: "amount" },
    ];
    const readonlyColumns: ReadonlyArray<DataSurfaceColumnSpec<Row>> = [
      { key: "name" },
      { key: "status" },
      { key: "amount" },
    ];
  `)]);

  assert.deepEqual(drift, []);
});

test("does not report DataSurface columns checked with satisfies", () => {
  const drift = findComponentLocalUiConfigs([source(`
    const reportColumns = [
      { key: "name" },
      { key: "status" },
      { key: "amount" },
    ] satisfies readonly DataSurfaceColumnSpec<Row>[];
  `)]);

  assert.deepEqual(drift, []);
});

test("continues to report untyped or unrelated local column configs", () => {
  const drift = findComponentLocalUiConfigs([source(`
    const reportColumns = [
      { key: "name" },
      { key: "status" },
      { key: "amount" },
    ];
    const legacyColumns: LegacyColumnSpec<Row>[] = [
      { key: "name" },
      { key: "status" },
      { key: "amount" },
    ];
  `)]);

  assert.deepEqual(drift, [
    { file: "packages/finance/ui/Fixture.tsx", name: "legacyColumns", kind: "columns", itemCount: 3 },
    { file: "packages/finance/ui/Fixture.tsx", name: "reportColumns", kind: "columns", itemCount: 3 },
  ]);
});
