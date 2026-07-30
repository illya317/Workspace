"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  createVisualizationSection,
  type BodySurfaceProps,
  type DataSurfaceColumnSpec,
  type SurfaceToolbarItem,
  type VisualizationNetworkSpec,
  type VisualizationTone,
} from "@workspace/core/ui";
import { useEffect, useMemo, useState } from "react";

import type {
  DatabaseColumnCatalogItem,
  DatabaseRelationCatalogItem,
  DatabaseSchemaCatalog,
  DatabaseTableCatalogItem,
} from "../../../database-schema-contract";

interface UseDatabaseRelationsTabInput {
  enabled: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
}

interface RelationTableRow extends DatabaseRelationCatalogItem {
  direction: "inbound" | "outbound";
  relatedTable: string;
  localColumns: string[];
  relatedColumns: string[];
}

const GROUP_TONES: Record<string, VisualizationTone> = {
  finance: "blue",
  work: "emerald",
  hr: "amber",
  administration: "rose",
  inventory: "emerald",
  production: "amber",
  external: "rose",
  capital: "blue",
  library: "emerald",
  docs: "amber",
  workflow: "rose",
  agent: "blue",
  platform: "slate",
};

const DELETE_ACTION_LABEL = {
  cascade: "级联删除",
  restrict: "限制删除",
  "set-null": "置空",
  "set-default": "设默认值",
  "no-action": "无动作",
} as const;

function totalRelations(table: DatabaseTableCatalogItem) {
  return table.inboundRelationCount + table.outboundRelationCount;
}

function columnDisplayName(
  catalog: DatabaseSchemaCatalog,
  tableName: string,
  columnName: string,
) {
  return catalog.tables
    .find((table) => table.name === tableName)
    ?.columns.find((column) => column.name === columnName)
    ?.label ?? columnName;
}

function relationColumnNames(
  catalog: DatabaseSchemaCatalog,
  tableName: string,
  columnNames: readonly string[],
) {
  return columnNames.map((columnName) => columnDisplayName(catalog, tableName, columnName));
}

function visibleTableNames(
  catalog: DatabaseSchemaCatalog,
  selectedKey: string,
  relationDepth: number,
) {
  if (selectedKey.startsWith("group:")) {
    const groupKey = selectedKey.slice("group:".length);
    return new Set(catalog.tables.filter((table) => table.groupKey === groupKey).map((table) => table.name));
  }
  if (!selectedKey.startsWith("table:")) return new Set(catalog.tables.map((table) => table.name));

  const selectedTable = selectedKey.slice("table:".length);
  const visible = new Set([selectedTable]);
  let frontier = new Set([selectedTable]);
  for (let level = 0; level < relationDepth; level += 1) {
    const next = new Set<string>();
    for (const relation of catalog.relations) {
      if (frontier.has(relation.sourceTable)) next.add(relation.targetTable);
      if (frontier.has(relation.targetTable)) next.add(relation.sourceTable);
    }
    for (const tableName of next) visible.add(tableName);
    frontier = new Set([...next].filter((tableName) => !frontier.has(tableName)));
  }
  return visible;
}

