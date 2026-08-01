import assert from "node:assert/strict";
import test from "node:test";

import {
  detectRepositoryDependencyCycles,
  extractRepositoryCommandDependencyEdges,
  type RepositoryDependencyEdge,
} from "./repository-dependency-cycle-policy";

test("detects self-cycles and cycles of any length as unwaivable blockers", () => {
  const edges: RepositoryDependencyEdge[] = [
    { sourcePath: "a.ts", targetPath: "b.ts", kind: "valueImport" },
    { sourcePath: "b.ts", targetPath: "c.ts", kind: "dynamicImport" },
    { sourcePath: "c.ts", targetPath: "a.ts", kind: "reExport" },
    { sourcePath: "self.test.ts", targetPath: "self.test.ts", kind: "valueImport" },
  ];
  const cycles = detectRepositoryDependencyCycles(["a.ts", "b.ts", "c.ts", "self.test.ts"], edges);
  assert.deepEqual(cycles.map((cycle) => ({
    classification: cycle.classification,
    paths: cycle.paths,
    cyclePath: cycle.cyclePath,
    blocking: cycle.blocking,
    waivable: cycle.waivable,
  })), [
    {
      classification: "runtime",
      paths: ["a.ts", "b.ts", "c.ts"],
      cyclePath: ["a.ts", "b.ts", "c.ts", "a.ts"],
      blocking: true,
      waivable: false,
    },
    {
      classification: "runtime",
      paths: ["self.test.ts"],
      cyclePath: ["self.test.ts", "self.test.ts"],
      blocking: true,
      waivable: false,
    },
  ]);
});

test("type-only and test edges remain in the architecture cycle graph", () => {
  const cycles = detectRepositoryDependencyCycles(
    ["domain.ts", "contract.ts", "domain.test.ts"],
    [
      { sourcePath: "domain.ts", targetPath: "contract.ts", kind: "valueImport" },
      { sourcePath: "contract.ts", targetPath: "domain.test.ts", kind: "typeOnlyImport" },
      { sourcePath: "domain.test.ts", targetPath: "domain.ts", kind: "valueImport" },
    ],
  );
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].classification, "type-assisted");
  assert.deepEqual(cycles[0].cyclePath, ["contract.ts", "domain.test.ts", "domain.ts", "contract.ts"]);
  assert.ok(cycles[0].evidence.some((edge) => edge.kind === "typeOnlyImport"));
});

test("extracts Python relative imports and shell source or execution edges", () => {
  const edges = extractRepositoryCommandDependencyEdges([
    { path: "scripts/a.py", text: "from . import b\n" },
    { path: "scripts/b.py", text: "import scripts.a\n" },
    { path: "ops/a.sh", text: "source \"$SCRIPT_DIR/b.sh\"\n" },
    { path: "ops/b.sh", text: "bash \"$SCRIPT_DIR/a.sh\"\n" },
  ]);
  assert.deepEqual(edges, [
    { sourcePath: "ops/a.sh", targetPath: "ops/b.sh", kind: "shellSource" },
    { sourcePath: "ops/b.sh", targetPath: "ops/a.sh", kind: "shellExecute" },
    { sourcePath: "scripts/a.py", targetPath: "scripts/b.py", kind: "pythonImport" },
    { sourcePath: "scripts/b.py", targetPath: "scripts/a.py", kind: "pythonImport" },
  ]);
  assert.deepEqual(
    detectRepositoryDependencyCycles(
      ["scripts/a.py", "scripts/b.py", "ops/a.sh", "ops/b.sh"],
      edges,
    ).map((cycle) => cycle.paths),
    [["ops/a.sh", "ops/b.sh"], ["scripts/a.py", "scripts/b.py"]],
  );
});

test("extracts workflow and package-script commands as file edges", () => {
  const edges = extractRepositoryCommandDependencyEdges([
    { path: ".github/workflows/check.yml", text: "steps:\n  - run: bash scripts/check.sh\n" },
    { path: "package.json", text: JSON.stringify({ scripts: { verify: "node scripts/check.ts" } }) },
    { path: "scripts/check.sh", text: "#!/usr/bin/env bash\n" },
    { path: "scripts/check.ts", text: "export {};\n" },
  ]);
  assert.deepEqual(edges, [
    {
      sourcePath: ".github/workflows/check.yml",
      targetPath: "scripts/check.sh",
      kind: "workflowCommand",
    },
    { sourcePath: "package.json", targetPath: "scripts/check.ts", kind: "packageScriptCommand" },
  ]);
});

test("edges to excluded or generated files cannot manufacture a governed cycle", () => {
  assert.deepEqual(detectRepositoryDependencyCycles(
    ["governed.ts"],
    [
      { sourcePath: "governed.ts", targetPath: "generated.ts", kind: "valueImport" },
      { sourcePath: "generated.ts", targetPath: "governed.ts", kind: "valueImport" },
    ],
  ), []);
});
