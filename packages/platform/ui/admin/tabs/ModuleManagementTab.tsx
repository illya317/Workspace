"use client";

import { useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { createBlockSurfaceBlock, createPageBody, createSectionBlock, PageSurface } from "@workspace/core/ui";
import ResourceTree, { type ResourceTreeNode } from "../components/ResourceTree";

type ModuleStatus = "enabled" | "hidden" | "disabled";

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
}

interface Props {
  showToast: (msg: string, type?: "success" | "error") => void;
}

const STATUS_LABEL: Record<ModuleStatus, string> = {
  enabled: "已开启",
  hidden: "已隐藏",
  disabled: "已关闭",
};

const STATUS_VARIANT: Record<ModuleStatus, "green" | "yellow" | "gray"> = {
  enabled: "green",
  hidden: "yellow",
  disabled: "gray",
};

function flattenModules(modules: ModuleNode[]) {
  return modules.flatMap((module) => [module, ...module.children]);
}

function findModule(modules: ModuleNode[], resourceKey: string | null): ModuleNode | null {
  if (!resourceKey) return null;
  return flattenModules(modules).find((module) => module.resourceKey === resourceKey) ?? null;
}

export default function ModuleManagementTab({ showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedResourceKey, setSelectedResourceKey] = useState<string | null>(null);
  const [data, setData] = useState<ModuleManagementResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(workspacePath("/api/settings/admin/modules"));
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
  }, [showToast]);

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
    function toTreeNode(module: ModuleNode): ResourceTreeNode {
      const auxiliaryChildren = (auxiliaryByOwner.get(module.resourceKey) ?? []).map((resource): ResourceTreeNode => ({
        key: resource.key,
        name: resource.name,
        hidden: resource.hidden,
        enabled: resource.enabled,
        disabledReason: resource.disabledReason,
        statusLabel: STATUS_LABEL[resource.status],
        statusVariant: STATUS_VARIANT[resource.status],
        children: [],
      }));
      const children = [
        ...module.children.map(toTreeNode),
        ...auxiliaryChildren,
      ];
      return {
        key: module.resourceKey,
        name: module.label,
        selectableWithChildren: true,
        hidden: module.hidden,
        enabled: module.enabled,
        disabledReason: module.disabledReason,
        statusLabel: STATUS_LABEL[module.status],
        statusVariant: STATUS_VARIANT[module.status],
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
      const res = await fetch(workspacePath("/api/settings/admin/modules"), {
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

  return (
    <PageSurface
      kind="settings"
      embedded
      body={createPageBody(!data ? [] : [createSectionBlock("module-tree", {
          title: "模块树",
          subtitle: data.rule,

          blocks: [createBlockSurfaceBlock("tree-body", {
            kind: "message",

            content: (
                <ResourceTree
                  resources={moduleTree}
                  selectedResource={selectedResourceKey}
                  onSelect={setSelectedResourceKey}
                  onStatusClick={(resource) => {
                    const moduleNode = findModule(data.modules, resource.key);
                    if (!moduleNode || saving || (moduleNode.level === "L2" && moduleNode.parentEnabled === false)) return;
                    void updateModuleEnabled(moduleNode, !moduleNode.enabled);
                  }}
                  defaultExpanded
                />
            )
          })],
        })], { empty: loading || !data ? { content: loading ? "加载模块管理..." : "暂无模块管理数据" } : undefined })}
    />
  );
}
