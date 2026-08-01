import {
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceColumnSpec,
  type DataSurfaceDisplaySpec,
} from "@workspace/core/ui";
import type {
  SourceCodeAnalysisModuleCategory,
  SourceCodeAnalysisDependencyEdge,
  SourceCodeAnalysisDependencyFileCycle,
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
  sourceCodeAnalysisCellSelected,
  sourceCodeAnalysisRelationCellState,
  type SourceCodeAnalysisRelationSelection,
} from "./source-code-analysis-relations";
import {
  balanceCodeVolumeMatrix,
  formatBalancedCodeVolumeInTenThousands,
  formatCodeVolumeInTenThousands,
} from "./source-code-analysis-format";
import {
  capabilityAnalysisTableRows,
  createCapabilityAnalysisColumns,
  type SourceCodeAnalysisColumnDisclosure,
} from "./source-code-analysis-capabilities";

export {
  capabilityAnalysisTableRows,
  createCapabilityAnalysisColumns,
  type SourceCodeAnalysisColumnDisclosure,
} from "./source-code-analysis-capabilities";

interface AnalysisTableRow extends SourceCodeAnalysisModuleRow {
  displayLines: number;
  displayRoles: SourceCodeAnalysisRoleCounts;
  rowKind: "module" | "section" | "total";
}

const ANALYSIS_ROW_GROUPS: ReadonlyArray<{
  key: string;
  label: string;
  categories: readonly SourceCodeAnalysisModuleCategory[];
}> = [
  { key: "product", label: "产品模块", categories: ["product", "system"] },
  { key: "foundation", label: "共享与底座", categories: ["shared", "composition", "dataEngineering"] },
  { key: "engineering", label: "工程体系", categories: ["engineering"] },
];

interface SourceCodeAnalysisCellRelations {
  dependencyEdges: readonly SourceCodeAnalysisDependencyEdge[];
  dependencyFileCycles: readonly SourceCodeAnalysisDependencyFileCycle[];
  selection: SourceCodeAnalysisRelationSelection;
}

function selectableAnalysisCell(
  row: AnalysisTableRow,
  group: SourceCodeAnalysisDisplayGroup,
  role: SourceCodeAnalysisRole | null,
  content: string | DataSurfaceCellSpec,
  relations?: SourceCodeAnalysisCellRelations,
): string | DataSurfaceCellSpec {
  if (!relations || row.rowKind !== "module" || displayGroupLines(row.roles, group) === 0) return content;
  return {
    kind: "interactive",
    content: typeof content === "string" ? { kind: "text", value: content } : content,
    ariaLabel: `分析${row.label}${role ? SOURCE_CODE_ANALYSIS_ROLE_LABELS[role] : group.label}的引用关系`,
    onClick: () => relations.selection.onSelectCell({ moduleKey: row.key, groupKey: group.key, role }),
    onMouseEnter: relations.selection.onHoverCell
      ? () => relations.selection.onHoverCell?.({ moduleKey: row.key, groupKey: group.key, role })
      : undefined,
    onMouseLeave: relations.selection.onHoverCell
      ? () => relations.selection.onHoverCell?.(null)
      : undefined,
  };
}

function roleColumn(
  group: SourceCodeAnalysisDisplayGroup,
  role: SourceCodeAnalysisRole,
  relations?: SourceCodeAnalysisCellRelations,
): DataSurfaceColumnSpec<AnalysisTableRow> {
  return {
    key: `${group.key}:${role}`,
    label: SOURCE_CODE_ANALYSIS_ROLE_LABELS[role],
    align: "right",
    numeric: true,
    disclosure: { groupKey: group.key, role: "detail" },
    cellState: (row) => sourceCodeAnalysisRelationCellState(
      row,
      group,
      role,
      relations?.dependencyEdges ?? [],
      relations?.dependencyFileCycles ?? [],
      relations?.selection.selectedCell ?? null,
    ),
    cellSelected: (row) => sourceCodeAnalysisCellSelected(
      row,
      group,
      role,
      relations?.selection.selectedCell ?? null,
    ),
    cell: (row) => row.rowKind === "section"
      ? null
      : selectableAnalysisCell(
          row,
          group,
          role,
          codeVolumeDisplay(row.displayRoles[role], row.roles[role]),
          relations,
        ),
  };
}