function graphForCatalog(
  catalog: DatabaseSchemaCatalog,
  visibleNames: ReadonlySet<string>,
  selectedTable: DatabaseTableCatalogItem | null,
  onNodeSelect: (nodeKey: string) => void,
  onNavigateBack?: () => void,
): VisualizationNetworkSpec {
  const tables = catalog.tables.filter((table) => visibleNames.has(table.name));
  const relations = catalog.relations.filter((relation) =>
    visibleNames.has(relation.sourceTable) && visibleNames.has(relation.targetTable));
  const focused = Boolean(selectedTable);
  const visibleGroupKeys = new Set(tables.map((table) => table.groupKey));

  return {
    kind: "network",
    presentation: "map",
    groups: catalog.groups
      .filter((group) => visibleGroupKeys.has(group.key))
      .map((group, index) => ({
        key: `group:${group.key}`,
        label: group.label,
        subtitle: `${tables.filter((table) => table.groupKey === group.key).length} 张表`,
        tone: GROUP_TONES[group.key] ?? "slate",
        outlined: true,
        layoutOrder: index,
      })),
    nodes: tables.map((table, index) => ({
      key: `table:${table.name}`,
      label: table.name,
      subtitle: focused ? `${table.columnCount} 字段 · ${totalRelations(table)} 关系` : undefined,
      groupKey: `group:${table.groupKey}`,
      tone: GROUP_TONES[table.groupKey] ?? "slate",
      emphasis: selectedTable?.name === table.name ? "focus" : focused ? "primary" : "context",
      size: selectedTable?.name === table.name ? "wide" : focused ? "default" : "compact",
      layoutOrder: index,
    })),
    edges: relations.map((relation) => ({
      key: relation.key,
      source: `table:${relation.sourceTable}`,
      target: `table:${relation.targetTable}`,
      label: focused
        ? `${relationColumnNames(catalog, relation.sourceTable, relation.sourceColumns).join(", ")} → ${relationColumnNames(catalog, relation.targetTable, relation.targetColumns).join(", ")}`
        : undefined,
    })),
    focusNodeKey: selectedTable ? `table:${selectedTable.name}` : undefined,
    onNodeSelect,
    backNavigation: onNavigateBack ? {
      label: "返回全库",
      onActivate: onNavigateBack,
    } : undefined,
    edgeDirectionLegend: {
      outgoingLabel: "引用其他表",
      incomingLabel: "被其他表引用",
      selfReferenceLabel: "自引用",
    },
    height: 680,
    emptyText: "当前范围暂无数据表",
  };
}

function columnReferenceLabel(
  catalog: DatabaseSchemaCatalog,
  tableName: string,
  columnName: string,
  relations: readonly DatabaseRelationCatalogItem[],
) {
  const references = relations.flatMap((relation) => relation.sourceTable === tableName
    ? relation.sourceColumns.flatMap((sourceColumn, index) => sourceColumn === columnName
      ? [`${relation.targetTable}.${columnDisplayName(catalog, relation.targetTable, relation.targetColumns[index] ?? "")}`]
      : [])
    : []);
  return references.join("、");
}

