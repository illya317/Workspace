import type {
  DataSurfaceCellSpec,
  DataSurfaceColumnSpec,
  DataSurfaceDisplaySpec,
} from "@workspace/core/ui";
import type {
  SourceCodeAnalysisCapabilityRow,
  SourceCodeAnalysisModuleCategory,
  SourceCodeAnalysisModuleKind,
  SourceCodeAnalysisModuleRow,
  SourceCodeAnalysisRole,
  SourceCodeAnalysisRoleCounts,
  SourceCodeAnalysisSnapshot,
} from "@workspace/platform/source-code-analysis-contract";
import {
  SOURCE_CODE_ANALYSIS_MODULE_CATEGORY_LABELS,
  SOURCE_CODE_ANALYSIS_ROLES,
  SOURCE_CODE_ANALYSIS_ROLE_LABELS,
} from "@workspace/platform/source-code-analysis-contract";
import {
  SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS,
  displayGroupLines,
  type SourceCodeAnalysisDisplayGroup,
} from "./source-code-analysis-display";
import { formatCodeVolumeInTenThousands } from "./source-code-analysis-format";

export interface SourceCodeAnalysisColumnDisclosure {
  expandedGroupKey: string | null;
  onToggleGroup: (groupKey: string) => void;
}

export type SourceCodeAnalysisViewKind = "product" | "shared" | "data" | "operations" | "tooling";

export interface SourceCodeAnalysisNavigationNode {
  key: string;
  label: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "muted";
  children: SourceCodeAnalysisNavigationNode[];
}

export type SourceCodeAnalysisNavigationSelection =
  | { kind: "root" }
  | { kind: "group"; groupKey: string }
  | { kind: "l1"; moduleKey: string }
  | { kind: "module"; moduleKey: string; capabilityKey: string };

export interface CapabilityAnalysisTableRow extends SourceCodeAnalysisCapabilityRow {
  moduleLabel: string;
  moduleCategory: SourceCodeAnalysisModuleCategory;
  pathLabels: string[];
  childCount: number;
  descendantCount: number;
  subtreeFileCount: number;
  subtreeLines: number;
  subtreeRoles: SourceCodeAnalysisRoleCounts;
  subtreeDependencyCount: number;
  subtreeCrossCapabilityImportCount: number;
  requiredWarningCount: number;
  acceptedWarningCount: number;
  displayLines: number;
  displayRoles: SourceCodeAnalysisRoleCounts;
  ownership: "declared" | "unassigned";
}

export const SOURCE_CODE_ANALYSIS_NAVIGATION_GROUPS: ReadonlyArray<{
  key: string;
  label: string;
  categories: readonly SourceCodeAnalysisModuleCategory[];
}> = [
  { key: "product", label: "产品模块", categories: ["product", "system"] },
  { key: "foundation", label: "共享与底座", categories: ["shared", "composition", "dataEngineering"] },
  { key: "engineering", label: "工程体系", categories: ["engineering"] },
];

const MODULE_KIND_LABELS: Record<SourceCodeAnalysisModuleKind, string> = {
  module: "实现 Module",
  entry: "接入入口",
  orchestrator: "组合编排",
  appendOnlyHistory: "追加历史",
  retired: "已退役",
};

export function sourceCodeAnalysisModuleKindLabel(kind: SourceCodeAnalysisModuleKind) {
  return MODULE_KIND_LABELS[kind];
}

export function sourceCodeAnalysisViewKind(module: SourceCodeAnalysisModuleRow): SourceCodeAnalysisViewKind {
  if (module.key === "operations") return "operations";
  if (module.key === "tooling") return "tooling";
  if (module.category === "dataEngineering") return "data";
  if (module.category === "shared" || module.category === "composition") return "shared";
  return "product";
}

