import type {
  DataSurfaceCellSpec,
  DataSurfaceColumnSpec,
  DataSurfaceDisplaySpec,
} from "@workspace/core/ui";
import type {
  SourceCodeAnalysisCapabilityRow,
  SourceCodeAnalysisModuleRow,
  SourceCodeAnalysisRole,
  SourceCodeAnalysisRoleCounts,
  SourceCodeAnalysisSnapshot,
} from "@workspace/platform/source-code-analysis-contract";
import {
  SOURCE_CODE_ANALYSIS_ROLES,
  SOURCE_CODE_ANALYSIS_ROLE_LABELS,
} from "@workspace/platform/source-code-analysis-contract";
import {
  SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS,
  displayGroupLines,
  type SourceCodeAnalysisDisplayGroup,
} from "./source-code-analysis-display";
import {
  balanceCodeVolumeMatrix,
  formatBalancedCodeVolumeInTenThousands,
} from "./source-code-analysis-format";

export interface SourceCodeAnalysisColumnDisclosure {
  expandedGroupKey: string | null;
  onToggleGroup: (groupKey: string) => void;
}

export interface CapabilityAnalysisTableRow extends SourceCodeAnalysisCapabilityRow {
  moduleLabel: string;
  displayLines: number;
  displayRoles: SourceCodeAnalysisRoleCounts;
  ownership: "declared" | "unassigned";
}

function sumCapabilityRoles(
  rows: readonly SourceCodeAnalysisCapabilityRow[],
  role: SourceCodeAnalysisRole,
) {
  return rows.reduce((sum, row) => sum + row.roles[role], 0);
}

function createUnassignedCapabilityRow(
  module: SourceCodeAnalysisModuleRow,
  rows: readonly SourceCodeAnalysisCapabilityRow[],
  label: string,
): SourceCodeAnalysisCapabilityRow | null {
  const roles = Object.fromEntries(SOURCE_CODE_ANALYSIS_ROLES.map((role) => [
    role,
    Math.max(0, module.roles[role] - sumCapabilityRoles(rows, role)),
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
      module.mixedResponsibilityFileCount
        - rows.reduce((sum, row) => sum + row.mixedResponsibilityFileCount, 0),
    ),
  };
}

function recursiveCapabilityRows(rows: readonly SourceCodeAnalysisCapabilityRow[]) {
  const children = new Map<string | null, SourceCodeAnalysisCapabilityRow[]>();
  for (const row of rows) {
    const siblings = children.get(row.parentKey) ?? [];
    siblings.push(row);
    children.set(row.parentKey, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) =>
      (left.depth - right.depth) || left.label.localeCompare(right.label, "zh-CN"));
  }
  const ordered: SourceCodeAnalysisCapabilityRow[] = [];
  const visit = (row: SourceCodeAnalysisCapabilityRow) => {
    ordered.push(row);
    for (const child of children.get(row.key) ?? []) visit(child);
  };
  for (const root of children.get(null) ?? []) visit(root);
  return ordered;
}

/** @ui-structural-declaration */
export function capabilityAnalysisTableRows(snapshot: SourceCodeAnalysisSnapshot): CapabilityAnalysisTableRow[] {
  return [...snapshot.modules]
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"))
    .flatMap((module) => {
      const declaredRows = snapshot.capabilities
        .filter((capability) => capability.moduleKey === module.key && capability.fileCount > 0);
      if (declaredRows.length === 0) return [];
      const unassignedRow = createUnassignedCapabilityRow(module, declaredRows, "跨模块 / 待拆分");
      const orderedRows = recursiveCapabilityRows(declaredRows);
      const sourceRows = unassignedRow ? [...orderedRows, unassignedRow] : orderedRows;
      const balancedRoleLines = balanceCodeVolumeMatrix(sourceRows.map((row) =>
        SOURCE_CODE_ANALYSIS_ROLES.map((role) => row.roles[role])));
      return sourceRows.map((row, rowIndex) => {
        const displayRoles = Object.fromEntries(
          SOURCE_CODE_ANALYSIS_ROLES.map((role, roleIndex) => [role, balancedRoleLines[rowIndex][roleIndex]]),
        ) as SourceCodeAnalysisRoleCounts;
        return {
          ...row,
          moduleLabel: module.label,
          displayLines: SOURCE_CODE_ANALYSIS_ROLES.reduce((sum, role) => sum + displayRoles[role], 0),
          displayRoles,
          ownership: row.key === "__unassigned__" ? "unassigned" : "declared",
        };
      });
    });
}

function codeVolumeDisplay(displayLines: number, sourceLines: number): string | DataSurfaceDisplaySpec {
  const value = formatBalancedCodeVolumeInTenThousands(displayLines, sourceLines);
  if (sourceLines === 0 || sourceLines < 1_000) {
    return { kind: "text", value, tone: "muted", font: "mono" };
  }
  return value;
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
    cell: (row) => codeVolumeDisplay(row.displayRoles[role], row.roles[role]),
  };
}

export function createCapabilityAnalysisColumns(
  disclosure?: SourceCodeAnalysisColumnDisclosure,
): DataSurfaceColumnSpec<CapabilityAnalysisTableRow>[] {
  const columns: DataSurfaceColumnSpec<CapabilityAnalysisTableRow>[] = [
    { key: "module", label: "产品模块", cell: (row) => row.moduleLabel },
    {
      key: "capability",
      label: "源码模块",
      cell: (row): string | DataSurfaceCellSpec => row.ownership === "unassigned"
        ? { kind: "text", value: row.label, tone: "warning" }
        : `${"↳ ".repeat(Math.max(0, row.depth - 2))}${row.label}`,
    },
    {
      key: "total",
      label: "总代码",
      align: "right",
      numeric: true,
      cell: (row) => formatBalancedCodeVolumeInTenThousands(row.displayLines, row.lines),
    },
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
      cell: (row) => codeVolumeDisplay(
        displayGroupLines(row.displayRoles, group),
        displayGroupLines(row.roles, group),
      ),
    });
    if (expanded) columns.push(...group.roles.map((role) => roleColumn(group, role)));
  }

  columns.push(
    {
      key: "files",
      label: "文件",
      align: "right",
      numeric: true,
      cell: (row) => row.fileCount.toLocaleString("zh-CN"),
    },
    {
      key: "dependencies",
      label: "跨模块引用",
      align: "right",
      numeric: true,
      cell: (row) => row.crossCapabilityImportCount.toLocaleString("zh-CN"),
    },
  );
  return columns;
}
