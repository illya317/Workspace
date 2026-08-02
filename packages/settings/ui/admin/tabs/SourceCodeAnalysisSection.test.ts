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
  capabilityAnalysisTableRows,
  createCapabilityAnalysisColumns,
  createSourceCodeAnalysisSection,
  createSourceCodeAnalysisColumns,
} from "./SourceCodeAnalysisSection";
import {
  sourceCodeAnalysisL1NavigationKey,
  sourceCodeAnalysisModuleNavigationKey,
  sourceCodeAnalysisNavigationTree,
} from "./source-code-analysis-capabilities";
import { SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS } from "./source-code-analysis-display";
import {
  sourceCodeAnalysisCellSelected,
  sourceCodeAnalysisRelationCellState,
  sourceCodeAnalysisSelectionAfterClick,
} from "./source-code-analysis-relations";
function roleCounts(role: keyof SourceCodeAnalysisRoleCounts, lines: number): SourceCodeAnalysisRoleCounts { return Object.fromEntries(SOURCE_CODE_ANALYSIS_ROLES.map((key) => [key, key === role ? lines : 0])) as SourceCodeAnalysisRoleCounts; }
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
      reciprocalRoleDependencyCount: 0,
      runtimeReciprocalRoleDependencyCount: 0,
      typeAssistedReciprocalRoleDependencyCount: 0,
      dependencyFileCycleCount: 0,
      runtimeDependencyFileCycleCount: 0,
      typeAssistedDependencyFileCycleCount: 0,
      invalidDependencyDirectionCount: 0,
      capabilityGovernedFileCount: 1,
      capabilityDeclaredFileCount: 1,
      capabilityCoveragePercent: 100,
      legacyUnclassifiedCapabilityFileCount: 0,
      newUnclassifiedCapabilityFileCount: 0,
      ambiguousCapabilityFileCount: 0,
      legacyCapabilityContractViolationCount: 0,
      newCapabilityContractViolationCount: 0,
      staleCapabilityContractBaselineCount: 0,
      moduleHealthWarningCount: 0,
      acceptedModuleHealthWarningCount: 0,
    },
    modules,
    capabilities: [{
      moduleKey: "work",
      key: "meetings",
      kind: "module",
      parentKey: null,
      depth: 2,
      label: "会议",
      fileCount: 1,
      lines: 5_000,
      roles: roleCounts("ui", 5_000),
      dependencies: [{ moduleKey: "core", capabilityKey: null }],
      dependencyCount: 1,
      crossCapabilityImportCount: 1,
      mixedResponsibilityFileCount: 0,
    }],
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
    capabilityDependencyEdges: [{
      sourceModuleKey: "work",
      sourceCapabilityKey: "meetings",
      sourceRole: "ui",
      targetModuleKey: "core",
      targetCapabilityKey: null,
      targetRole: "domain",
      importCount: 1,
      valueImportCount: 1,
      typeOnlyImportCount: 0,
      dynamicImportCount: 0,
      reExportCount: 0,
      typeOnlyReExportCount: 0,
    }],
    capabilityContractViolations: [],
    moduleHealthWarnings: [],
    reciprocalRoleDependencies: [],
    dependencyFileCycles: [],
    invalidDependencyDirections: [],
    dependencyCycles: [],
    diagnostics: {
      unclassifiedFiles: [],
      ambiguousFiles: [],
      missingInterfaces: [],
      mixedResponsibilityFiles: [],
      legacyUnclassifiedCapabilityFiles: [],
      newUnclassifiedCapabilityFiles: [],
      ambiguousCapabilityFiles: [],
      legacyCapabilityContractViolations: [],
      newCapabilityContractViolations: [],
      staleCapabilityContractBaseline: [],
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
    "application",
    "adapter",
    "domain",
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
    "entry:assembly",
    "entry:ui",
    "entry:input",
    "application",
    "adapter",
    "domain",
    "contract",
    "assurance",
  ]);
  assert.deepEqual(expanded.slice(3, 7).map((column) => column.label), [
    "组合壳",
    "公共出口",
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
  const domain = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) => group.key === "domain");
  const assurance = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) => group.key === "assurance");
  assert.ok(work);
  assert.ok(settings);
  assert.ok(core);
  assert.ok(operations);
  assert.ok(entry);
  assert.ok(domain);
  assert.ok(assurance);

  const selectedCell = { moduleKey: "work", groupKey: "entry" as const, role: "ui" as const };
  assert.equal(sourceCodeAnalysisRelationCellState(work, entry, "ui", snapshot.dependencyEdges, [], selectedCell), "normal");
  assert.equal(sourceCodeAnalysisRelationCellState(work, entry, null, snapshot.dependencyEdges, [], selectedCell), "normal");
  assert.equal(sourceCodeAnalysisCellSelected(work, entry, "ui", selectedCell), true);
  assert.equal(sourceCodeAnalysisRelationCellState(core, domain, "domain", snapshot.dependencyEdges, [], selectedCell), "warning");
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
    cyclePath: ["packages/work/ui.ts", "packages/settings/ui.ts", "packages/work/ui.ts"],
    cells: [
      { moduleKey: "work", capabilityKey: "meetings", role: "ui" as const },
      { moduleKey: "settings", capabilityKey: null, role: "ui" as const },
    ],
    evidence: [],
    blocking: true as const,
    waivable: false as const,
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

