"use client";

import { useEffect, useMemo, useState } from "react";
import { matchText } from "@workspace/platform/search";
import { workspacePath } from "@workspace/core/routing";
import {
  EmptyStateCard,
  FormField,
  SearchInput,
  SectionCard,
  Badge,
  SwitchField,
  Toolbar,
} from "@workspace/core/ui";
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

function moduleMatches(module: ModuleNode, query: string) {
  return [
    module.key,
    module.label,
    module.desc,
    module.packageName,
    module.pageHref ?? "",
    module.resourceKey,
    ...module.apiPrefixes,
  ].some((value) => matchText(String(value ?? ""), query));
}

function StatusPill({ status }: { status: ModuleStatus }) {
  return <Badge label={STATUS_LABEL[status]} tone={STATUS_VARIANT[status]} />;
}

function DetailLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-800">{children}</div>
    </div>
  );
}

export default function ModuleManagementTab({ showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
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

  const selectedModule = useMemo(
    () => data ? findModule(data.modules, selectedResourceKey) : null,
    [data, selectedResourceKey],
  );
  const moduleTree = useMemo(() => {
    if (!data) return [];
    const normalizedQuery = query.trim();
    function toTreeNode(module: ModuleNode): ResourceTreeNode | null {
      const children = module.children.flatMap((child) => {
        const node = toTreeNode(child);
        return node ? [node] : [];
      });
      const visible = !normalizedQuery || moduleMatches(module, normalizedQuery) || children.length > 0;
      if (!visible) return null;
      return {
        key: module.resourceKey,
        name: module.label,
        hidden: module.hidden,
        enabled: module.enabled,
        disabledReason: module.disabledReason,
        statusLabel: STATUS_LABEL[module.status],
        statusVariant: STATUS_VARIANT[module.status],
        children,
      };
    }
    return data.modules.flatMap((module) => {
      const node = toTreeNode(module);
      return node ? [node] : [];
    });
  }, [data, query]);

  async function updateModuleEnabled(enabled: boolean) {
    if (!selectedModule) return;
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/settings/admin/modules"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceKey: selectedModule.resourceKey, enabled }),
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

  if (loading) return <EmptyStateCard>加载模块管理...</EmptyStateCard>;
  if (!data) return <EmptyStateCard>暂无模块管理数据</EmptyStateCard>;

  const switchDisabled = saving || (selectedModule?.level === "L2" && selectedModule.parentEnabled === false);
  const apiText = selectedModule?.apiPrefixes.length
    ? selectedModule.apiPrefixes.join("、")
    : selectedModule?.noApiReason ?? "未声明 API";
  const pageText = selectedModule?.pageHref ?? selectedModule?.noPageReason ?? "无页面";

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-3">
        <Toolbar
          items={[
            {
              kind: "custom",
              key: "search",
              section: "filter",
              content: (
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="搜索模块"
                  className="w-full"
                />
              ),
            },
          ]}
          className="w-full"
        />
        <SectionCard title="模块树" bodyClassName="p-2">
          <ResourceTree
            resources={moduleTree}
            selectedResource={selectedResourceKey}
            onSelect={setSelectedResourceKey}
            forceExpanded={query.trim().length > 0}
          />
        </SectionCard>
      </div>

      <div className="space-y-4">
        {selectedModule ? (
          <SectionCard
            title={selectedModule.label}
            subtitle={`${selectedModule.level} · ${selectedModule.resourceKey}`}
            actions={<StatusPill status={selectedModule.status} />}
          >
            <div className="space-y-4">
              <FormField label="模块开关" layout="inline">
                <div className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <SwitchField
                    checked={selectedModule.enabled}
                    disabled={switchDisabled}
                    onChange={updateModuleEnabled}
                    ariaLabel="切换模块启用状态"
                  />
                  <span>{selectedModule.enabled ? "开启" : "关闭"}</span>
                </div>
              </FormField>
              {selectedModule.level === "L2" && selectedModule.parentEnabled === false && (
                <p className="text-sm text-amber-700">上级 L1 已关闭，需要先开启上级模块。</p>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <DetailLine label="页面">{pageText}</DetailLine>
                <DetailLine label="API">{apiText}</DetailLine>
                <DetailLine label="Resource">{selectedModule.resourceKey}</DetailLine>
                <DetailLine label="Package">{selectedModule.packageName}</DetailLine>
              </div>
              <p className="text-sm text-slate-500">{data.rule}</p>
              {selectedModule.disabledReason && (
                <p className="text-sm text-slate-400">{selectedModule.disabledReason}</p>
              )}
            </div>
          </SectionCard>
        ) : (
          <EmptyStateCard>请选择一个模块</EmptyStateCard>
        )}

        <SectionCard title="辅助资源" subtitle="不属于 L1/L2 主模块，但会跟随所属模块或独立规则治理。">
          <div className="space-y-2">
            {data.auxiliaryResources.map((resource) => (
              <div key={resource.key} className="grid gap-2 text-sm md:grid-cols-[1fr_auto]">
                <div>
                  <div className="font-medium text-slate-800">{resource.name}</div>
                  <div className="text-xs text-slate-400">{resource.key}</div>
                  {resource.disabledReason && <div className="text-xs text-slate-400">{resource.disabledReason}</div>}
                </div>
                <StatusPill status={resource.status} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