function sumRoles(rows: readonly SourceCodeAnalysisCapabilityRow[]) {
  return Object.fromEntries(SOURCE_CODE_ANALYSIS_ROLES.map((role) => [
    role,
    rows.reduce((sum, row) => sum + row.roles[role], 0),
  ])) as SourceCodeAnalysisRoleCounts;
}

function createUnassignedCapabilityRow(
  module: SourceCodeAnalysisModuleRow,
  rows: readonly SourceCodeAnalysisCapabilityRow[],
  label: string,
): SourceCodeAnalysisCapabilityRow | null {
  const roles = Object.fromEntries(SOURCE_CODE_ANALYSIS_ROLES.map((role) => [
    role,
    Math.max(0, module.roles[role] - rows.reduce((sum, row) => sum + row.roles[role], 0)),
  ])) as SourceCodeAnalysisRoleCounts;
  const lines = SOURCE_CODE_ANALYSIS_ROLES.reduce((sum, role) => sum + roles[role], 0);
  if (lines === 0) return null;
  return {
    moduleKey: module.key,
    key: "__unassigned__",
    kind: "module",
    parentKey: null,
    depth: 2,
    label,
    fileCount: Math.max(0, module.fileCount - rows.reduce((sum, row) => sum + row.fileCount, 0)),
    lines,
    roles,
    dependencies: [],
    dependencyCount: 0,
    crossCapabilityImportCount: 0,
    mixedResponsibilityFileCount: Math.max(
      0,
      module.mixedResponsibilityFileCount - rows.reduce((sum, row) => sum + row.mixedResponsibilityFileCount, 0),
    ),
  };
}

function descendantsOf(
  row: SourceCodeAnalysisCapabilityRow,
  rows: readonly SourceCodeAnalysisCapabilityRow[],
): SourceCodeAnalysisCapabilityRow[] {
  const children = rows.filter((candidate) => candidate.parentKey === row.key);
  return [row, ...children.flatMap((child) => descendantsOf(child, rows))];
}

function pathLabelsFor(
  row: SourceCodeAnalysisCapabilityRow,
  byKey: ReadonlyMap<string, SourceCodeAnalysisCapabilityRow>,
) {
  const labels = [row.label];
  let parentKey = row.parentKey;
  const seen = new Set<string>();
  while (parentKey && !seen.has(parentKey)) {
    seen.add(parentKey);
    const parent = byKey.get(parentKey);
    if (!parent) break;
    labels.unshift(parent.label);
    parentKey = parent.parentKey;
  }
  return labels;
}

/** Includes zero-direct-file parents so the UI exposes the complete recursive contract. */
export function capabilityAnalysisTableRows(snapshot: SourceCodeAnalysisSnapshot): CapabilityAnalysisTableRow[] {
  return snapshot.modules.flatMap((module) => {
    const declaredRows = snapshot.capabilities.filter((capability) => capability.moduleKey === module.key);
    if (declaredRows.length === 0) return [];
    const unassigned = createUnassignedCapabilityRow(module, declaredRows, "跨模块 / 待拆分");
    const sourceRows = unassigned ? [...declaredRows, unassigned] : declaredRows;
    const byKey = new Map(declaredRows.map((row) => [row.key, row]));
    return sourceRows.map((row): CapabilityAnalysisTableRow => {
      const subtree = row.key === "__unassigned__" ? [row] : descendantsOf(row, declaredRows);
      const subtreeRoles = sumRoles(subtree);
      const subtreeDependencies = new Set(subtree.flatMap((candidate) => candidate.dependencies.map((dependency) =>
        `${dependency.moduleKey}/${dependency.capabilityKey ?? "L1"}`)));
      const warningStatuses = snapshot.moduleHealthWarnings
        .filter((warning) => subtree.some((candidate) => warning.moduleId === `${candidate.moduleKey}/${candidate.key}`))
        .map((warning) => warning.reviewStatus);
      return {
        ...row,
        moduleLabel: module.label,
        moduleCategory: module.category,
        pathLabels: row.key === "__unassigned__" ? [row.label] : pathLabelsFor(row, byKey),
        childCount: declaredRows.filter((candidate) => candidate.parentKey === row.key).length,
        descendantCount: Math.max(0, subtree.length - 1),
        subtreeFileCount: subtree.reduce((sum, candidate) => sum + candidate.fileCount, 0),
        subtreeLines: subtree.reduce((sum, candidate) => sum + candidate.lines, 0),
        subtreeRoles,
        subtreeDependencyCount: subtreeDependencies.size,
        subtreeCrossCapabilityImportCount: subtree.reduce(
          (sum, candidate) => sum + candidate.crossCapabilityImportCount,
          0,
        ),
        requiredWarningCount: warningStatuses.filter((status) => status === "required").length,
        acceptedWarningCount: warningStatuses.filter((status) => status === "accepted").length,
        displayLines: subtree.reduce((sum, candidate) => sum + candidate.lines, 0),
        displayRoles: subtreeRoles,
        ownership: row.key === "__unassigned__" ? "unassigned" : "declared",
      };
    });
  });
}

