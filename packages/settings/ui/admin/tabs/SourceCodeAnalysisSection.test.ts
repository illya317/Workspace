import assert from "node:assert/strict";
import test from "node:test";

import type {
  SourceCodeAnalysisModuleCategory,
  SourceCodeAnalysisRoleCounts,
  SourceCodeAnalysisSnapshot,
} from "@workspace/platform/source-code-analysis-contract";
import {
  SOURCE_CODE_ANALYSIS_SCHEMA_VERSION,
  SOURCE_CODE_ANALYSIS_ROLES,
} from "@workspace/platform/source-code-analysis-contract";
import {
  analysisTableRows,
  createSourceCodeAnalysisColumns,
} from "./SourceCodeAnalysisSection";
import { SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS } from "./source-code-analysis-display";
import {
  sourceCodeAnalysisCellSelected,
  sourceCodeAnalysisRelationCellState,
  sourceCodeAnalysisSelectionAfterClick,
} from "./source-code-analysis-relations";

function roleCounts(role: keyof SourceCodeAnalysisRoleCounts, lines: number): SourceCodeAnalysisRoleCounts {
  return Object.fromEntries(SOURCE_CODE_ANALYSIS_ROLES.map((key) => [key, key === role ? lines : 0])) as SourceCodeAnalysisRoleCounts;
}

function analysisSnapshot(): SourceCodeAnalysisSnapshot {
  const modules = [
    { key: "work", label: "工作管理", category: "product" as SourceCodeAnalysisModuleCategory, lines: 5_000, roles: roleCounts("ui", 5_000), dependencies: ["core"] },
    { key: "settings", label: "设置", category: "system" as SourceCodeAnalysisModuleCategory, lines: 1_000, roles: roleCounts("ui", 1_000), dependencies: [] },
    { key: "core", label: "核心通用", category: "shared" as SourceCodeAnalysisModuleCategory, lines: 2_000, roles: roleCounts("domain", 2_000), dependencies: [] },
    { key: "operations", label: "生产运行", category: "engineering" as SourceCodeAnalysisModuleCategory, lines: 500, roles: roleCounts("tooling", 500), dependencies: ["work", "operations"] },
  ].map((module) => ({
    ...module,
    ownerResourceKey: null,
    interfacePaths: [],
    fileCount: 1,
    dependencyCount: module.dependencies.length,
    crossModuleImportCount: 0,
    mixedResponsibilityFileCount: 0,
  }));
  return {
    schemaVersion: SOURCE_CODE_ANALYSIS_SCHEMA_VERSION,
    generatedAt: "2026-07-30T00:00:00.000Z",
    sourceRevision: null,
    sourceDigest: "test",
    declarationMode: "central-manifest",
    lineMetric: "non-empty-non-comment-source-lines",
    summary: {
      fileCount: 4,
      lines: 8_500,
      declaredFileCount: 4,
      coveragePercent: 100,
      unclassifiedFileCount: 0,
      ambiguousFileCount: 0,
      missingInterfaceCount: 0,
      dependencyCycleCount: 0,
      mixedResponsibilityFileCount: 0,
    },
    modules,
    dependencyEdges: [
      {
        sourceModuleKey: "work",
        sourceRole: "ui",
        targetModuleKey: "core",
        targetRole: "domain",
        importCount: 1,
      },
      {
        sourceModuleKey: "operations",
        sourceRole: "tooling",
        targetModuleKey: "work",
        targetRole: "ui",
        importCount: 1,
      },
    ],
    dependencyFileCycles: [],
    dependencyCycles: [],
    diagnostics: {
      unclassifiedFiles: [],
      ambiguousFiles: [],
      missingInterfaces: [],
      mixedResponsibilityFiles: [],
    },
  };
}

test("source analysis columns stay compact until an aggregate column is expanded", () => {
  const collapsed = createSourceCodeAnalysisColumns({
    expandedGroupKey: null,
    onToggleGroup: () => undefined,
  });
  assert.deepEqual(collapsed.map((column) => column.key), [
    "module",
    "total",
    "entry",
    "business",
    "adapter",
    "contract",
    "assurance",
  ]);

  const expanded = createSourceCodeAnalysisColumns({
    expandedGroupKey: "entry",
    onToggleGroup: () => undefined,
  });
  assert.deepEqual(expanded.map((column) => column.key), [
    "module",
    "total",
    "entry",
    "entry:composition",
    "entry:ui",
    "entry:input",
    "business",
    "adapter",
    "contract",
    "assurance",
  ]);
  assert.deepEqual(expanded.slice(3, 6).map((column) => column.label), [
    "组合壳",
    "UI",
    "输入",
  ]);
});

test("clicking an expandable column delegates its group key", () => {
  let toggledGroupKey: string | null = null;
  const columns = createSourceCodeAnalysisColumns({
    expandedGroupKey: null,
    onToggleGroup: (groupKey) => {
      toggledGroupKey = groupKey;
    },
  });

  columns.find((column) => column.key === "assurance")?.onHeaderClick?.();
  assert.equal(toggledGroupKey, "assurance");
  assert.equal(columns.find((column) => column.key === "contract")?.onHeaderClick, undefined);
});

test("analysis rows add visual groups without changing module data", () => {
  const rows = analysisTableRows(analysisSnapshot());
  assert.deepEqual(rows.map((row) => row.label), [
    "产品模块",
    "工作管理",
    "设置",
    "共享与底座",
    "核心通用",
    "工程体系",
    "生产运行",
    "总计",
  ]);
  assert.equal(rows.find((row) => row.key === "work")?.lines, 5_000);
  assert.equal(rows.at(-1)?.displayLines, 8_500);
});

