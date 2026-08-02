import {
  createFieldsSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceCellSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import type {
  SourceCodeAnalysisModuleHealthWarning,
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
  capabilityAnalysisTableRows,
  createCapabilityAnalysisColumns,
  sourceCodeAnalysisCapabilityRowsForParent,
  sourceCodeAnalysisCategoryLabel,
  sourceCodeAnalysisL1NavigationKey,
  sourceCodeAnalysisModuleKindLabel,
  sourceCodeAnalysisModuleNavigationKey,
  sourceCodeAnalysisViewKind,
  type CapabilityAnalysisTableRow,
  type SourceCodeAnalysisColumnDisclosure,
  type SourceCodeAnalysisNavigationSelection,
} from "./source-code-analysis-capabilities";
import { SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS } from "./source-code-analysis-display";
import { formatCodeVolumeInTenThousands } from "./source-code-analysis-format";
import { SOURCE_CODE_ANALYSIS_ROW_GROUPS } from "./source-code-analysis-l1";
import type { SourceCodeAnalysisRelationSelection } from "./source-code-analysis-relations";

export interface SourceCodeAnalysisSectionOptions {
  disclosure?: SourceCodeAnalysisColumnDisclosure;
  relationSelection?: SourceCodeAnalysisRelationSelection;
  selectedNavigationKey?: string;
  onNavigate?: (key: string) => void;
}

interface L1ExplorerRow extends SourceCodeAnalysisModuleRow {
  childModuleCount: number;
  requiredWarningCount: number;
  acceptedWarningCount: number;
}

interface DependencySummaryRow {
  key: string;
  target: string;
  runtimeCount: number;
  typeOnlyCount: number;
  importCount: number;
}

interface RoleSummaryRow {
  role: SourceCodeAnalysisRole;
  label: string;
  groupLabel: string;
  lines: number;
  percent: number;
}

const WARNING_LABELS: Record<SourceCodeAnalysisModuleHealthWarning["code"], string> = {
  "high-leaf-fan-out": "外部依赖过多",
  "legacy-implementation-bypass": "历史 Implementation 绕行",
  "oversized-leaf-files": "实现文件过多",
  "oversized-leaf-lines": "实现代码过大",
  "oversized-orchestration": "编排层过厚",
  "retired-module-referenced": "退役 Module 仍被引用",
};

function exactCodeVolume(lines: number) {
  return `${lines.toLocaleString("zh-CN")} 行（${formatCodeVolumeInTenThousands(lines)} 万）`;
}

function healthCell(required: number, accepted: number): DataSurfaceCellSpec {
  if (required > 0) return { kind: "badge", label: `需复核 ${required}`, tone: "amber" };
  if (accepted > 0) return { kind: "badge", label: `已接受 ${accepted}`, tone: "blue" };
  return { kind: "badge", label: "通过", tone: "green" };
}

function l1Rows(snapshot: SourceCodeAnalysisSnapshot, moduleKeys: ReadonlySet<string>): L1ExplorerRow[] {
  return snapshot.modules.filter((sourceModule) => moduleKeys.has(sourceModule.key)).map((sourceModule) => {
    const warnings = snapshot.moduleHealthWarnings.filter((warning) => warning.moduleId.startsWith(`${sourceModule.key}/`));
    return {
      ...sourceModule,
      childModuleCount: snapshot.capabilities.filter((row) =>
        row.moduleKey === sourceModule.key && row.parentKey === null).length,
      requiredWarningCount: warnings.filter((warning) => warning.reviewStatus === "required").length,
      acceptedWarningCount: warnings.filter((warning) => warning.reviewStatus === "accepted").length,
    };
  });
}

function l1Columns(): DataSurfaceColumnSpec<L1ExplorerRow>[] {
  return [
    { key: "module", label: "L1 Module", required: true, cell: (row) => ({ kind: "text", value: row.label, emphasis: "strong" }) },
    { key: "category", label: "源码类型", cell: (row) => sourceCodeAnalysisCategoryLabel(row.category) },
    { key: "files", label: "文件", align: "right", numeric: true, cell: (row) => row.fileCount },
    { key: "lines", label: "代码", align: "right", numeric: true, cell: (row) => formatCodeVolumeInTenThousands(row.lines) },
    { key: "children", label: "直属 Module", align: "right", numeric: true, cell: (row) => row.childModuleCount },
    { key: "dependencies", label: "L1 依赖", align: "right", numeric: true, cell: (row) => row.dependencyCount },
    { key: "imports", label: "跨 L1 引用", align: "right", numeric: true, cell: (row) => row.crossModuleImportCount },
    { key: "health", label: "健康", cell: (row) => healthCell(row.requiredWarningCount, row.acceptedWarningCount) },
  ];
}

function l1Section(
  snapshot: SourceCodeAnalysisSnapshot,
  moduleKeys: ReadonlySet<string>,
  title: string,
  onNavigate?: (key: string) => void,
): BodySurfaceSectionSpec {
  const rows = l1Rows(snapshot, moduleKeys);
  const columns = l1Columns();
  return {
    ...createPageTableSection("source-code-analysis-l1-explorer", {
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => row.key,
      rowState: (row) => row.requiredWarningCount > 0 ? "warning" : "normal",
      onRowClick: onNavigate ? (row) => onNavigate(sourceCodeAnalysisL1NavigationKey(row.key)) : undefined,
      presentation: { density: "compact", cellWrap: "nowrap", rowHover: "interactive" },
      emptyText: "暂无 L1 Module",
    }),
    header: { title, badges: [{ key: "line-unit", label: "代码单位：万行", tone: "muted" }] },
  };
}

function childSection(
  rows: CapabilityAnalysisTableRow[],
  sourceModule: SourceCodeAnalysisModuleRow,
  options: SourceCodeAnalysisSectionOptions,
  title: string,
): BodySurfaceSectionSpec {
  const viewKind = sourceCodeAnalysisViewKind(sourceModule);
  const columns = createCapabilityAnalysisColumns(viewKind, options.disclosure);
  return {
    ...createPageTableSection("source-code-analysis-module-children", {
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => `${row.moduleKey}:${row.key}`,
      rowState: (row) => row.ownership === "unassigned" || row.requiredWarningCount > 0 ? "warning" : "normal",
      onRowClick: options.onNavigate
        ? (row) => options.onNavigate?.(sourceCodeAnalysisModuleNavigationKey(row.moduleKey, row.key))
        : undefined,
      presentation: { density: "compact", cellWrap: "nowrap", rowHover: "interactive" },
      ...(viewKind === "product" ? {
        format: { kind: "matrix" as const, rowHeaderWidth: 154 },
        scroll: { x: true },
      } : {}),
      emptyText: "当前层没有直属 Module",
    }),
    header: {
      title,
      badges: [
        { key: "children", label: `${rows.length} 个直属`, tone: "muted" },
        { key: "line-unit", label: "代码单位：万行", tone: "muted" },
      ],
    },
  };
}

function roleSection(roles: SourceCodeAnalysisRoleCounts, title: string): BodySurfaceSectionSpec | null {
  const total = SOURCE_CODE_ANALYSIS_ROLES.reduce((sum, role) => sum + roles[role], 0);
  const rows = SOURCE_CODE_ANALYSIS_ROLES.flatMap((role): RoleSummaryRow[] => {
    if (roles[role] === 0) return [];
    const group = SOURCE_CODE_ANALYSIS_DISPLAY_GROUPS.find((candidate) => candidate.roles.includes(role));
    return [{
      role,
      label: SOURCE_CODE_ANALYSIS_ROLE_LABELS[role],
      groupLabel: group?.label ?? "其他",
      lines: roles[role],
      percent: total === 0 ? 0 : Number(((roles[role] / total) * 100).toFixed(1)),
    }];
  });
  if (rows.length === 0) return null;
  const columns: DataSurfaceColumnSpec<RoleSummaryRow>[] = [
    { key: "group", label: "责任域", cell: (row) => row.groupLabel },
    { key: "role", label: "最细职责", required: true, cell: (row) => row.label },
    { key: "lines", label: "代码", align: "right", numeric: true, cell: (row) => row.lines.toLocaleString("zh-CN") },
    { key: "percent", label: "占比", align: "right", numeric: true, cell: (row) => `${row.percent}%` },
  ];
  return {
    ...createPageTableSection("source-code-analysis-role-summary", {
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => row.role,
      presentation: { density: "compact", cellWrap: "nowrap" },
      emptyText: "无直接实现职责",
    }),
    header: { title },
  };
}

function dependencyRows(
  snapshot: SourceCodeAnalysisSnapshot,
  moduleKey: string,
  capabilityKey?: string,
): DependencySummaryRow[] {
  const moduleLabels = new Map(snapshot.modules.map((sourceModule) => [sourceModule.key, sourceModule.label]));
  const capabilityLabels = new Map(snapshot.capabilities.map((row) => [`${row.moduleKey}/${row.key}`, row.label]));
  const grouped = new Map<string, DependencySummaryRow>();
  for (const edge of snapshot.capabilityDependencyEdges) {
    if (edge.sourceModuleKey !== moduleKey || (capabilityKey !== undefined && edge.sourceCapabilityKey !== capabilityKey)) continue;
    const targetKey = `${edge.targetModuleKey}/${edge.targetCapabilityKey ?? "L1"}`;
    const targetModule = moduleLabels.get(edge.targetModuleKey) ?? edge.targetModuleKey;
    const targetCapability = edge.targetCapabilityKey
      ? capabilityLabels.get(`${edge.targetModuleKey}/${edge.targetCapabilityKey}`) ?? edge.targetCapabilityKey
      : "L1";
    const current = grouped.get(targetKey) ?? {
      key: targetKey,
      target: `${targetModule} / ${targetCapability}`,
      runtimeCount: 0,
      typeOnlyCount: 0,
      importCount: 0,
    };
    current.runtimeCount += edge.valueImportCount + edge.dynamicImportCount + edge.reExportCount;
    current.typeOnlyCount += edge.typeOnlyImportCount + edge.typeOnlyReExportCount;
    current.importCount += edge.importCount;
    grouped.set(targetKey, current);
  }
  return [...grouped.values()].sort((left, right) =>
    right.importCount - left.importCount || left.target.localeCompare(right.target, "zh-CN"));
}

function dependencySection(
  snapshot: SourceCodeAnalysisSnapshot,
  moduleKey: string,
  capabilityKey?: string,
): BodySurfaceSectionSpec | null {
  const rows = dependencyRows(snapshot, moduleKey, capabilityKey);
  if (rows.length === 0) return null;
  const columns: DataSurfaceColumnSpec<DependencySummaryRow>[] = [
    { key: "target", label: "目标 Module", required: true, cell: (row) => row.target },
    { key: "runtime", label: "运行时引用", align: "right", numeric: true, cell: (row) => row.runtimeCount },
    { key: "type", label: "类型引用", align: "right", numeric: true, cell: (row) => row.typeOnlyCount },
    { key: "total", label: "合计", align: "right", numeric: true, cell: (row) => row.importCount },
  ];
  return {
    ...createPageTableSection("source-code-analysis-dependencies", {
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => row.key,
      presentation: { density: "compact", cellWrap: "nowrap" },
      emptyText: "没有跨 Module 依赖",
    }),
    header: { title: "依赖目标" },
  };
}

function descendantIds(snapshot: SourceCodeAnalysisSnapshot, moduleKey: string, capabilityKey: string) {
  const ids = new Set<string>();
  function visit(key: string) {
    ids.add(`${moduleKey}/${key}`);
    snapshot.capabilities
      .filter((row) => row.moduleKey === moduleKey && row.parentKey === key)
      .forEach((child) => visit(child.key));
  }
  visit(capabilityKey);
  return ids;
}

function warningSection(snapshot: SourceCodeAnalysisSnapshot, moduleIds: ReadonlySet<string>) {
  const rows = snapshot.moduleHealthWarnings.filter((warning) => moduleIds.has(warning.moduleId));
  if (rows.length === 0) return null;
  const columns: DataSurfaceColumnSpec<SourceCodeAnalysisModuleHealthWarning>[] = [
    { key: "module", label: "最小 Module", required: true, cell: (row) => row.moduleId },
    { key: "warning", label: "复核原因", cell: (row) => WARNING_LABELS[row.code] },
    { key: "actual", label: "当前", align: "right", numeric: true, cell: (row) => row.actual.toLocaleString("zh-CN") },
    { key: "threshold", label: "阈值", align: "right", numeric: true, cell: (row) => row.threshold === 0 ? "禁止出现" : row.threshold.toLocaleString("zh-CN") },
    { key: "status", label: "Hygiene", cell: (row) => row.reviewStatus === "accepted"
      ? { kind: "badge", label: "已接受", tone: "blue" }
      : { kind: "badge", label: "待复核", tone: "amber" } },
  ];
  return {
    ...createPageTableSection("source-code-analysis-health-warnings", {
      rows,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => `${row.moduleId}:${row.code}`,
      rowState: (row) => row.reviewStatus === "required" ? "warning" : "info",
      presentation: { density: "compact", cellWrap: "nowrap" },
      emptyText: "当前子树没有 Hygiene 提醒",
    }),
    header: { title: "Hygiene 复核" },
  } satisfies BodySurfaceSectionSpec;
}

function groupSections(snapshot: SourceCodeAnalysisSnapshot, groupKey: string, options: SourceCodeAnalysisSectionOptions) {
  const group = SOURCE_CODE_ANALYSIS_ROW_GROUPS.find((candidate) => candidate.key === groupKey);
  if (!group) return [];
  const modules = snapshot.modules.filter((sourceModule) => group.categories.includes(sourceModule.category));
  const moduleKeys = new Set(modules.map((sourceModule) => sourceModule.key));
  const warningCount = snapshot.moduleHealthWarnings.filter((warning) =>
    modules.some((sourceModule) => warning.moduleId.startsWith(`${sourceModule.key}/`))
    && warning.reviewStatus === "required").length;
  return [
    createMetricsSection(`source-code-analysis-${group.key}-summary`, {
      metrics: [
        { key: "l1", label: "L1 Module", value: modules.length },
        { key: "files", label: "文件", value: modules.reduce((sum, sourceModule) => sum + sourceModule.fileCount, 0).toLocaleString("zh-CN") },
        { key: "lines", label: "代码", value: `${formatCodeVolumeInTenThousands(modules.reduce((sum, sourceModule) => sum + sourceModule.lines, 0))} 万行` },
        { key: "warnings", label: "Hygiene 复核", value: warningCount },
      ],
    }),
    l1Section(snapshot, moduleKeys, group.label, options.onNavigate),
  ];
}

function l1Sections(
  snapshot: SourceCodeAnalysisSnapshot,
  moduleKey: string,
  rows: CapabilityAnalysisTableRow[],
  options: SourceCodeAnalysisSectionOptions,
) {
  const sourceModule = snapshot.modules.find((candidate) => candidate.key === moduleKey);
  if (!sourceModule) return [];
  const children = sourceCodeAnalysisCapabilityRowsForParent(rows, sourceModule.key, null);
  const warnings = snapshot.moduleHealthWarnings.filter((warning) => warning.moduleId.startsWith(`${sourceModule.key}/`));
  const sections: BodySurfaceSectionSpec[] = [{
    ...createFieldsSection("source-code-analysis-l1-detail", [
      { kind: "readonly", key: "level", label: "层级", value: "L1" },
      { kind: "readonly", key: "category", label: "源码类型", value: sourceCodeAnalysisCategoryLabel(sourceModule.category) },
      { kind: "readonly", key: "files", label: "文件", value: sourceModule.fileCount.toLocaleString("zh-CN") },
      { kind: "readonly", key: "lines", label: "代码", value: exactCodeVolume(sourceModule.lines) },
      { kind: "readonly", key: "children", label: "直属 Module", value: children.length.toLocaleString("zh-CN") },
      { kind: "readonly", key: "dependencies", label: "L1 依赖", value: sourceModule.dependencyCount.toLocaleString("zh-CN") },
      { kind: "readonly", key: "imports", label: "跨 L1 引用", value: sourceModule.crossModuleImportCount.toLocaleString("zh-CN") },
      { kind: "readonly", key: "health", label: "Hygiene", value: warnings.some((warning) => warning.reviewStatus === "required") ? `${warnings.filter((warning) => warning.reviewStatus === "required").length} 项待复核` : "通过" },
    ], { kind: "detail", layout: { columns: 2, density: "compact" } }),
    header: { title: sourceModule.label },
  }];
  if (children.length > 0) sections.push(childSection(children, sourceModule, options, `${sourceModule.label} · 直属 Module`));
  else {
    const roles = roleSection(sourceModule.roles, "责任构成");
    const dependencies = dependencySection(snapshot, sourceModule.key);
    if (roles) sections.push(roles);
    if (dependencies) sections.push(dependencies);
  }
  const health = warningSection(snapshot, new Set(warnings.map((warning) => warning.moduleId)));
  if (health) sections.push(health);
  return sections;
}

function moduleSections(
  snapshot: SourceCodeAnalysisSnapshot,
  moduleKey: string,
  capabilityKey: string,
  rows: CapabilityAnalysisTableRow[],
  options: SourceCodeAnalysisSectionOptions,
) {
  const sourceModule = snapshot.modules.find((candidate) => candidate.key === moduleKey);
  const row = rows.find((candidate) => candidate.moduleKey === moduleKey && candidate.key === capabilityKey);
  if (!sourceModule || !row) return [];
  const children = sourceCodeAnalysisCapabilityRowsForParent(rows, moduleKey, capabilityKey);
  const sections: BodySurfaceSectionSpec[] = [{
    ...createFieldsSection("source-code-analysis-module-detail", [
      { kind: "readonly", key: "level", label: "Contract 层级", value: `L${row.depth}` },
      { kind: "readonly", key: "kind", label: "Module 形态", value: sourceCodeAnalysisModuleKindLabel(row.kind) },
      { kind: "readonly", key: "direct-files", label: "直接文件", value: row.fileCount.toLocaleString("zh-CN") },
      { kind: "readonly", key: "subtree-files", label: "子树文件", value: row.subtreeFileCount.toLocaleString("zh-CN") },
      { kind: "readonly", key: "direct-lines", label: "直接代码", value: exactCodeVolume(row.lines) },
      { kind: "readonly", key: "subtree-lines", label: "子树代码", value: exactCodeVolume(row.subtreeLines) },
      { kind: "readonly", key: "children", label: "直属 Module", value: row.childCount.toLocaleString("zh-CN") },
      { kind: "readonly", key: "dependencies", label: "子树依赖", value: row.subtreeDependencyCount.toLocaleString("zh-CN") },
    ], { kind: "detail", layout: { columns: 2, density: "compact" } }),
    header: {
      title: [sourceModule.label, ...row.pathLabels].join(" / "),
      badges: [
        { key: "level", label: `L${row.depth}`, tone: "muted" },
        ...(row.requiredWarningCount > 0
          ? [{ key: "health", label: `${row.requiredWarningCount} 项待复核`, tone: "warning" as const }]
          : []),
      ],
    },
  }];
  if (children.length > 0) sections.push(childSection(children, sourceModule, options, `${row.label} · 直属 Module`));
  if (row.lines > 0 || children.length === 0) {
    const roles = roleSection(row.roles, children.length > 0 ? "直接职责" : "责任构成");
    if (roles) sections.push(roles);
  }
  if (children.length === 0) {
    const dependencies = dependencySection(snapshot, moduleKey, capabilityKey);
    if (dependencies) sections.push(dependencies);
  }
  const health = warningSection(snapshot, descendantIds(snapshot, moduleKey, capabilityKey));
  if (health) sections.push(health);
  return sections;
}

export function createSourceCodeAnalysisDrilldownSection(
  snapshot: SourceCodeAnalysisSnapshot,
  selection: Exclude<SourceCodeAnalysisNavigationSelection, { kind: "root" }>,
  options: SourceCodeAnalysisSectionOptions,
): BodySurfaceSectionSpec {
  const rows = capabilityAnalysisTableRows(snapshot);
  const sections = selection.kind === "group"
    ? groupSections(snapshot, selection.groupKey, options)
    : selection.kind === "l1"
      ? l1Sections(snapshot, selection.moduleKey, rows, options)
      : moduleSections(snapshot, selection.moduleKey, selection.capabilityKey, rows, options);
  return {
    key: "source-code-analysis",
    header: { title: "源码模块分析" },
    body: createPageBody(sections, { empty: { content: "当前源码 Module 不存在或已从 Contract 移除" } }),
  };
}