test("summary groups source governance into total code and three decision metrics", () => {
  const snapshot = analysisSnapshot();
  snapshot.summary.invalidDependencyDirectionCount = 3;
  snapshot.summary.dependencyFileCycleCount = 2;
  snapshot.summary.newUnclassifiedCapabilityFileCount = 4;
  snapshot.summary.mixedResponsibilityFileCount = 5;
  snapshot.summary.newCapabilityContractViolationCount = 2;
  snapshot.summary.legacyCapabilityContractViolationCount = 8;
  const section = createSourceCodeAnalysisSection(snapshot, {
    disclosure: {
      expandedGroupKey: "entry",
      onToggleGroup: () => undefined,
    },
  });
  assert.equal(section.body.kind, "section");
  if (section.body.kind !== "section" || section.body.layout === "split") return;
  const summary = section.body.sections?.find((candidate) => candidate.key === "source-code-analysis-summary");
  assert.equal(summary?.body.kind, "data");
  if (summary?.body.kind !== "data" || summary.body.data.kind !== "summary") return;
  assert.deepEqual(summary.body.data.metrics.map((metric) => metric.key), [
    "lines",
    "dependency-structure",
    "module-cohesion",
    "interface-boundary",
  ]);
  assert.deepEqual(summary.body.data.metrics.find((metric) => metric.key === "dependency-structure")?.value, {
    kind: "text",
    value: "方向 3 · 循环 2",
    tone: "danger",
    font: "mono",
  });
  assert.deepEqual(summary.body.data.metrics.find((metric) => metric.key === "module-cohesion")?.value, {
    kind: "text",
    value: "未归属 4 · 混合 5 · 复核 0",
    tone: "danger",
    font: "mono",
  });
  assert.deepEqual(summary.body.data.metrics.find((metric) => metric.key === "interface-boundary")?.value, {
    kind: "text",
    value: "新增 2 · 存量 8",
    tone: "danger",
    font: "mono",
  });
});

test("summary keeps historical Interface debt visible without treating it as a new violation", () => {
  const snapshot = analysisSnapshot();
  snapshot.summary.legacyCapabilityContractViolationCount = 8;
  const section = createSourceCodeAnalysisSection(snapshot);
  assert.equal(section.body.kind, "section");
  if (section.body.kind !== "section" || section.body.layout === "split") return;
  const summary = section.body.sections?.find((candidate) => candidate.key === "source-code-analysis-summary");
  if (summary?.body.kind !== "data" || summary.body.data.kind !== "summary") return;
  assert.deepEqual(summary.body.data.metrics.find((metric) => metric.key === "interface-boundary")?.value, {
    kind: "text",
    value: "新增 0 · 存量 8",
    tone: "warning",
    font: "mono",
  });
});

test("source module rows and L1 drilldown use backend ownership and dependency counts", () => {
  const snapshot = analysisSnapshot();
  assert.deepEqual(capabilityAnalysisTableRows(snapshot).map((row) => ({
    module: row.moduleLabel,
    capability: row.label,
    files: row.fileCount,
    imports: row.crossCapabilityImportCount,
  })), [{ module: "工作管理", capability: "会议", files: 1, imports: 1 }]);

  const section = createSourceCodeAnalysisSection(snapshot, {
    selectedNavigationKey: sourceCodeAnalysisL1NavigationKey("work"),
  });
  assert.equal(section.body.kind, "section");
  if (section.body.kind !== "section" || section.body.layout === "split") return;
  assert.ok(section.body.sections?.some((candidate) => candidate.key === "source-code-analysis-module-children"));
});

