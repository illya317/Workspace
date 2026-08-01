import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_CAPABILITY_DECLARATIONS,
  capabilityGovernedModuleForPath,
  parseCapabilityOwnershipBaseline,
  sourceCapabilityDepth,
  sourceCapabilityDeclarationsForPath,
  validateSourceCapabilityDeclarations,
  type SourceCapabilityDeclaration,
} from "./capabilities";
import { SOURCE_CAPABILITY_INTERFACE_FILES } from "./capability-interfaces";

test("product, shared, data, operations, and tooling roots use one recursive module contract", () => {
  const examples = [
    ["platform", "packages/platform/server/approvals/store.ts", "workflow-approvals"],
    ["platform", "packages/platform/source-code-analysis-contract.ts", "platform-foundation"],
    ["finance", "packages/finance/server/assets/service.ts", "assets"],
    ["finance", "packages/finance/index.ts", "shared-contracts"],
    ["work", "packages/work/server/meetings/application.ts", "meetings"],
    ["work", "packages/work/index.ts", "shared-contracts"],
    ["hr", "packages/hr/server/analysis/route.ts", "analysis"],
    ["hr", "packages/hr/server/performance/contribution-detail.ts", "performance"],
    ["hr", "packages/hr/index.ts", "shared-contracts"],
    ["core", "packages/core/period/core.ts", "period"],
    ["core", "packages/core/ui/PageSurface.tsx", "surface-runtime"],
    ["core", "packages/core/ui/internal/data/DataTable.tsx", "table-filtering"],
    ["core", "packages/core/ui/internal/input/FkFieldInput.tsx", "field-references"],
    ["core", "packages/core/ui/internal/visualization/VisualizationNetwork.tsx", "visualization"],
    ["data-model", "prisma/models/finance-ledger.prisma", "model-contracts"],
    ["data-model", "prisma/migrations/20260729000000_finance_auxiliary_identity_targets/migration.sql", "migration-history"],
    ["data-model", "ops/data-release-reference-contracts.mjs", "data-release-contracts"],
    ["operations", "ops/deploy/atomic-cutover.sh", "deploy-runtime"],
    ["operations", "ops/publish.sh", "operations-control"],
    ["operations", "ops/release/readiness/ready-artifact.mjs", "release-ready"],
    ["operations", "ops/build-standalone-artifact.sh", "artifact-supply"],
    ["operations", "ops/apply-data-release.mjs", "data-release"],
    ["operations", "scripts/import/import-finance-readable.ts", "data-import"],
    ["tooling", "scripts/arch/gate.ts", "architecture-governance"],
    ["tooling", "scripts/check/check-db.js", "static-analysis"],
    ["tooling", "scripts/scan-library.ts", "tooling-command-runtime"],
    ["tooling", "scripts/testing/run-node-tests.mjs", "test-infrastructure"],
    ["tooling", "e2e/auth.spec.ts", "e2e"],
    ["tooling", ".github/workflows/ci.yml", "tooling-foundation"],
    ["tooling", "package.json", "tooling-entry"],
  ] as const;

  for (const [moduleKey, relativePath, capabilityKey] of examples) {
    assert.deepEqual(
      sourceCapabilityDeclarationsForPath(moduleKey, relativePath).map((candidate) => candidate.key),
      [capabilityKey],
    );
  }
});

test("unknown package paths and non-governed modules do not inherit a catch-all capability", () => {
  assert.equal(capabilityGovernedModuleForPath("packages/work/new-capability/file.ts"), "work");
  assert.deepEqual(sourceCapabilityDeclarationsForPath("work", "packages/work/new-capability/file.ts"), []);
  assert.deepEqual(sourceCapabilityDeclarationsForPath("docs", "packages/docs/server/index.ts"), []);
  assert.equal(capabilityGovernedModuleForPath("app/api/modules/work/route.ts"), "work");
  assert.equal(capabilityGovernedModuleForPath("prisma/schema.prisma"), "data-model");
  assert.equal(capabilityGovernedModuleForPath("ops/deploy.sh"), "operations");
  assert.equal(capabilityGovernedModuleForPath("scripts/arch/gate.ts"), "tooling");
});

test("L1 application ingress is declared separately from nested package modules", () => {
  assert.deepEqual(
    sourceCapabilityDeclarationsForPath("finance", "app/api/modules/finance/ledger/vouchers/route.ts")
      .map((candidate) => [candidate.key, sourceCapabilityDepth(candidate)]),
    [["entry", 1]],
  );
});

