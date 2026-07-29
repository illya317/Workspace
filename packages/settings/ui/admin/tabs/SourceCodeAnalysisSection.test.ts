import assert from "node:assert/strict";
import test from "node:test";

import type {
  SourceCodeAnalysisModuleCategory,
  SourceCodeAnalysisRoleCounts,
  SourceCodeAnalysisSnapshot,
} from "@workspace/platform/source-code-analysis-contract";
import {
  SOURCE_CODE_ANALYSIS_ROLES,
} from "@workspace/platform/source-code-analysis-contract";
import {
  analysisTableRows,
  createSourceCodeAnalysisColumns,
} from "./SourceCodeAnalysisSection";

function roleCounts(role: keyof SourceCodeAnalysisRoleCounts, lines: number): SourceCodeAnalysisRoleCounts {
  return Object.fromEntries(SOURCE_CODE_ANALYSIS_ROLES.map((key) => [key, key === role ? lines : 0])) as SourceCodeAnalysisRoleCounts;
}

function analysisSnapshot(): SourceCodeAnalysisSnapshot {
  const modules = [
    { key: "work", label: "工作管理", category: "product" as SourceCodeAnalysisModuleCategory, lines: 5_000, roles: roleCounts("ui", 5_000) },
    { key: "core", label: "核心通用", category: "shared" as SourceCodeAnalysisModuleCategory, lines: 2_000, roles: roleCounts("domain", 2_000) },
    { key: "operations", label: "生产运行", category: "engineering" as SourceCodeAnalysisModuleCategory, lines: 500, roles: roleCounts("tooling", 500) },
  ].map((module) => ({
    ...module,
    ownerResourceKey: null,
    interfacePaths: [],
    fileCount: 1,
    dependencies: [],
    dependencyCount: 0,
    crossModuleImportCount: 0,
    mixedResponsibilityFileCount: 0,
  }));
  return {
    schemaVersion: 2,
    generatedAt: "2026-07-30T00:00:00.000Z",
    sourceRevision: null,
    sourceDigest: "test",
    declarationMode: "central-manifest",
    lineMetric: "non-empty-non-comment-source-lines",
    summary: {
      fileCount: 3,
      lines: 7_500,
      declaredFileCount: 3,
      coveragePercent: 100,
      unclassifiedFileCount: 0,
      ambiguousFileCount: 0,
      missingInterfaceCount: 0,
      dependencyCycleCount: 0,
      mixedResponsibilityFileCount: 0,
    },
    modules,
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
    "ui",
    "boundary",
    "domain",
    "persistence",
    "other",
  ]);

  const expanded = createSourceCodeAnalysisColumns({
    expandedGroupKey: "boundary",
    onToggleGroup: () => undefined,
  });
  assert.deepEqual(expanded.map((column) => column.key), [
    "module",
    "total",
    "ui",
    "boundary",
    "boundary:input",
    "boundary:domainValidation",
    "boundary:contract",
    "domain",
    "persistence",
    "other",
  ]);
  assert.deepEqual(expanded.slice(4, 7).map((column) => column.label), [
    "输入",
    "领域校验",
    "契约",
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

  columns.find((column) => column.key === "other")?.onHeaderClick?.();
  assert.equal(toggledGroupKey, "other");
  assert.equal(columns.find((column) => column.key === "ui")?.onHeaderClick, undefined);
});

test("analysis rows add visual groups without changing module data", () => {
  const rows = analysisTableRows(analysisSnapshot());
  assert.deepEqual(rows.map((row) => row.label), [
    "产品模块",
    "工作管理",
    "共享与底座",
    "核心通用",
    "工程体系",
    "生产运行",
    "总计",
  ]);
  assert.equal(rows.find((row) => row.key === "work")?.lines, 5_000);
  assert.equal(rows.at(-1)?.displayLines, 7_500);
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
  assert.deepEqual(columns.find((column) => column.key === "other")?.cell(operations), {
    kind: "text",
    value: "<0.1",
    tone: "muted",
    font: "mono",
  });
});
