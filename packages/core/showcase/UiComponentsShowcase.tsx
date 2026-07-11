"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageSurface, type BodySurfaceProps, type BodySurfaceSectionSpec, type SurfaceToolbarItem } from "@workspace/core/ui";
import {
  coreUiDeclarationCategoryMeta,
  coreUiComponentRegistry,
  type CoreUiCapabilityDescriptor,
  type CoreUiComponentRegistration,
} from "../ui/registry/component-registry";
import { buildCoreUiComponentTree } from "../ui/registry/component-registry-view";
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

function declarationSections(items: readonly CoreUiCapabilityDescriptor[], prefix = "declare"): BodySurfaceSectionSpec[] {
  return items.map((item, index) => ({
    key: `${prefix}-${index}-${item.name}`,
    header: { title: item.name },
    chrome: "divider",
    body: {
      kind: "section",
      message: { content: item.description, tone: "muted", presentation: "plain" },
      sections: item.children?.length ? declarationSections(item.children, `${prefix}-${index}`) : undefined,
    },
  }));
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

  const detailBody: BodySurfaceProps = selectedComponent && selectedNode ? {
    kind: "section",
    title: `${selectedComponent.name} · ${coreUiDeclarationCategoryMeta[selectedNode.category].label}`,
    message: { content: selectedComponent.description, presentation: "plain" },
    sections: selectedComponent.declares?.length
      ? declarationSections(selectedComponent.declares)
      : [{ key: "empty", body: { kind: "section", empty: { content: "这个组件没有声明字段" } } }],
  } : { kind: "section", empty: { content: "请选择一个声明组件" } };

  return (
    <PageSurface
      kind="standard"
      toolbar={{ items: toolbarItems }}
      body={{
        kind: "section",
        layout: "split",
        left: { kind: "selector", selector: {
          kind: "list",
          title: "声明能力",
          items: filteredRoots.map((node) => ({
            key: node.name,
            value: node,
            card: { title: node.name, subtitle: coreUiDeclarationCategoryMeta[node.category].label },
          })),
          selectedId: selectedNode?.name ?? null,
          onSelect: (node) => setSelectedName(node.name),
          emptyText: "没有找到匹配的声明能力",
        } },
        drawerLeft: { kind: "selector", selector: {
          kind: "list",
          title: "声明能力",
          items: filteredRoots.map((node) => ({ key: node.name, value: node, card: { title: node.name } })),
          selectedId: selectedNode?.name ?? null,
          onSelect: (node) => { setSelectedName(node.name); setDrawerOpen(false); },
          emptyText: "没有找到匹配的声明能力",
        } },
        right: detailBody,
        sideOpen,
        drawerOpen,
        onSideOpenChange: setSideOpen,
        onDrawerOpenChange: setDrawerOpen,
        sideLabel: "声明目录",
        showSideControls: false,
        splitRatio: [0.3, 0.7],
      }}
    />
  );
}