export function sourceCodeAnalysisCapabilityRowsForParent(
  rows: readonly CapabilityAnalysisTableRow[],
  moduleKey: string,
  parentKey: string | null,
) {
  return rows.filter((row) => row.moduleKey === moduleKey && row.parentKey === parentKey);
}

export function sourceCodeAnalysisGroupNavigationKey(groupKey: string) {
  return `source:group:${groupKey}`;
}

export function sourceCodeAnalysisL1NavigationKey(moduleKey: string) {
  return `source:l1:${moduleKey}`;
}

export function sourceCodeAnalysisModuleNavigationKey(moduleKey: string, capabilityKey: string) {
  return `source:module:${moduleKey}:${capabilityKey}`;
}

export function parseSourceCodeAnalysisNavigationKey(key: string): SourceCodeAnalysisNavigationSelection | null {
  if (key === "view:source") return { kind: "root" };
  const parts = key.split(":");
  if (parts[0] !== "source") return null;
  if (parts[1] === "group" && parts.length === 3) return { kind: "group", groupKey: parts[2] };
  if (parts[1] === "l1" && parts.length === 3) return { kind: "l1", moduleKey: parts[2] };
  if (parts[1] === "module" && parts.length === 4) {
    return { kind: "module", moduleKey: parts[2], capabilityKey: parts[3] };
  }
  return null;
}

function navigationCodeLabel(lines: number) {
  return `${formatCodeVolumeInTenThousands(lines)} 万行`;
}

function capabilityNavigationNode(
  row: CapabilityAnalysisTableRow,
  allRows: readonly CapabilityAnalysisTableRow[],
): SourceCodeAnalysisNavigationNode {
  return {
    key: sourceCodeAnalysisModuleNavigationKey(row.moduleKey, row.key),
    label: row.label,
    statusLabel: row.requiredWarningCount > 0
      ? `${row.requiredWarningCount} 项复核`
      : navigationCodeLabel(row.subtreeLines),
    statusTone: row.requiredWarningCount > 0 ? "warning" : row.subtreeLines === 0 ? "muted" : "success",
    children: sourceCodeAnalysisCapabilityRowsForParent(allRows, row.moduleKey, row.key)
      .map((child) => capabilityNavigationNode(child, allRows)),
  };
}