test("source navigation exposes every recursive level and aggregates parent subtree code", () => {
  const snapshot = analysisSnapshot();
  const workModule = snapshot.modules.find((module) => module.key === "work")!;
  workModule.lines = 60;
  workModule.fileCount = 3;
  workModule.roles = roleCounts("application", 50);
  workModule.roles.input = 10;
  snapshot.capabilities = [
    {
      ...snapshot.capabilities[0],
      key: "entry",
      parentKey: null,
      depth: 1,
      label: "L1 接入层",
      fileCount: 1,
      lines: 10,
      roles: roleCounts("input", 10),
    },
    {
      ...snapshot.capabilities[0],
      key: "tasks",
      parentKey: null,
      depth: 2,
      label: "任务",
      fileCount: 1,
      lines: 20,
      roles: roleCounts("application", 20),
    },
    {
      ...snapshot.capabilities[0],
      key: "task-import",
      parentKey: "tasks",
      depth: 3,
      label: "任务导入",
      fileCount: 1,
      lines: 30,
      roles: roleCounts("application", 30),
    },
  ];

  const rows = capabilityAnalysisTableRows(snapshot).filter((row) => row.moduleKey === "work");
  assert.deepEqual(rows.map((row) => [row.key, row.depth, row.subtreeLines]), [
    ["entry", 1, 10],
    ["tasks", 2, 50],
    ["task-import", 3, 30],
  ]);

  const product = sourceCodeAnalysisNavigationTree(snapshot).find((group) => group.key === "source:group:product");
  const work = product?.children.find((module) => module.key === sourceCodeAnalysisL1NavigationKey("work"));
  assert.deepEqual(work?.children.map((node) => [node.label, node.children.map((child) => child.label)]), [
    ["L1 接入层", []],
    ["任务", ["任务导入"]],
  ]);

  const leaf = createSourceCodeAnalysisSection(snapshot, {
    selectedNavigationKey: sourceCodeAnalysisModuleNavigationKey("work", "task-import"),
  });
  assert.equal(leaf.body.kind, "section");
  if (leaf.body.kind !== "section" || leaf.body.layout === "split") return;
  assert.ok(leaf.body.sections?.some((section) => section.key === "source-code-analysis-role-summary"));
  assert.ok(!leaf.body.sections?.some((section) => section.key === "source-code-analysis-module-children"));
});

test("source module columns change with the selected L1 semantics", () => {
  const collapsed = createCapabilityAnalysisColumns("product", {
    expandedGroupKey: null,
    onToggleGroup: () => undefined,
  });
  assert.deepEqual(collapsed.map((column) => column.key), [
    "module",
    "total",
    "entry",
    "application",
    "adapter",
    "domain",
    "contract",
    "assurance",
    "files",
    "health",
  ]);

  const expanded = createCapabilityAnalysisColumns("product", {
    expandedGroupKey: "domain",
    onToggleGroup: () => undefined,
  });
  assert.deepEqual(expanded.filter((column) => column.key.startsWith("domain:")).map((column) => column.key), [
    "domain:domainValidation",
    "domain:domain",
  ]);

  assert.deepEqual(createCapabilityAnalysisColumns("operations").map((column) => column.label), [
    "运行 Module",
    "运行角色",
    "脚本 / 文件",
    "子树代码",
    "运行依赖",
    "调用引用",
    "健康",
  ]);
  assert.deepEqual(createCapabilityAnalysisColumns("tooling").map((column) => column.label), [
    "治理 Module",
    "治理形态",
    "检查 / 测试文件",
    "子树代码",
    "检查依赖",
    "工具引用",
    "健康",
  ]);
});

test("source module rows expose unassigned responsibility lines so module totals reconcile", () => {
  const snapshot = analysisSnapshot();
  const work = snapshot.modules.find((module) => module.key === "work");
  assert.ok(work);
  work.fileCount = 2;
  work.lines = 5_500;
  work.roles = {
    ...work.roles,
    application: 500,
  };

  const rows = capabilityAnalysisTableRows(snapshot).filter((row) => row.moduleKey === "work");
  assert.deepEqual(rows.map((row) => [row.label, row.lines, row.ownership]), [
    ["会议", 5_000, "declared"],
    ["跨模块 / 待拆分", 500, "unassigned"],
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.lines, 0), work.lines);
  assert.equal(rows.at(-1)?.roles.application, 500);
});
