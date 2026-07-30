"use client";

import { useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createMasterDetailBody,
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
  const [selectedResourceKey, setSelectedResourceKey] = useState<string | null>(null);
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
          const firstModule = nextData.modules[0] ?? null;
          setSelectedResourceKey((current) => current ?? firstModule?.resourceKey ?? null);
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
          onClick: resource.statusInteractive ? () => {
            const moduleNode = findModule(data?.modules ?? [], resource.key);
            if (!moduleNode || saving || (moduleNode.level === "L2" && moduleNode.parentEnabled === false)) return;
            void updateModuleEnabled(moduleNode, !moduleNode.enabled);
          } : undefined,
        } : undefined,
      },
      children: resource.children?.length ? declareModuleTreeItems(resource.children, level + 1) : undefined,
    }));
  }

  return {
    key: "module-management",
    body: !data
      ? createPageBody([], {
        empty: { content: loading ? "加载模块管理..." : "暂无模块管理数据" },
      })
      : createMasterDetailBody({
        master: {
          label: "模块树",
          body: createPageBody([{
          key: "module-tree",
          header: {
            title: "模块树",
          },
          body: {
            kind: "selector",
            selector: {
              kind: "tree",
              items: declareModuleTreeItems(moduleTree),
              selectedId: selectedResourceKey,
              onSelect: (resource: ModuleTreeNode) => setSelectedResourceKey(resource.key),
            },
          },
          }]),
        },
        detail: createPageBody([createSourceCodeAnalysisSection(data.sourceCodeAnalysis, {
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
        })]),
        desktop: { ratio: [3, 7] },
      }),
  };
}