export function sourceCodeAnalysisNavigationTree(snapshot: SourceCodeAnalysisSnapshot) {
  const capabilityRows = capabilityAnalysisTableRows(snapshot).filter((row) => row.ownership === "declared");
  return SOURCE_CODE_ANALYSIS_NAVIGATION_GROUPS.flatMap((group): SourceCodeAnalysisNavigationNode[] => {
    const modules = snapshot.modules.filter((module) => group.categories.includes(module.category));
    if (modules.length === 0) return [];
    return [{
      key: sourceCodeAnalysisGroupNavigationKey(group.key),
      label: group.label,
      statusLabel: `${modules.length} 个 L1`,
      statusTone: "success",
      children: modules.map((module) => {
        const roots = sourceCodeAnalysisCapabilityRowsForParent(capabilityRows, module.key, null);
        const requiredWarnings = capabilityRows
          .filter((row) => row.moduleKey === module.key)
          .reduce((sum, row) => sum + snapshot.moduleHealthWarnings.filter((warning) =>
            warning.moduleId === `${row.moduleKey}/${row.key}` && warning.reviewStatus === "required").length, 0);
        return {
          key: sourceCodeAnalysisL1NavigationKey(module.key),
          label: module.label,
          statusLabel: requiredWarnings > 0 ? `${requiredWarnings} 项复核` : navigationCodeLabel(module.lines),
          statusTone: requiredWarnings > 0 ? "warning" as const : module.lines === 0 ? "muted" as const : "success" as const,
          children: roots.map((row) => capabilityNavigationNode(row, capabilityRows)),
        };
      }),
    }];
  });
}

function codeVolumeDisplay(lines: number): string | DataSurfaceDisplaySpec {
  const value = formatCodeVolumeInTenThousands(lines);
  return lines === 0 || lines < 1_000
    ? { kind: "text", value, tone: "muted", font: "mono" }
    : value;
}

function moduleCell(row: CapabilityAnalysisTableRow): DataSurfaceCellSpec {
  if (row.ownership === "unassigned") return { kind: "text", value: row.label, tone: "warning" };
  return {
    kind: "stack",
    gap: "none",
    items: [
      { kind: "text", value: row.label, emphasis: "strong" },
      row.childCount > 0
        ? { kind: "text", value: `${row.childCount} 个直属 · ${row.descendantCount} 个下级`, tone: "muted" }
        : { kind: "text", value: "叶子 Module", tone: "muted" },
    ],
  };
}

function healthCell(row: CapabilityAnalysisTableRow): DataSurfaceCellSpec {
  if (row.requiredWarningCount > 0) {
    return { kind: "badge", label: `需复核 ${row.requiredWarningCount}`, tone: "amber" };
  }
  if (row.acceptedWarningCount > 0) {
    return { kind: "badge", label: `已接受 ${row.acceptedWarningCount}`, tone: "blue" };
  }
  return { kind: "badge", label: "通过", tone: "green" };
}

function primaryResponsibility(row: CapabilityAnalysisTableRow) {
  const groups = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS
    .map((group) => ({ label: group.label, lines: displayGroupLines(row.subtreeRoles, group) }))
    .sort((left, right) => right.lines - left.lines);
  return groups[0]?.lines ? groups[0].label : "无直接实现";
}

function roleColumn(
  group: SourceCodeAnalysisDisplayGroup,
  role: SourceCodeAnalysisRole,
): DataSurfaceColumnSpec<CapabilityAnalysisTableRow> {
  return {
    key: `${group.key}:${role}`,
    label: SOURCE_CODE_ANALYSIS_ROLE_LABELS[role],
    align: "right",
    numeric: true,
    disclosure: { groupKey: group.key, role: "detail" },
    cell: (row) => codeVolumeDisplay(row.subtreeRoles[role]),
  };
}