export function useDatabaseRelationsTab({ enabled, showToast }: UseDatabaseRelationsTabInput) {
  const [catalog, setCatalog] = useState<DatabaseSchemaCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState("overview");
  const [relationDepth, setRelationDepth] = useState("1");

  useEffect(() => {
    if (!enabled || catalog) return undefined;
    const controller = new AbortController();
    setLoading(true);
    void fetch(workspacePath("/api/settings/admin/database-schema"), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        setCatalog(await response.json() as DatabaseSchemaCatalog);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showToast(`加载数据关系失败${error instanceof Error ? `: ${error.message}` : ""}`, "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [catalog, enabled, showToast]);

  const selectedTable = useMemo(() => {
    if (!catalog || !selectedKey.startsWith("table:")) return null;
    return catalog.tables.find((table) => table.name === selectedKey.slice("table:".length)) ?? null;
  }, [catalog, selectedKey]);
  const visibleNames = useMemo(() => catalog
    ? visibleTableNames(catalog, selectedKey, Number(relationDepth))
    : new Set<string>(), [catalog, relationDepth, selectedKey]);
  const visibleTables = useMemo(() => catalog?.tables.filter((table) => visibleNames.has(table.name)) ?? [], [catalog, visibleNames]);
  const visibleRelations = useMemo(() => catalog?.relations.filter((relation) =>
    visibleNames.has(relation.sourceTable) && visibleNames.has(relation.targetTable)) ?? [], [catalog, visibleNames]);
  const graph = useMemo(() => catalog
    ? graphForCatalog(
        catalog,
        visibleNames,
        selectedTable,
        setSelectedKey,
        selectedKey !== "overview" ? () => setSelectedKey("overview") : undefined,
      )
    : null, [catalog, selectedKey, selectedTable, visibleNames]);

  const fieldColumns = useMemo<DataSurfaceColumnSpec<DatabaseColumnCatalogItem>[]>(() => [
    { key: "name", label: "字段", width: "lg", cell: (row) => ({ kind: "text", value: row.label ?? row.name, font: row.label ? "default" : "mono", emphasis: "medium" }) },
    { key: "type", label: "类型", width: "lg", cell: (row) => ({ kind: "text", value: row.type, font: "mono", tone: "muted" }) },
    {
      key: "constraints",
      label: "约束",
      width: "md",
      cell: (row) => ({
        kind: "group",
        items: [
          ...(row.primaryKey ? [{ kind: "badge" as const, label: "PK", tone: "blue" as const }] : []),
          ...(row.foreignKey ? [{ kind: "badge" as const, label: "FK", tone: "emerald" as const }] : []),
          ...(!row.required ? [{ kind: "badge" as const, label: "可空", tone: "slate" as const }] : []),
        ],
      }),
    },
    {
      key: "reference",
      label: "引用目标",
      width: "wide",
      cell: (row) => {
        const reference = selectedTable && catalog
          ? columnReferenceLabel(catalog, selectedTable.name, row.name, catalog.relations)
          : "";
        return reference
          ? { kind: "text", value: reference, font: "mono", tone: "muted" }
          : { kind: "empty", content: "—" };
      },
    },
  ], [catalog, selectedTable]);

  const relationRows = useMemo<RelationTableRow[]>(() => {
    if (!catalog || !selectedTable) return [];
    return catalog.relations.flatMap((relation) => {
      const rows: RelationTableRow[] = [];
      if (relation.sourceTable === selectedTable.name) rows.push({
        ...relation,
        direction: "outbound",
        relatedTable: relation.targetTable,
        localColumns: relation.sourceColumns,
        relatedColumns: relation.targetColumns,
      });
      if (relation.targetTable === selectedTable.name) rows.push({
        ...relation,
        direction: "inbound",
        relatedTable: relation.sourceTable,
        localColumns: relation.targetColumns,
        relatedColumns: relation.sourceColumns,
      });
      return rows;
    });
  }, [catalog, selectedTable]);
  const relationColumns = useMemo<DataSurfaceColumnSpec<RelationTableRow>[]>(() => [
    {
      key: "direction",
      label: "方向",
      width: "sm",
      cell: (row) => ({
        kind: "badge",
        label: row.direction === "outbound" ? "引用" : "被引用",
        tone: row.direction === "outbound" ? "blue" : "emerald",
      }),
    },
    { key: "table", label: "关联表", width: "xl", cell: (row) => ({ kind: "text", value: row.relatedTable, font: "mono", emphasis: "medium" }) },
    { key: "local", label: "本表字段", width: "lg", cell: (row) => ({ kind: "text", value: catalog ? relationColumnNames(catalog, selectedTable?.name ?? "", row.localColumns).join(", ") : row.localColumns.join(", ") }) },
    { key: "related", label: "目标字段", width: "lg", cell: (row) => ({ kind: "text", value: catalog ? relationColumnNames(catalog, row.relatedTable, row.relatedColumns).join(", ") : row.relatedColumns.join(", "), tone: "muted" }) },
    { key: "onDelete", label: "删除策略", width: "md", cell: (row) => DELETE_ACTION_LABEL[row.onDelete] },
    { key: "constraint", label: "数据库约束", width: "wide", cell: (row) => ({ kind: "text", value: row.constraintName, font: "mono", tone: "muted" }) },
  ], [catalog, selectedTable]);

  const toolbarItems: SurfaceToolbarItem[] = [
    {
      kind: "autocomplete",
      key: "database-schema-search",
      value: selectedTable?.name ?? "",
      options: catalog?.tables.map((table) => ({
        value: table.name,
        name: table.name,
        details: `${catalog.groups.find((group) => group.key === table.groupKey)?.label ?? table.groupKey} · ${table.columnCount} 字段 · ${totalRelations(table)} 关系`,
        searchText: table.columns.flatMap((column) => [column.label, column.name]).filter(Boolean).join(" "),
      })) ?? [],
      onChange: (tableName) => setSelectedKey(tableName ? `table:${tableName}` : "overview"),
      placeholder: "定位数据表或字段",
      ariaLabel: "搜索数据库表或字段",
      visibleCount: 8,
    },
    {
      kind: "select",
      key: "database-schema-group",
      label: "业务域",
      value: selectedKey.startsWith("group:") ? selectedKey : "overview",
      options: [
        { value: "overview", label: "全部业务域" },
        ...(catalog?.groups.map((group) => ({ value: `group:${group.key}`, label: group.label })) ?? []),
      ],
      onChange: setSelectedKey,
      visibleCount: 14,
    },
    ...(selectedTable ? [{
      kind: "option-group" as const,
      key: "database-relation-depth",
      label: "关系范围",
      value: relationDepth,
      options: [
        { value: "1", label: "一跳" },
        { value: "2", label: "两跳" },
      ],
      presentation: "segmented" as const,
      onChange: setRelationDepth,
      ariaLabel: "关系图层级",
    }] : []),
  ];

  const body: BodySurfaceProps = !catalog
    ? createPageBody([createStatusSection("database-schema-status", {
      kind: loading ? "loading" : "empty",
      content: loading ? "正在读取数据库结构" : "暂无数据关系",
    })])
    : createPageBody([
        createMetricsSection("database-schema-metrics", {
          metrics: [
            { key: "tables", label: "当前数据表", value: visibleTables.length },
            { key: "columns", label: "当前字段", value: visibleTables.reduce((sum, table) => sum + table.columnCount, 0) },
            { key: "relations", label: "当前外键", value: visibleRelations.length },
            { key: "schema", label: "数据库 Schema", value: `${catalog.databaseName} / ${catalog.schemaName}` },
          ],
        }),
        ...(graph ? [createVisualizationSection("database-schema-graph", {
          kind: "chart",
          chart: {
            frame: {
              title: selectedTable ? `${selectedTable.name} 关系网` : selectedKey.startsWith("group:")
                ? `${catalog.groups.find((group) => `group:${group.key}` === selectedKey)?.label ?? "模块"}数据关系`
                : "全库关系图",
              subtitle: selectedTable
                ? `以当前表为中心展示 ${relationDepth === "1" ? "一跳" : "两跳"} FK；悬停后仅显示当前表及其引用目标，橙线表示向外引用，蓝线表示被引用，橙色描边表示自引用。`
                : "圆点是数据表，大小反映 FK 连接数；悬停后仅显示当前表及其引用目标，橙线表示向外引用，蓝线表示被引用，橙色描边表示自引用。",
            },
            visual: graph,
          },
        })] : []),
        ...(selectedTable ? [{
          ...createPageTableSection("database-table-fields", {
            rows: selectedTable.columns,
            columns: fieldColumns,
            visibleColumns: fieldColumns.map((column) => column.key),
            rowKey: (row) => row.name,
            presentation: { density: "compact", cellWrap: "nowrap" },
            emptyText: "该表暂无字段",
          }),
          header: { title: "字段" },
        }, {
          ...createPageTableSection("database-table-relations", {
            rows: relationRows,
            columns: relationColumns,
            visibleColumns: relationColumns.map((column) => column.key),
            rowKey: (row) => `${row.direction}:${row.key}`,
            presentation: { density: "compact", cellWrap: "nowrap" },
            scroll: { x: true },
            emptyText: "该表没有数据库外键",
          }),
          header: { title: "外键关系" },
        }] : []),
      ]);

  return { body, toolbarItems };
}