function codeVolumeDisplay(displayLines: number, sourceLines: number): string | DataSurfaceDisplaySpec {
  const value = formatBalancedCodeVolumeInTenThousands(displayLines, sourceLines);
  if (sourceLines === 0 || sourceLines < 1_000) {
    return { kind: "text", value, tone: "muted", font: "mono" };
  }
  return value;
}

export function createSourceCodeAnalysisColumns(
  disclosure?: SourceCodeAnalysisColumnDisclosure,
  maxModuleLines = 1,
  relations?: SourceCodeAnalysisCellRelations,
): DataSurfaceColumnSpec<AnalysisTableRow>[] {
  const columns: DataSurfaceColumnSpec<AnalysisTableRow>[] = [
    {
      key: "module",
      label: "模块",
      required: true,
      cell: (row) => row.rowKind === "section"
        ? { kind: "text", value: row.label, emphasis: "strong" }
        : row.label,
    },
    {
      key: "total",
      label: "总代码",
      align: "right",
      numeric: true,
      cell: (row) => {
        if (row.rowKind === "section") return null;
        const label = formatBalancedCodeVolumeInTenThousands(row.displayLines, row.lines);
        if (row.rowKind === "total") return label;
        return {
          kind: "meter",
          value: row.displayLines,
          max: maxModuleLines,
          label,
          title: `${row.label}：${label} 万行`,
        };
      },
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
      cellState: (row) => sourceCodeAnalysisRelationCellState(
        row,
        group,
        null,
        relations?.dependencyEdges ?? [],
        relations?.dependencyFileCycles ?? [],
        relations?.selection.selectedCell ?? null,
      ),
      cellSelected: (row) => sourceCodeAnalysisCellSelected(
        row,
        group,
        null,
        relations?.selection.selectedCell ?? null,
      ),
      cell: (row) => row.rowKind === "section"
        ? null
        : selectableAnalysisCell(
            row,
            group,
            null,
            codeVolumeDisplay(
              displayGroupLines(row.displayRoles, group),
              displayGroupLines(row.roles, group),
            ),
            relations,
          ),
    });
    if (expanded) {
      columns.push(...group.roles.map((role) => roleColumn(group, role, relations)));
    }
  }

  return columns;
}

function totalAnalysisRow(
  snapshot: SourceCodeAnalysisSnapshot,
  moduleRows: readonly AnalysisTableRow[],
): AnalysisTableRow {
  const roles = Object.fromEntries(
    SOURCE_CODE_ANALYSIS_ROLES.map((role) => [
      role,
      snapshot.modules.reduce((sum, module) => sum + module.roles[role], 0),
    ]),
  ) as SourceCodeAnalysisRoleCounts;
  const displayRoles = Object.fromEntries(
    SOURCE_CODE_ANALYSIS_ROLES.map((role) => [
      role,
      moduleRows.reduce((sum, module) => sum + module.displayRoles[role], 0),
    ]),
  ) as SourceCodeAnalysisRoleCounts;
  return {
    key: "total",
    label: "总计",
    category: "engineering",
    ownerResourceKey: null,
    interfacePaths: [],
    fileCount: snapshot.summary.fileCount,
    lines: snapshot.summary.lines,
    roles,
    displayLines: moduleRows.reduce((sum, module) => sum + module.displayLines, 0),
    displayRoles,
    dependencies: [],
    dependencyCount: 0,
    crossModuleImportCount: snapshot.modules.reduce((sum, module) => sum + module.crossModuleImportCount, 0),
    mixedResponsibilityFileCount: snapshot.summary.mixedResponsibilityFileCount,
    rowKind: "total",
  };
}

function emptyRoleCounts(): SourceCodeAnalysisRoleCounts {
  return Object.fromEntries(SOURCE_CODE_ANALYSIS_ROLES.map((role) => [role, 0])) as SourceCodeAnalysisRoleCounts;
}

