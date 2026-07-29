import {
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  createVisualizationSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type DataSurfaceDisplaySpec,
} from "@workspace/core/ui";
import type {
  SourceCodeAnalysisModuleCategory,
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
} from "./source-code-analysis-display";
import {
  balanceCodeVolumeMatrix,
  formatBalancedCodeVolumeInTenThousands,
  formatCodeVolumeInTenThousands,
} from "./source-code-analysis-format";

interface AnalysisTableRow extends SourceCodeAnalysisModuleRow {
  displayLines: number;
  displayRoles: SourceCodeAnalysisRoleCounts;
  rowKind: "module" | "section" | "total";
}

const ANALYSIS_ROW_GROUPS: readonly Array<{
  key: string;
  label: string;
  categories: readonly SourceCodeAnalysisModuleCategory[];
}> = [
  { key: "product", label: "产品模块", categories: ["product", "system"] },
  { key: "foundation", label: "共享与底座", categories: ["shared", "composition", "dataEngineering"] },
  { key: "engineering", label: "工程体系", categories: ["engineering"] },
];

export interface SourceCodeAnalysisColumnDisclosure {
  expandedGroupKey: string | null;
  onToggleGroup: (groupKey: string) => void;
}

function roleColumn(
  groupKey: string,
  role: SourceCodeAnalysisRole,
): DataSurfaceColumnSpec<AnalysisTableRow> {
  return {
    key: `${groupKey}:${role}`,
    label: SOURCE_CODE_ANALYSIS_ROLE_LABELS[role],
    align: "right",
    numeric: true,
    disclosure: { groupKey, role: "detail" },
    cell: (row) => row.rowKind === "section"
      ? null
      : codeVolumeDisplay(row.displayRoles[role], row.roles[role]),
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
      cell: (row) => row.rowKind === "section"
        ? null
        : codeVolumeDisplay(
            displayGroupLines(row.displayRoles, group),
            displayGroupLines(row.roles, group),
          ),
    });
    if (expanded) {
      columns.push(...group.roles.map((role) => roleColumn(group.key, role)));
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

function responsibilityCompositionSection(totalRow: AnalysisTableRow): BodySurfaceSectionSpec {
  const totalLines = Math.max(totalRow.displayLines, 1);
  return {
    ...createVisualizationSection("source-code-analysis-composition", {
      kind: "chart",
      chart: {
        visual: {
          kind: "barChart",
          bars: SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.map((group) => {
            const lines = displayGroupLines(totalRow.displayRoles, group);
            const percentage = (lines / totalLines) * 100;
            const volume = formatCodeVolumeInTenThousands(lines);
            return {
              key: group.key,
              label: group.label,
              value: lines,
              valueLabel: `${volume} · ${percentage.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`,
              title: `${group.label}：${volume} 万行，占 ${percentage.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`,
            };
          }),
          height: 116,
        },
      },
    }),
    header: { title: "职责构成" },
  };
}

export function createSourceCodeAnalysisSection(
  snapshot: SourceCodeAnalysisSnapshot | null,
  disclosure?: SourceCodeAnalysisColumnDisclosure,
): BodySurfaceSectionSpec {
  const rows = snapshot ? analysisTableRows(snapshot) : [];
  const maxModuleLines = snapshot
    ? Math.max(1, ...rows.filter((row) => row.rowKind === "module").map((row) => row.displayLines))
    : 1;
  const analysisColumns = createSourceCodeAnalysisColumns(disclosure, maxModuleLines);
  const totalRow = rows.find((row) => row.rowKind === "total");
  const sections: BodySurfaceSectionSpec[] = snapshot ? [
    createMetricsSection("source-code-analysis-summary", {
      metrics: [
        { key: "lines", label: "总代码", value: `${formatCodeVolumeInTenThousands(snapshot.summary.lines)} 万行` },
        { key: "files", label: "源码文件", value: snapshot.summary.fileCount.toLocaleString("zh-CN") },
        { key: "mixed", label: "未解耦混合职责", value: snapshot.summary.mixedResponsibilityFileCount },
        { key: "cycles", label: "依赖循环", value: snapshot.summary.dependencyCycleCount },
      ],
    }),
    ...(totalRow ? [responsibilityCompositionSection(totalRow)] : []),
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
        badges: [{ key: "line-unit", label: "单位：万行", tone: "muted" }],
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