function productColumns(
  disclosure?: SourceCodeAnalysisColumnDisclosure,
): DataSurfaceColumnSpec<CapabilityAnalysisTableRow>[] {
  const columns: DataSurfaceColumnSpec<CapabilityAnalysisTableRow>[] = [
    { key: "module", label: "业务 Module", required: true, cell: moduleCell },
    { key: "total", label: "子树代码", align: "right", numeric: true, cell: (row) => codeVolumeDisplay(row.subtreeLines) },
  ];
  for (const group of SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS) {
    const expandable = group.roles.length > 1;
    const expanded = disclosure?.expandedGroupKey === group.key;
    const interactive = expandable && Boolean(disclosure);
    columns.push({
      key: group.key,
      label: interactive ? `${group.label}${expanded ? " ▾" : " ▸"}` : group.label,
      align: "right",
      numeric: true,
      disclosure: interactive ? { groupKey: group.key, role: "trigger", expanded: Boolean(expanded) } : undefined,
      onHeaderClick: interactive ? () => disclosure?.onToggleGroup(group.key) : undefined,
      cell: (row) => codeVolumeDisplay(displayGroupLines(row.subtreeRoles, group)),
    });
    if (expanded) columns.push(...group.roles.map((role) => roleColumn(group, role)));
  }
  columns.push(
    { key: "files", label: "子树文件", align: "right", numeric: true, cell: (row) => row.subtreeFileCount },
    { key: "health", label: "健康", cell: healthCell },
  );
  return columns;
}

function structuralColumns(input: {
  moduleLabel: string;
  kindLabel: string;
  fileLabel: string;
  dependencyLabel: string;
  importLabel: string;
  showPrimaryResponsibility?: boolean;
}): DataSurfaceColumnSpec<CapabilityAnalysisTableRow>[] {
  return [
    { key: "module", label: input.moduleLabel, required: true, cell: moduleCell },
    { key: "kind", label: input.kindLabel, cell: (row) => sourceCodeAnalysisModuleKindLabel(row.kind) },
    ...(input.showPrimaryResponsibility ? [{
      key: "primary-role",
      label: "主职责",
      cell: (row: CapabilityAnalysisTableRow) => primaryResponsibility(row),
    }] : []),
    { key: "files", label: input.fileLabel, align: "right" as const, numeric: true, cell: (row) => row.subtreeFileCount },
    { key: "total", label: "子树代码", align: "right" as const, numeric: true, cell: (row) => codeVolumeDisplay(row.subtreeLines) },
    { key: "dependencies", label: input.dependencyLabel, align: "right" as const, numeric: true, cell: (row) => row.subtreeDependencyCount },
    { key: "imports", label: input.importLabel, align: "right" as const, numeric: true, cell: (row) => row.subtreeCrossCapabilityImportCount },
    { key: "health", label: "健康", cell: healthCell },
  ];
}

export function createCapabilityAnalysisColumns(
  viewKind: SourceCodeAnalysisViewKind,
  disclosure?: SourceCodeAnalysisColumnDisclosure,
): DataSurfaceColumnSpec<CapabilityAnalysisTableRow>[] {
  if (viewKind === "product") return productColumns(disclosure);
  if (viewKind === "shared") {
    return structuralColumns({
      moduleLabel: "共享 Module",
      kindLabel: "形态",
      fileLabel: "子树文件",
      dependencyLabel: "依赖 Module",
      importLabel: "跨 Module 引用",
      showPrimaryResponsibility: true,
    });
  }
  if (viewKind === "data") {
    return structuralColumns({
      moduleLabel: "数据 Module",
      kindLabel: "生命周期",
      fileLabel: "模型 / 历史文件",
      dependencyLabel: "数据依赖",
      importLabel: "契约引用",
    });
  }
  if (viewKind === "operations") {
    return structuralColumns({
      moduleLabel: "运行 Module",
      kindLabel: "运行角色",
      fileLabel: "脚本 / 文件",
      dependencyLabel: "运行依赖",
      importLabel: "调用引用",
    });
  }
  return structuralColumns({
    moduleLabel: "治理 Module",
    kindLabel: "治理形态",
    fileLabel: "检查 / 测试文件",
    dependencyLabel: "检查依赖",
    importLabel: "工具引用",
  });
}

export function sourceCodeAnalysisCategoryLabel(category: SourceCodeAnalysisModuleCategory) {
  return SOURCE_CODE_ANALYSIS_MODULE_CATEGORY_LABELS[category];
}
