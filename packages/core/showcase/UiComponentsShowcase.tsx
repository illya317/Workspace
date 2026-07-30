"use client";

import { useEffect, useMemo, useState } from "react";
import { createMasterDetailBody, PageSurface, type BodySurfaceProps, type SurfaceToolbarItem } from "@workspace/core/ui";
import {
  coreUiDeclarationCategoryMeta,
  coreUiComponentRegistry,
  type CoreUiComponentRegistration,
} from "../ui/registry/component-registry";
import { buildCoreUiComponentTree } from "../ui/registry/component-registry-view";
import {
  filterUiComponents,
  type UiComponentCategoryFilter,
} from "./filter-ui-components";
import { CoreUiDeclarationOutline } from "./CoreUiDeclarationOutline";

const ALL_CATEGORY = "all";

const CATEGORY_OPTIONS: Array<{ value: UiComponentCategoryFilter; label: string }> = [
  { value: ALL_CATEGORY, label: "全部" },
  { value: "page-layout", label: coreUiDeclarationCategoryMeta["page-layout"].label },
  { value: "page-content", label: coreUiDeclarationCategoryMeta["page-content"].label },
  { value: "common", label: coreUiDeclarationCategoryMeta.common.label },
];

export default function UiComponentsShowcase() {
  const [categoryValue, setCategoryValue] = useState<UiComponentCategoryFilter>(ALL_CATEGORY);
  const [query, setQuery] = useState("");
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

  const toolbarItems = useMemo<SurfaceToolbarItem[]>(() => [
    { kind: "search", key: "search", value: query, onChange: setQuery, placeholder: "搜索声明能力..." },
    { kind: "option-group", key: "category", value: categoryValue, options: CATEGORY_OPTIONS, onChange: (value) => setCategoryValue(value as UiComponentCategoryFilter), ariaLabel: "分类" },
    { kind: "text", key: "meta", content: <>共 {filteredRoots.length} 个声明组件</> },
  ], [categoryValue, filteredRoots.length, query]);

  const detailBody: BodySurfaceProps = selectedComponent && selectedNode ? {
    kind: "section",
    title: `${selectedComponent.name} · ${coreUiDeclarationCategoryMeta[selectedNode.category].label}`,
    message: {
      presentation: "plain",
      content: (
        <div className="space-y-4">
          <p className="max-w-4xl text-sm leading-6 text-slate-600">{selectedComponent.description}</p>
          {selectedComponent.declares?.length
            ? <CoreUiDeclarationOutline items={selectedComponent.declares} />
            : <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">这个组件没有声明字段</div>}
        </div>
      ),
    },
  } : { kind: "section", empty: { content: "请选择一个声明组件" } };

  return (
    <PageSurface
      kind="standard"
      toolbar={{ items: toolbarItems }}
      body={createMasterDetailBody({
        master: { label: "声明目录", presentation: "compact", body: { kind: "selector", selector: {
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
        } } },
        detail: detailBody,
        desktop: { ratio: [0.3, 0.7] },
      })}
    />
  );
}
