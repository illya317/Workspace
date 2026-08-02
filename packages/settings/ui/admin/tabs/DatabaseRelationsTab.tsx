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
  type SelectorSurfaceProps,
  type SurfaceToolbarItem,
} from "@workspace/core/ui";
import { useEffect, useMemo, useState } from "react";
import { createCategoryItemDetailBody } from "@workspace/platform/ui";

import type {
  DatabaseColumnCatalogItem,
  DatabaseRelationCatalogItem,
  DatabaseSchemaCatalog,
  DatabaseSchemaModule,
} from "../../../database-schema-contract";
import type { RelationPolicyCatalog } from "../../../relation-policy-contract";
import {
  columnReferenceLabel,
  databaseModuleTreeItems,
  DELETE_ACTION_LABEL,
  firstDirectModule,
  graphForCatalog,
  relationColumnNames,
  visibleTableNames,
} from "./DatabaseRelationsTabModel";
import {
  editableRelationPolicySettings,
  relationPolicyDraftFromRelation,
  relationPolicyModulePath,
  type RelationPolicyDraft,
} from "./DatabaseRelationsTabPolicyModel";
import { createRelationPolicyBody } from "./DatabaseRelationsTabPolicySections";

type DatabaseRelationsView = "policies" | "tables" | "graph";

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

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({})) as { error?: unknown };
  return typeof payload.error === "string" ? payload.error : fallback;
}

function relationPolicyCatalogFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("关系策略响应格式无效");
  const candidate = "catalog" in payload ? payload.catalog : payload;
  if (
    !candidate
    || typeof candidate !== "object"
    || !("modules" in candidate)
    || !Array.isArray(candidate.modules)
    || !("relations" in candidate)
    || !Array.isArray(candidate.relations)
  ) {
    throw new Error("关系策略响应格式无效");
  }
  return candidate as RelationPolicyCatalog;
}

async function fetchRelationPolicyCatalog(signal?: AbortSignal) {
  const response = await fetch(workspacePath("/api/settings/governance/relation-policies"), { signal });
  if (!response.ok) throw new Error(await responseError(response, `加载关系策略失败 (${response.status})`));
  return relationPolicyCatalogFromPayload(await response.json());
}