test("matching collects every candidate so overlapping declarations remain ambiguous", () => {
  const declarations: SourceCapabilityDeclaration[] = [
    {
      moduleKey: "work",
      key: "projects",
      kind: "module",
      parentKey: null,
      label: "项目",
      include: [{ kind: "prefix", path: "packages/work/server/" }],
      interface: [],
    },
    {
      moduleKey: "work",
      key: "meetings",
      kind: "module",
      parentKey: null,
      label: "会议",
      include: [{ kind: "file", path: "packages/work/server/meetings.ts" }],
      interface: [],
    },
  ];

  assert.deepEqual(
    sourceCapabilityDeclarationsForPath("work", "packages/work/server/meetings.ts", declarations)
      .map((candidate) => candidate.key),
    ["projects", "meetings"],
  );
});

test("recursive ownership selects the deepest node and supports L3/L4 without level-specific logic", () => {
  const declarations: SourceCapabilityDeclaration[] = [
    {
      moduleKey: "finance",
      key: "ledger",
      kind: "module",
      parentKey: null,
      label: "总账",
      include: [{ kind: "prefix", path: "packages/finance/server/ledger/" }],
      interface: [],
    },
    {
      moduleKey: "finance",
      key: "vouchers",
      kind: "module",
      parentKey: "ledger",
      label: "凭证",
      include: [{ kind: "prefix", path: "packages/finance/server/ledger/vouchers/" }],
      interface: [],
    },
    {
      moduleKey: "finance",
      key: "voucher-import",
      kind: "module",
      parentKey: "vouchers",
      label: "凭证导入",
      include: [{ kind: "prefix", path: "packages/finance/server/ledger/vouchers/import/" }],
      interface: [],
    },
  ];

  assert.deepEqual(
    sourceCapabilityDeclarationsForPath(
      "finance",
      "packages/finance/server/ledger/vouchers/import/parser.ts",
      declarations,
    ).map((candidate) => candidate.key),
    ["voucher-import"],
  );
  assert.equal(sourceCapabilityDepth(declarations[0], declarations), 2);
  assert.equal(sourceCapabilityDepth(declarations[1], declarations), 3);
  assert.equal(sourceCapabilityDepth(declarations[2], declarations), 4);
});

test("recursive module contract rejects missing parents, cycles, and duplicate nodes", () => {
  const node = (key: string, parentKey: string | null): SourceCapabilityDeclaration => ({
    moduleKey: "work",
    key,
    kind: "module",
    parentKey,
    label: key,
    include: [],
    interface: [],
  });

  assert.throws(() => validateSourceCapabilityDeclarations([node("tasks", "missing")]), /missing capability parent/);
  assert.throws(() => validateSourceCapabilityDeclarations([
    node("tasks", "projects"),
    node("projects", "tasks"),
  ]), /capability parent cycle/);
  assert.throws(() => validateSourceCapabilityDeclarations([node("tasks", null), node("tasks", null)]), /duplicate capability declaration/);
  assert.throws(() => validateSourceCapabilityDeclarations([{
    ...node("tasks", null),
    interface: [{ kind: "file", path: "packages/work/server/outside.ts" }],
  }]), /Interface escapes owned Implementation/);
});

test("baseline parser rejects misspelled modules, extra top-level structure, and duplicates", () => {
  assert.throws(() => parseCapabilityOwnershipBaseline({
    schemaVersion: 1,
    legacyUnclassifiedFiles: { works: [] },
  }), /unknown modules: works/);
  assert.throws(() => parseCapabilityOwnershipBaseline({
    schemaVersion: 1,
    legacyUnclassifiedFiles: {},
    ignored: true,
  }), /unknown top-level keys/);
  assert.throws(() => parseCapabilityOwnershipBaseline({
    schemaVersion: 1,
    legacyUnclassifiedFiles: {
      work: ["packages/work/legacy.ts", "packages/work/legacy.ts"],
    },
  }), /duplicate capability baseline path/);
});

test("recursive Module Interfaces use an exact reviewed file catalog", () => {
  const entries = Object.entries(SOURCE_CAPABILITY_INTERFACE_FILES);
  assert.equal(entries.length, 37);
  assert.equal(entries.flatMap(([, files]) => files).length, 359);

  const declarations = new Map(SOURCE_CAPABILITY_DECLARATIONS.map((declaration) => [
    `${declaration.moduleKey}/${declaration.key}`,
    declaration,
  ]));
  const ownedPaths = new Set<string>();
  for (const [id, files] of entries) {
    const declaration = declarations.get(id);
    assert.ok(declaration, `missing declaration for ${id}`);
    for (const relativePath of files) {
      const fullPath = `packages/${declaration.moduleKey}/${relativePath}`;
      assert.ok(!ownedPaths.has(fullPath), `duplicate Interface owner for ${fullPath}`);
      ownedPaths.add(fullPath);
      assert.ok(declaration.interface.some((rule) =>
        rule.kind === "file" && rule.path === fullPath), `missing exact Interface ${fullPath}`);
    }
  }
  assert.ok(SOURCE_CAPABILITY_DECLARATIONS.flatMap((declaration) => declaration.interface)
    .every((rule) => rule.kind === "file"));
});
