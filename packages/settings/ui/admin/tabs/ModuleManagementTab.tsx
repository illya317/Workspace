"use client";

import { useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createFieldsSection,
  createMasterDetailBody,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  type BodySurfaceSectionSpec,
  type SelectorSurfaceStructuredTreeItemSpec,
} from "@workspace/core/ui";
import type { SourceCodeAnalysisSnapshot } from "@workspace/platform/source-code-analysis-contract";
import { createSourceCodeAnalysisSection } from "./SourceCodeAnalysisSection";
import {
  sourceCodeAnalysisSelectionAfterClick,
  type SourceCodeAnalysisCellKey,
} from "./source-code-analysis-relations";

type ModuleStatus = "enabled" | "hidden" | "disabled";
type StatusTone = "success" | "warning" | "muted";

interface ModuleTreeNode {
  key: string;
  name: string;
  nodeKind: "product-view" | "module" | "resource" | "source-view";
  hidden?: boolean;
  enabled?: boolean;
  disabledReason?: string | null;
  statusLabel?: string;
  statusTone?: StatusTone;
  statusInteractive?: boolean;
  statusDisabled?: boolean;
  children?: ModuleTreeNode[];
}

interface ModuleNode {
  key: string;
  label: string;
  desc: string;
  level: "L1" | "L2";
  packageName: string;
  pageHref: string | null;
  resourceKey: string;
  apiPrefixes: string[];
  noApiReason: string | null;
  noPageReason: string | null;
  status: ModuleStatus;
  hidden: boolean;
  enabled: boolean;
  disabledReason: string | null;
  overrideKey: string;
  parentResourceKey: string | null;
  parentEnabled: boolean | null;
  children: ModuleNode[];
}

interface AuxiliaryResource {
  key: string;
  name: string;
  kind: "capability" | "resource";
  ownerKey: string | null;
  runtimeParentKey: string | null;
  parentKey: string | null;
  status: ModuleStatus;
  hidden: boolean;
  enabled: boolean;
  disabledReason: string | null;
}

interface ModuleManagementResponse {
  rule: string;
  modules: ModuleNode[];
  auxiliaryResources: AuxiliaryResource[];
  sourceCodeAnalysis: SourceCodeAnalysisSnapshot | null;
}

interface Props {
  showToast: (msg: string, type?: "success" | "error") => void;
  enabled?: boolean;
}

const STATUS_LABEL: Record<ModuleStatus, string> = {
  enabled: "已开启",
  hidden: "已隐藏",
  disabled: "已关闭",
};

const STATUS_TONE: Record<ModuleStatus, StatusTone> = {
  enabled: "success",
  hidden: "warning",
  disabled: "muted",
};

function flattenModules(modules: ModuleNode[]) {
  return modules.flatMap((module) => [module, ...module.children]);
}

function findModule(modules: ModuleNode[], resourceKey: string | null): ModuleNode | null {
  if (!resourceKey) return null;
  return flattenModules(modules).find((module) => module.resourceKey === resourceKey) ?? null;
}