test("selected raw role distinguishes directions, aggregate reciprocity, real cycles, and self", () => {
  const snapshot = analysisSnapshot();
  const rows = analysisTableRows(analysisSnapshot());
  const work = rows.find((row) => row.key === "work");
  const settings = rows.find((row) => row.key === "settings");
  const core = rows.find((row) => row.key === "core");
  const operations = rows.find((row) => row.key === "operations");
  const entry = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) => group.key === "entry");
  const business = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) => group.key === "business");
  const assurance = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) => group.key === "assurance");
  assert.ok(work);
  assert.ok(settings);
  assert.ok(core);
  assert.ok(operations);
  assert.ok(entry);
  assert.ok(business);
  assert.ok(assurance);

  const selectedCell = { moduleKey: "work", groupKey: "entry" as const, role: "ui" as const };
  assert.equal(sourceCodeAnalysisRelationCellState(work, entry, "ui", snapshot.dependencyEdges, [], selectedCell), "normal");
  assert.equal(sourceCodeAnalysisRelationCellState(work, entry, null, snapshot.dependencyEdges, [], selectedCell), "normal");
  assert.equal(sourceCodeAnalysisCellSelected(work, entry, "ui", selectedCell), true);
  assert.equal(sourceCodeAnalysisRelationCellState(core, business, "domain", snapshot.dependencyEdges, [], selectedCell), "warning");
  assert.equal(sourceCodeAnalysisRelationCellState(operations, assurance, "tooling", snapshot.dependencyEdges, [], selectedCell), "info");
  assert.equal(sourceCodeAnalysisRelationCellState(settings, entry, "ui", snapshot.dependencyEdges, [], selectedCell), "muted");

  const bidirectionalEdges = [
    ...snapshot.dependencyEdges,
    { sourceModuleKey: "work", sourceRole: "ui" as const, targetModuleKey: "settings", targetRole: "ui" as const, importCount: 1 },
    { sourceModuleKey: "settings", sourceRole: "ui" as const, targetModuleKey: "work", targetRole: "ui" as const, importCount: 1 },
  ];
  assert.equal(sourceCodeAnalysisRelationCellState(settings, entry, "ui", bidirectionalEdges, [], selectedCell), "warning");

  const fileCycles = [{
    classification: "runtime" as const,
    paths: ["packages/work/ui.ts", "packages/settings/ui.ts"],
    cells: [
      { moduleKey: "work", role: "ui" as const },
      { moduleKey: "settings", role: "ui" as const },
    ],
    evidence: [],
  }];
  assert.equal(sourceCodeAnalysisRelationCellState(settings, entry, "ui", bidirectionalEdges, fileCycles, selectedCell), "success");

  const selfEdges = [
    ...snapshot.dependencyEdges,
    { sourceModuleKey: "operations", sourceRole: "tooling" as const, targetModuleKey: "operations", targetRole: "tooling" as const, importCount: 1 },
  ];
  assert.equal(sourceCodeAnalysisRelationCellState(
    operations,
    assurance,
    null,
    selfEdges,
    fileCycles,
    { moduleKey: "operations", groupKey: "assurance", role: null },
  ), "normal");
  assert.equal(sourceCodeAnalysisCellSelected(
    operations,
    assurance,
    null,
    { moduleKey: "operations", groupKey: "assurance", role: null },
  ), true);
});

test("interactive analysis cells expose hover relation callbacks", () => {
  const snapshot = analysisSnapshot();
  const rows = analysisTableRows(snapshot);
  const work = rows.find((row) => row.key === "work");
  assert.ok(work);
  const hovered: Array<{ moduleKey: string; groupKey: string } | null> = [];
  const columns = createSourceCodeAnalysisColumns(undefined, 5_000, {
    dependencyEdges: snapshot.dependencyEdges,
    dependencyFileCycles: [],
    selection: {
      selectedCell: null,
      onSelectCell: () => undefined,
      onHoverCell: (cell) => hovered.push(cell),
    },
  });
  const cell = columns.find((column) => column.key === "entry")?.cell(work);
  assert.ok(typeof cell === "object" && cell && "kind" in cell && cell.kind === "interactive");

  cell.onMouseEnter?.();
  cell.onMouseLeave?.();

  assert.deepEqual(hovered, [
    { moduleKey: "work", groupKey: "entry", role: null },
    null,
  ]);
});

test("raw-role selection switches within one expanded group and only exact repeat cancels", () => {
  const ui = { moduleKey: "work", groupKey: "entry" as const, role: "ui" as const };
  const input = { moduleKey: "work", groupKey: "entry" as const, role: "input" as const };

  assert.deepEqual(sourceCodeAnalysisSelectionAfterClick(ui, input), input);
  assert.equal(sourceCodeAnalysisSelectionAfterClick(input, input), null);
});

test("total-code cells use a relative meter while small role values stay muted", () => {
  const rows = analysisTableRows(analysisSnapshot());
  const columns = createSourceCodeAnalysisColumns(undefined, 5_000);
  const work = rows.find((row) => row.key === "work");
  const operations = rows.find((row) => row.key === "operations");
  assert.ok(work);
  assert.ok(operations);

  assert.deepEqual(columns.find((column) => column.key === "total")?.cell(work), {
    kind: "meter",
    value: 5_000,
    max: 5_000,
    label: "0.50",
    title: "工作管理：0.50 万行",
  });
  assert.deepEqual(columns.find((column) => column.key === "assurance")?.cell(operations), {
    kind: "text",
    value: "<0.1",
    tone: "muted",
    font: "mono",
  });
});