function sectionAnalysisRow(key: string, label: string): AnalysisTableRow {
  return {
    key: `section:${key}`,
    label,
    category: "engineering",
    ownerResourceKey: null,
    interfacePaths: [],
    fileCount: 0,
    lines: 0,
    roles: emptyRoleCounts(),
    displayLines: 0,
    displayRoles: emptyRoleCounts(),
    dependencies: [],
    dependencyCount: 0,
    crossModuleImportCount: 0,
    mixedResponsibilityFileCount: 0,
    rowKind: "section",
  };
}

export function analysisTableRows(snapshot: SourceCodeAnalysisSnapshot): AnalysisTableRow[] {
  const balancedRoleLines = balanceCodeVolumeMatrix(snapshot.modules.map((module) =>
    SOURCE_CODE_ANALYSIS_ROLES.map((role) => module.roles[role])));
  const moduleRows = snapshot.modules.map((module, moduleIndex): AnalysisTableRow => {
    const displayRoles = Object.fromEntries(
      SOURCE_CODE_ANALYSIS_ROLES.map((role, roleIndex) => [role, balancedRoleLines[moduleIndex][roleIndex]]),
    ) as SourceCodeAnalysisRoleCounts;
    return {
      ...module,
      displayLines: SOURCE_CODE_ANALYSIS_ROLES.reduce((sum, role) => sum + displayRoles[role], 0),
      displayRoles,
      rowKind: "module",
    };
  });
  const groupedRows = ANALYSIS_ROW_GROUPS.flatMap((group) => {
    const groupRows = moduleRows.filter((row) => group.categories.includes(row.category));
    return groupRows.length > 0 ? [sectionAnalysisRow(group.key, group.label), ...groupRows] : [];
  });
  return [...groupedRows, totalAnalysisRow(snapshot, moduleRows)];
}

