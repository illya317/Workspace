"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SurfaceToolbarItem } from "@workspace/core/ui";
import { EmptyStateCard, PanelCard, Toolbar, WorkspaceSplitPage } from "./internal-ui";
import {
  coreUiDeclarationCategoryMeta,
  coreUiComponentRegistry,
  type CoreUiCapabilityDescriptor,
  type CoreUiDeclarationCategory,
  type CoreUiComponentRegistration,
} from "../ui/registry/component-registry";
import { buildCoreUiComponentTree } from "../ui/registry/component-registry-view";
import { UiComponentTreePanel } from "./UiComponentTreePanel";
import {
  filterUiComponents,
  type UiComponentCategoryFilter,
} from "./filter-ui-components";

const ALL_CATEGORY = "all";

const CATEGORY_OPTIONS: Array<{ value: UiComponentCategoryFilter; label: string }> = [
  { value: ALL_CATEGORY, label: "全部" },
  { value: "page-layout", label: coreUiDeclarationCategoryMeta["page-layout"].label },
  { value: "page-content", label: coreUiDeclarationCategoryMeta["page-content"].label },
  { value: "common", label: coreUiDeclarationCategoryMeta.common.label },
];

function DeclarationList({
  items,
  depth = 0,
}: {
  items: readonly CoreUiCapabilityDescriptor[];
  depth?: number;
}) {
  return (
    <div className={depth === 0 ? "space-y-2" : "mt-2 space-y-2 border-l border-slate-200 pl-3"}>
      {items.map((item) => (
        <div key={`${depth}-${item.name}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-xs font-semibold text-emerald-700">
              {item.name}
            </span>
            <span className="text-xs leading-5 text-slate-600">
              {item.description}
            </span>
          </div>
          {item.children && item.children.length > 0 ? (
            <DeclarationList items={item.children} depth={depth + 1} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DeclarationDetail({
  component,
  category,
}: {
  component: CoreUiComponentRegistration;
  category: CoreUiDeclarationCategory;
}) {
  const declares = component.declares ?? [];
  const categoryMeta = coreUiDeclarationCategoryMeta[category];

  return (
    <PanelCard title={component.name} bodyClassName="p-5">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-6 text-slate-600">
              {component.description}
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {categoryMeta.label}
          </span>
        </div>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              declares
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              仅展示 agent 可声明字段；contract、capabilities 和内部实现不进入此页。
            </p>
          </div>
          {declares.length > 0 ? (
            <DeclarationList items={declares} />
          ) : (
            <EmptyStateCard compact>这个组件没有声明字段</EmptyStateCard>
          )}
        </section>
      </div>
    </PanelCard>
  );
}

export default function UiComponentsShowcase() {
  const [categoryValue, setCategoryValue] = useState<UiComponentCategoryFilter>(ALL_CATEGORY);
  const [query, setQuery] = useState("");
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const treeRoots = useMemo(() => buildCoreUiComponentTree(), []);
  const [selectedName, setSelectedName] = useState<string | null>(treeRoots[0]?.name ?? null);

  const componentByName = useMemo(() => {
    return new Map<string, CoreUiComponentRegistration>(
      coreUiComponentRegistry.map((component) => [component.name, component as CoreUiComponentRegistration]),
    );
  }, []);

  const filteredRoots = useMemo(() => {
    return filterUiComponents(treeRoots, {
      keyword: query,
      categoryValue,
    });
  }, [categoryValue, query, treeRoots]);

  const selectedNode = filteredRoots.find((node) => node.name === selectedName) ?? filteredRoots[0] ?? null;
  const selectedComponent = selectedNode ? (componentByName.get(selectedNode.name) ?? null) : null;

  useEffect(() => {
    if (!selectedNode) {
      setSelectedName(null);
      return;
    }
    if (selectedName !== selectedNode.name) setSelectedName(selectedNode.name);
  }, [selectedName, selectedNode]);

  const toggleSideFromToolbar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setDrawerOpen(true);
      return;
    }
    setSideOpen((open) => !open);
  }, []);

  const toolbarItems = useMemo<SurfaceToolbarItem[]>(() => [
    { kind: "panel-toggle", key: "toggle-list", icon: sideOpen ? "panel-close" : "panel-open", label: sideOpen ? "隐藏声明目录" : "显示声明目录", variant: sideOpen ? "primary" : "secondary", onClick: toggleSideFromToolbar },
    { kind: "search", key: "search", value: query, onChange: setQuery, placeholder: "搜索声明能力..." },
    { kind: "option-group", key: "category", value: categoryValue, options: CATEGORY_OPTIONS, onChange: (value) => setCategoryValue(value as UiComponentCategoryFilter), ariaLabel: "分类" },
    { kind: "text", key: "meta", content: <>共 {filteredRoots.length} 个声明组件</> },
  ], [categoryValue, filteredRoots.length, query, sideOpen, toggleSideFromToolbar]);

  return (
    <WorkspaceSplitPage
      sideOpen={sideOpen}
      drawerOpen={drawerOpen}
      onSideOpenChange={setSideOpen}
      onDrawerOpenChange={setDrawerOpen}
      sideLabel="声明目录"
      splitRatio={[3, 7]}
      contentClassName="max-w-7xl py-8"
      showSideControls={false}
      header={<Toolbar items={toolbarItems} />}
      renderSide={() => (
        <UiComponentTreePanel
          nodes={filteredRoots}
          selectedName={selectedNode?.name ?? null}
          onSelect={setSelectedName}
        />
      )}
    >
      {selectedComponent && selectedNode ? (
        <DeclarationDetail component={selectedComponent} category={selectedNode.category} />
      ) : (
        <EmptyStateCard>请选择一个声明组件</EmptyStateCard>
      )}
    </WorkspaceSplitPage>
  );
}
