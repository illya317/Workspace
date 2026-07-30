import {
  type SelectorSurfaceStructuredTreeItemSpec,
  type VisualizationNetworkSpec,
  type VisualizationTone,
} from "@workspace/core/ui";
import type {
  DatabaseRelationCatalogItem,
  DatabaseSchemaCatalog,
  DatabaseSchemaModule,
  DatabaseTableCatalogItem,
} from "../../../database-schema-contract";

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
  settings: "slate",
  capitalSecurities: "blue",
  unassigned: "slate",
};

export const DELETE_ACTION_LABEL = {
  cascade: "级联删除",
  restrict: "限制删除",
  "set-null": "置空",
  "set-default": "设默认值",
  "no-action": "无动作",
} as const;

export function totalRelations(table: DatabaseTableCatalogItem) {
  return table.inboundRelationCount + table.outboundRelationCount;
}

function columnDisplayName(catalog: DatabaseSchemaCatalog, tableName: string, columnName: string) {
  return catalog.tables
    .find((table) => table.name === tableName)
    ?.columns.find((column) => column.name === columnName)
    ?.label ?? columnName;
}

export function relationColumnNames(
  catalog: DatabaseSchemaCatalog,
  tableName: string,
  columnNames: readonly string[],
) {
  return columnNames.map((columnName) => columnDisplayName(catalog, tableName, columnName));
}

export function visibleTableNames(
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

export function graphForCatalog(
  catalog: DatabaseSchemaCatalog,
  visibleNames: ReadonlySet<string>,
  selectedTable: DatabaseTableCatalogItem | null,
  onNodeSelect: (nodeKey: string) => void,
  onNavigateBack?: () => void,
): VisualizationNetworkSpec {
  const tables = catalog.tables.filter((table) => visibleNames.has(table.name));
  const relations = catalog.relations.filter((relation) => (
    visibleNames.has(relation.sourceTable) && visibleNames.has(relation.targetTable)
  ));
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
    backNavigation: onNavigateBack ? { label: "返回全库", onActivate: onNavigateBack } : undefined,
    edgeDirectionLegend: {
      outgoingLabel: "引用其他表",
      incomingLabel: "被其他表引用",
      selfReferenceLabel: "自引用",
    },
    height: 680,
    emptyText: "当前范围暂无数据表",
  };
}

export function columnReferenceLabel(
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

export function databaseModuleTreeItems(
  modules: readonly DatabaseSchemaModule[],
  level = 1,
): SelectorSurfaceStructuredTreeItemSpec<DatabaseSchemaModule>[] {
  return modules.map((moduleItem) => ({
    key: moduleItem.key,
    value: moduleItem,
    card: {
      title: moduleItem.label,
      subtitle: moduleItem.directTableCount > 0
        ? `${moduleItem.directTableCount} 张直属表`
        : `${moduleItem.totalTableCount} 张下级表`,
      level,
    },
    children: moduleItem.children.length > 0
      ? databaseModuleTreeItems(moduleItem.children, level + 1)
      : undefined,
  }));
}

export function firstDirectModule(modules: readonly DatabaseSchemaModule[]): DatabaseSchemaModule | null {
  for (const moduleItem of modules) {
    if (moduleItem.directTableCount > 0) return moduleItem;
    const child = firstDirectModule(moduleItem.children);
    if (child) return child;
  }
  return null;
}