export function createSourceCodeAnalysisSection(
  snapshot: SourceCodeAnalysisSnapshot | null,
  disclosure?: SourceCodeAnalysisColumnDisclosure,
  relationSelection?: SourceCodeAnalysisRelationSelection,
): BodySurfaceSectionSpec {
  const rows = snapshot ? analysisTableRows(snapshot) : [];
  const capabilityRows = snapshot ? capabilityAnalysisTableRows(snapshot) : [];
  const capabilityColumns = createCapabilityAnalysisColumns(disclosure);
  const selectedGroup = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((group) =>
    group.key === relationSelection?.selectedCell?.groupKey);
  const selectedCell = relationSelection?.selectedCell && selectedGroup
    && rows.some((row) => row.rowKind === "module"
      && row.key === relationSelection.selectedCell?.moduleKey
      && (!relationSelection.selectedCell.role || selectedGroup.roles.includes(relationSelection.selectedCell.role))
      && displayGroupLines(row.roles, selectedGroup) > 0)
    ? relationSelection.selectedCell
    : null;
  const maxModuleLines = snapshot
    ? Math.max(1, ...rows.filter((row) => row.rowKind === "module").map((row) => row.displayLines))
    : 1;
  const analysisColumns = createSourceCodeAnalysisColumns(
    disclosure,
    maxModuleLines,
    snapshot && relationSelection ? {
      dependencyEdges: snapshot.dependencyEdges,
      dependencyFileCycles: snapshot.dependencyFileCycles ?? [],
      selection: { ...relationSelection, selectedCell },
    } : undefined,
  );
  const sections: BodySurfaceSectionSpec[] = snapshot ? [
    createMetricsSection("source-code-analysis-summary", {
      metrics: [
        { key: "lines", label: "总代码", value: `${formatCodeVolumeInTenThousands(snapshot.summary.lines)} 万行` },
        {
          key: "invalid-directions",
          label: "非法方向引用",
          value: {
            kind: "text",
            value: snapshot.summary.invalidDependencyDirectionCount.toLocaleString("zh-CN"),
            tone: snapshot.summary.invalidDependencyDirectionCount > 0 ? "danger" : "success",
            font: "mono",
          },
        },
        { key: "mixed", label: "未解耦混合职责", value: snapshot.summary.mixedResponsibilityFileCount },
        { key: "cycles", label: "真实依赖循环", value: snapshot.summary.dependencyFileCycleCount ?? 0 },
        { key: "capability-coverage", label: "模块归属覆盖", value: `${snapshot.summary.capabilityCoveragePercent}%` },
        {
          key: "new-capability-unknown",
          label: "新增未归属模块",
          value: {
            kind: "text",
            value: snapshot.summary.newUnclassifiedCapabilityFileCount.toLocaleString("zh-CN"),
            tone: snapshot.summary.newUnclassifiedCapabilityFileCount > 0 ? "danger" : "success",
            font: "mono",
          },
        },
        {
          key: "new-capability-boundary",
          label: "新增边界绕行",
          value: {
            kind: "text",
            value: snapshot.summary.newCapabilityContractViolationCount.toLocaleString("zh-CN"),
            tone: snapshot.summary.newCapabilityContractViolationCount > 0 ? "danger" : "success",
            font: "mono",
          },
        },
        {
          key: "legacy-capability-boundary",
          label: "历史边界债务",
          value: {
            kind: "text",
            value: snapshot.summary.legacyCapabilityContractViolationCount.toLocaleString("zh-CN"),
            tone: snapshot.summary.legacyCapabilityContractViolationCount > 0 ? "warning" : "success",
            font: "mono",
          },
        },
      ],
    }),
    {
      ...createPageTableSection("source-code-analysis-table", {
        rows,
        columns: analysisColumns,
        visibleColumns: analysisColumns.map((column) => column.key),
        rowKey: (row) => row.key,
        rowState: (row) => row.rowKind === "section"
          ? "section"
          : row.rowKind === "total"
            ? "total"
            : "normal",
        presentation: { density: "compact", cellWrap: "nowrap" },
        format: { kind: "matrix", rowHeaderWidth: 132 },
        scroll: { x: true },
        emptyText: "暂无源码模块分析",
      }),
      header: {
        title: "职责分布",
        badges: [
          { key: "line-unit", label: "单位：万行", tone: "muted" },
          ...(selectedCell ? [
            { key: "incoming", label: "引用选中格", tone: "info" as const },
            { key: "outgoing", label: "被选中格引用", tone: "warning" as const },
            { key: "bidirectional", label: "真实循环", tone: "success" as const },
          ] : []),
        ],
      },
    },
    {
      ...createPageTableSection("source-code-analysis-capability-table", {
        rows: capabilityRows,
        columns: capabilityColumns,
        visibleColumns: capabilityColumns.map((column) => column.key),
        rowKey: (row) => `${row.moduleKey}:${row.key}`,
        rowState: (row) => row.ownership === "unassigned" ? "warning" : "normal",
        presentation: { density: "compact", cellWrap: "nowrap" },
        format: { kind: "matrix", rowHeaderWidth: 132 },
        scroll: { x: true },
        emptyText: "暂无源码子模块分析",
      }),
      header: {
        title: "递归模块职责分布",
        badges: [
          { key: "line-unit", label: "单位：万行", tone: "muted" },
          {
            key: "unassigned",
            label: `归属债务：${(
              snapshot.summary.legacyUnclassifiedCapabilityFileCount
              + snapshot.summary.newUnclassifiedCapabilityFileCount
              + snapshot.summary.ambiguousCapabilityFileCount
            ).toLocaleString("zh-CN")}`,
            tone: snapshot.summary.legacyUnclassifiedCapabilityFileCount
              + snapshot.summary.newUnclassifiedCapabilityFileCount
              + snapshot.summary.ambiguousCapabilityFileCount > 0 ? "warning" : "muted",
          },
          {
            key: "baseline-ratchet",
            label: `待收缩基线：${snapshot.summary.staleCapabilityContractBaselineCount.toLocaleString("zh-CN")}`,
            tone: snapshot.summary.staleCapabilityContractBaselineCount > 0 ? "warning" : "muted",
          },
        ],
      },
    },
  ] : [
    createStatusSection("source-code-analysis-unavailable", {
      kind: "empty",
      content: "源码分析暂不可用，不影响系统功能",
    }),
  ];

  return {
    key: "source-code-analysis",
    header: { title: "源码模块分析" },
    body: createPageBody(sections),
  };
}