export function useModuleManagementSection({ showToast, enabled = true }: Props): BodySurfaceSectionSpec {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNavigationKey, setSelectedNavigationKey] = useState("view:product");
  const [expandedAnalysisGroupKey, setExpandedAnalysisGroupKey] = useState<string | null>(null);
  const [selectedAnalysisCell, setSelectedAnalysisCell] = useState<SourceCodeAnalysisCellKey | null>(null);
  const [hoveredAnalysisCell, setHoveredAnalysisCell] = useState<SourceCodeAnalysisCellKey | null>(null);
  const [data, setData] = useState<ModuleManagementResponse | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(workspacePath("/api/settings/governance/modules"));
        if (!res.ok) {
          showToast("加载模块管理失败: " + res.status, "error");
          return;
        }
        const nextData = await res.json() as ModuleManagementResponse;
        if (!cancelled) {
          setData(nextData);
        }
      } catch {
        if (!cancelled) showToast("加载模块管理失败", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [enabled, showToast]);

  const moduleTree = useMemo(() => {
    if (!data) return [];
    const auxiliaryByOwner = new Map<string, AuxiliaryResource[]>();
    for (const resource of data.auxiliaryResources) {
      const ownerKey = resource.runtimeParentKey ?? resource.ownerKey ?? resource.parentKey;
      if (!ownerKey) continue;
      const list = auxiliaryByOwner.get(ownerKey) ?? [];
      list.push(resource);
      auxiliaryByOwner.set(ownerKey, list);
    }
    function toTreeNode(module: ModuleNode): ModuleTreeNode {
      const auxiliaryChildren = (auxiliaryByOwner.get(module.resourceKey) ?? []).map((resource): ModuleTreeNode => ({
        key: resource.key,
        name: resource.name,
        nodeKind: "resource",
        hidden: resource.hidden,
        enabled: resource.enabled,
        disabledReason: resource.disabledReason,
        statusLabel: STATUS_LABEL[resource.status],
        statusTone: STATUS_TONE[resource.status],
        children: [],
      }));
      const children = [
        ...module.children.map(toTreeNode),
        ...auxiliaryChildren,
      ];
      return {
        key: module.resourceKey,
        name: module.label,
        nodeKind: "module",
        hidden: module.hidden,
        enabled: module.enabled,
        disabledReason: module.disabledReason,
        statusLabel: STATUS_LABEL[module.status],
        statusTone: STATUS_TONE[module.status],
        statusInteractive: true,
        statusDisabled: saving || (module.level === "L2" && module.parentEnabled === false),
        children,
      };
    }
    return data.modules.map(toTreeNode);
  }, [data, saving]);

  const navigationTree = useMemo<ModuleTreeNode[]>(() => {
    if (!data) return [];
    return [
      {
        key: "view:product",
        name: "产品运行",
        nodeKind: "product-view",
        statusLabel: `${data.modules.length} 个 L1`,
        statusTone: "success",
        children: moduleTree,
      },
      {
        key: "view:source",
        name: "源码治理",
        nodeKind: "source-view",
        statusLabel: data.sourceCodeAnalysis ? "快照可用" : "不可用",
        statusTone: data.sourceCodeAnalysis ? "success" : "muted",
        children: [],
      },
    ];
  }, [data, moduleTree]);

  async function updateModuleEnabled(module: ModuleNode, enabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/settings/governance/modules"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceKey: module.resourceKey, enabled }),
      });
      if (!res.ok) {
        showToast("更新模块失败: " + res.status, "error");
        return;
      }
      const nextData = await res.json() as ModuleManagementResponse;
      setData(nextData);
      showToast(enabled ? "模块已开启" : "模块已关闭", "success");
    } catch {
      showToast("更新模块失败", "error");
    } finally {
      setSaving(false);
    }
  }

  function declareModuleTreeItems(nodes: ModuleTreeNode[], level = 1): SelectorSurfaceStructuredTreeItemSpec<ModuleTreeNode>[] {
    return nodes.map((resource) => ({
      key: resource.key,
      value: resource,
      card: {
        title: resource.name,
        level,
        status: resource.statusLabel ? {
          label: resource.statusLabel,
          tone: resource.statusTone,
          disabled: resource.statusDisabled,
          onClick: resource.nodeKind === "module" && resource.statusInteractive ? () => {
            const moduleNode = findModule(data?.modules ?? [], resource.key);
            if (!moduleNode || saving || (moduleNode.level === "L2" && moduleNode.parentEnabled === false)) return;
            void updateModuleEnabled(moduleNode, !moduleNode.enabled);
          } : undefined,
        } : undefined,
      },
      children: resource.children?.length ? declareModuleTreeItems(resource.children, level + 1) : undefined,
    }));
  }

  function productDetailBody() {
    if (!data) return createPageBody([]);
    const selectedModule = findModule(data.modules, selectedNavigationKey);
    const selectedResource = data.auxiliaryResources.find((resource) => resource.key === selectedNavigationKey) ?? null;
    if (selectedModule) {
      return createPageBody([
        {
          ...createFieldsSection("product-module-fields", [
            { kind: "readonly", key: "level", label: "层级", value: selectedModule.level },
            { kind: "readonly", key: "status", label: "运行状态", value: STATUS_LABEL[selectedModule.status] },
            { kind: "readonly", key: "description", label: "职责", value: selectedModule.desc, span: "wide" },
            { kind: "readonly", key: "package", label: "归属包", value: selectedModule.packageName, fontRole: "mono" },
            { kind: "readonly", key: "page", label: "页面入口", value: selectedModule.pageHref ?? selectedModule.noPageReason ?? "无", fontRole: "mono" },
            { kind: "readonly", key: "api", label: "API 边界", value: selectedModule.apiPrefixes.join("、") || selectedModule.noApiReason || "无", span: "wide", fontRole: "mono" },
          ], { kind: "detail", layout: { columns: 2, density: "compact" } }),
          header: { title: selectedModule.label },
        },
      ]);
    }
    if (selectedResource) {
      return createPageBody([{
        ...createFieldsSection("product-resource-fields", [
          { kind: "readonly", key: "kind", label: "类型", value: selectedResource.kind === "capability" ? "能力" : "资源" },
          { kind: "readonly", key: "status", label: "运行状态", value: STATUS_LABEL[selectedResource.status] },
          { kind: "readonly", key: "owner", label: "治理父级", value: selectedResource.runtimeParentKey ?? selectedResource.ownerKey ?? selectedResource.parentKey ?? "未声明", span: "wide", fontRole: "mono" },
        ], { kind: "detail", layout: { columns: 2, density: "compact" } }),
        header: { title: selectedResource.name },
      }]);
    }
    const allModules = flattenModules(data.modules);
    return createPageBody([
      createMetricsSection("product-runtime-summary", {
        metrics: [
          { key: "l1", label: "L1", value: data.modules.length },
          { key: "l2", label: "L2", value: allModules.filter((module) => module.level === "L2").length },
          { key: "enabled", label: "已开启", value: allModules.filter((module) => module.enabled).length },
          { key: "disabled", label: "已关闭", value: allModules.filter((module) => !module.enabled).length },
        ],
      }),
      createMessageSection("product-runtime-guide", { tone: "muted", content: "从左侧逐级选择 L1、L2 或资源，查看职责与运行开关边界。" }),
    ]);
  }

  const detailBody = selectedNavigationKey === "view:source"
    ? createPageBody([createSourceCodeAnalysisSection(data?.sourceCodeAnalysis ?? null, {
        expandedGroupKey: expandedAnalysisGroupKey,
        onToggleGroup: (groupKey) => {
          setExpandedAnalysisGroupKey((current) => current === groupKey ? null : groupKey);
        },
      }, {
        selectedCell: selectedAnalysisCell ?? hoveredAnalysisCell,
        onSelectCell: (cell) => {
          setSelectedAnalysisCell((current) => sourceCodeAnalysisSelectionAfterClick(current, cell));
          setHoveredAnalysisCell(null);
        },
        onHoverCell: selectedAnalysisCell ? undefined : setHoveredAnalysisCell,
      })])
    : productDetailBody();

  return {
    key: "module-management",
    body: !data
      ? createPageBody([], {
        empty: { content: loading ? "加载模块管理..." : "暂无模块管理数据" },
      })
      : createMasterDetailBody({
        master: {
          label: "模块视角",
          body: createPageBody([{
          key: "module-tree",
          header: {
            title: "模块视角",
          },
          body: {
            kind: "selector",
            selector: {
              kind: "tree",
              items: declareModuleTreeItems(navigationTree),
              selectedId: selectedNavigationKey,
              onSelect: (resource: ModuleTreeNode) => setSelectedNavigationKey(resource.key),
            },
          },
          }]),
        },
        detail: detailBody,
        desktop: { ratio: [3, 7] },
      }),
  };
}