export function useDatabaseRelationsTab({ enabled, showToast }: UseDatabaseRelationsTabInput) {
  const [catalog, setCatalog] = useState<DatabaseSchemaCatalog | null>(null);
  const [policyCatalog, setPolicyCatalog] = useState<RelationPolicyCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [view, setView] = useState<DatabaseRelationsView>("policies");
  const [selectedModuleKey, setSelectedModuleKey] = useState<string | null>(null);
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [selectedRelationKey, setSelectedRelationKey] = useState<string | null>(null);
  const [expandedPolicyModuleKeys, setExpandedPolicyModuleKeys] = useState<string[]>([]);
  const [mobilePolicyDetailActive, setMobilePolicyDetailActive] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<RelationPolicyDraft | null>(null);
  const [policyReason, setPolicyReason] = useState("");
  const [graphKey, setGraphKey] = useState("overview");

  useEffect(() => {
    if (!enabled || catalog) return undefined;
    const controller = new AbortController();
    setLoading(true);
    void fetch(workspacePath("/api/settings/governance/database-schema"), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const nextCatalog = await response.json() as DatabaseSchemaCatalog;
        const initialModule = firstDirectModule(nextCatalog.modules);
        const initialTable = initialModule
          ? nextCatalog.tables.find((table) => table.moduleKey === initialModule.key) ?? null
          : null;
        setCatalog(nextCatalog);
        setSelectedModuleKey((current) => current ?? initialModule?.key ?? null);
        setSelectedTableName((current) => current ?? initialTable?.name ?? null);
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

  useEffect(() => {
    if (!enabled || policyCatalog) return undefined;
    const controller = new AbortController();
    setPolicyLoading(true);
    void fetchRelationPolicyCatalog(controller.signal)
      .then(setPolicyCatalog)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showToast(error instanceof Error ? error.message : "加载关系策略失败", "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPolicyLoading(false);
      });
    return () => controller.abort();
  }, [enabled, policyCatalog, showToast]);

  useEffect(() => {
    if (!policyCatalog) return;
    const selected = policyCatalog.relations.find((relation) => (
      relation.relationKey === selectedRelationKey
    ));
    const next = selected
      ?? policyCatalog.relations[0]
      ?? null;
    if (next?.relationKey !== selectedRelationKey) {
      setSelectedRelationKey(next?.relationKey ?? null);
    }
  }, [policyCatalog, selectedRelationKey]);

  const selectedPolicyRelation = useMemo(() => (
    policyCatalog?.relations.find((relation) => relation.relationKey === selectedRelationKey) ?? null
  ), [policyCatalog, selectedRelationKey]);

  useEffect(() => {
    setPolicyDraft(selectedPolicyRelation
      ? relationPolicyDraftFromRelation(selectedPolicyRelation)
      : null);
    setPolicyReason("");
  }, [selectedPolicyRelation]);

  useEffect(() => {
    if (!selectedPolicyRelation) return;
    const path = catalog
      ? relationPolicyModulePath(catalog.modules, selectedPolicyRelation.moduleKey)
      : [];
    const moduleKeys = path.length > 0 ? path : [selectedPolicyRelation.moduleKey];
    setExpandedPolicyModuleKeys((current) => {
      const next = new Set(current);
      for (const moduleKey of moduleKeys) next.add(moduleKey);
      return next.size === current.length && current.every((key) => next.has(key))
        ? current
        : [...next];
    });
  }, [catalog, selectedPolicyRelation]);

  async function persistRelationPolicy(reset: boolean) {
    const group = selectedPolicyRelation?.policyGroup;
    if (!selectedPolicyRelation || !group || !policyDraft || !policyReason.trim()) return;
    setSavingPolicy(true);
    try {
      const response = await fetch(workspacePath("/api/settings/governance/relation-policies"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationKey: selectedPolicyRelation.relationKey,
          policyKey: group.policyKey,
          baselineHash: group.baselineHash,
          expectedVersion: group.version,
          reason: policyReason.trim(),
          ...(reset
            ? { reset: true }
            : { settings: editableRelationPolicySettings(selectedPolicyRelation, policyDraft) }),
        }),
      });
      if (response.status === 409) {
        setPolicyCatalog(await fetchRelationPolicyCatalog());
        showToast("关系规则已被其他人更新，已重新加载最新版本", "error");
        return;
      }
      if (!response.ok) throw new Error(await responseError(response, reset ? "恢复系统预设失败" : "保存关系规则失败"));
      setPolicyCatalog(relationPolicyCatalogFromPayload(await response.json()));
      showToast(reset ? "已恢复系统预设" : "关系规则已保存", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : reset ? "恢复系统预设失败" : "保存关系规则失败", "error");
    } finally {
      setSavingPolicy(false);
    }
  }

  const selectedTable = useMemo(() => catalog?.tables.find((table) => table.name === selectedTableName) ?? null, [catalog, selectedTableName]);
  const graphSelectedTable = useMemo(() => {
    if (!catalog || !graphKey.startsWith("table:")) return null;
    return catalog.tables.find((table) => table.name === graphKey.slice("table:".length)) ?? null;
  }, [catalog, graphKey]);
  const visibleNames = useMemo(() => catalog
    ? visibleTableNames(catalog, graphKey, 1)
    : new Set<string>(), [catalog, graphKey]);
  const visibleTables = useMemo(() => catalog?.tables.filter((table) => visibleNames.has(table.name)) ?? [], [catalog, visibleNames]);
  const visibleRelations = useMemo(() => catalog?.relations.filter((relation) =>
    visibleNames.has(relation.sourceTable) && visibleNames.has(relation.targetTable)) ?? [], [catalog, visibleNames]);
  const graph = useMemo(() => catalog
    ? graphForCatalog(
        catalog,
        visibleNames,
        graphSelectedTable,
        setGraphKey,
        graphKey !== "overview" ? () => setGraphKey("overview") : undefined,
      )
    : null, [catalog, graphKey, graphSelectedTable, visibleNames]);

  const fieldColumns = useMemo<DataSurfaceColumnSpec<DatabaseColumnCatalogItem>[]>(() => [
    { key: "name", label: "字段", width: "lg", cell: (row) => ({ kind: "text", value: row.label ?? row.name, font: row.label ? "default" : "mono", emphasis: "medium" }) },
    { key: "type", label: "类型", width: "lg", cell: (row) => ({ kind: "text", value: row.type, font: "mono", tone: "muted" }) },
    {
      key: "constraints",
      label: "数据库约束",
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

  const directTables = useMemo(() => catalog?.tables.filter((table) => (
    selectedModuleKey === "unassigned" ? !table.moduleKey : table.moduleKey === selectedModuleKey
  )) ?? [], [catalog, selectedModuleKey]);
  const moduleSelector = useMemo<SelectorSurfaceProps<DatabaseSchemaModule> | null>(() => catalog ? ({
    kind: "tree",
    defaultExpandedLevel: 1,
    items: databaseModuleTreeItems(catalog.modules),
    selectedId: selectedModuleKey,
    onSelect: (moduleItem: DatabaseSchemaModule) => {
      setSelectedModuleKey(moduleItem.key);
      const firstDirectTable = catalog.tables.find((table) => (
        moduleItem.key === "unassigned" ? !table.moduleKey : table.moduleKey === moduleItem.key
      )) ?? null;
      setSelectedTableName(firstDirectTable?.name ?? null);
    },
  }) : null, [catalog, selectedModuleKey]);

  const toolbarItems: SurfaceToolbarItem[] = [{
    kind: "option-group",
    key: "database-relations-view",
    value: view,
    options: [
      { value: "policies", label: "关系规则" },
      { value: "tables", label: "表结构" },
      { value: "graph", label: "关系图" },
    ],
    presentation: "segmented",
    onChange: (value) => setView(value === "graph" || value === "tables" ? value : "policies"),
    ariaLabel: "数据关系视图",
  }];

  const policyBody = createRelationPolicyBody({
    catalog: policyCatalog,
    schemaModules: catalog?.modules ?? [],
    loading: policyLoading,
    selectedRelation: selectedPolicyRelation,
    draft: policyDraft,
    reason: policyReason,
    saving: savingPolicy,
    expandedModuleKeys: expandedPolicyModuleKeys,
    mobileDetailActive: mobilePolicyDetailActive,
    onSelectRelation: (relationKey) => {
      setSelectedRelationKey(relationKey);
      setMobilePolicyDetailActive(true);
    },
    onOpenModule: (moduleKey) => {
      setExpandedPolicyModuleKeys((current) => (
        current.includes(moduleKey) ? current : [...current, moduleKey]
      ));
    },
    onToggleModule: (moduleKey, expanded) => {
      setExpandedPolicyModuleKeys((current) => expanded
        ? current.includes(moduleKey) ? current : [...current, moduleKey]
        : current.filter((key) => key !== moduleKey));
    },
    onDraftChange: (field, value) => {
      setPolicyDraft((current) => current ? { ...current, [field]: value } : current);
    },
    onReasonChange: setPolicyReason,
    onNavigateToList: () => setMobilePolicyDetailActive(false),
    onSave: () => void persistRelationPolicy(false),
    onReset: () => void persistRelationPolicy(true),
  });

  const body: BodySurfaceProps = view === "policies"
    ? policyBody
    : !catalog
    ? createPageBody([createStatusSection("database-schema-status", {
      kind: loading ? "loading" : "empty",
      content: loading ? "正在读取数据库结构" : "暂无数据关系",
    })])
    : view === "tables" && moduleSelector
      ? createCategoryItemDetailBody({
          category: {
            label: "模块",
            selector: moduleSelector,
          },
          directItems: {
            key: "database-module-tables",
            title: "直属数据表",
            ariaLabel: "直属数据表",
            value: selectedTable?.name ?? null,
            columns: 2,
            options: directTables.map((table) => ({
              value: table.name,
              label: `${table.name} · ${table.columnCount} 字段`,
            })),
            onSelect: setSelectedTableName,
            emptyText: "当前模块没有直属数据表",
          },
          detailSections: selectedTable ? [{
            ...createPageTableSection("database-table-fields", {
              rows: selectedTable.columns,
              columns: fieldColumns,
              visibleColumns: fieldColumns.map((column) => column.key),
              rowKey: (row) => row.name,
              presentation: { density: "compact", cellWrap: "nowrap" },
              emptyText: "该表暂无字段",
            }),
            header: { title: `${selectedTable.name} 字段` },
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
          }] : [],
          desktop: { ratio: [3, 7] },
        })
      : createPageBody([
        ...(graph ? [createVisualizationSection("database-schema-graph", {
          kind: "chart",
          chart: {
            frame: {
              title: graphSelectedTable ? `${graphSelectedTable.name} 关系网` : graphKey.startsWith("group:")
                ? `${catalog.groups.find((group) => `group:${group.key}` === graphKey)?.label ?? "模块"}数据关系`
                : "全库关系图",
              subtitle: graphSelectedTable
                ? "以当前表为中心展示一跳 FK；悬停后仅显示当前表及其引用目标，橙线表示向外引用，蓝线表示被引用，橙色描边表示自引用。"
                : "圆点是数据表，大小反映 FK 连接数；悬停后仅显示当前表及其引用目标，橙线表示向外引用，蓝线表示被引用，橙色描边表示自引用。",
            },
            visual: graph,
          },
        })] : []),
        createMetricsSection("database-schema-metrics", {
          metrics: [
            { key: "tables", label: "当前数据表", value: visibleTables.length },
            { key: "columns", label: "当前字段", value: visibleTables.reduce((sum, table) => sum + table.columnCount, 0) },
            { key: "relations", label: "当前外键", value: visibleRelations.length },
            { key: "schema", label: "数据库 Schema", value: `${catalog.databaseName} / ${catalog.schemaName}` },
          ],
        }),
      ]);
  return { body, toolbarItems };
}
