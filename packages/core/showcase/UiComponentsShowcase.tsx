"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyStateCard,
  Toolbar,
  WorkspaceSplitPage,
  type ColumnDef,
  type ToolbarItem,
} from "@workspace/core/ui";
import {
  coreUiComponentAccessLayerMeta,
  coreUiComponentRegistry,
  getCoreUiCompositionGraph,
} from "@workspace/core/ui/component-registry";
import {
  buildCoreUiComponentTree,
  getCoreUiComponentRelationView,
} from "@workspace/core/ui/component-registry-view";
import type {
  CoreUiComponentAccessLayer,
  CoreUiComponentRegistration,
} from "@workspace/core/ui/component-registry";

import { UiComponentPreviewPanel } from "./UiComponentPreviewPanel";
import { UiComponentRelationPanel } from "./UiComponentRelations";
import {
  getUiComponentTreeRootId,
  UiComponentTreePanel,
  type UiComponentTreeMetaKey,
} from "./UiComponentTreePanel";
import { filterUiComponents } from "./filter-ui-components";
import { useUiComponentVerified } from "./use-ui-component-verified";

const ALL_ACCESS_LAYER = "all";
const ALL_VERIFIED = "all";

type UiComponentsShowcaseProps = {
  usageRows?: Array<{
    name: string;
    usageFiles: string[];
  }>;
};

type TreeAccessLayerFilter = CoreUiComponentAccessLayer | typeof ALL_ACCESS_LAYER;
type VerifiedFilter = "verified" | "unverified" | typeof ALL_VERIFIED;

const ACCESS_LAYER_OPTIONS: Array<{ value: TreeAccessLayerFilter; label: string }> = [
  { value: ALL_ACCESS_LAYER, label: "全部开放层" },
  { value: "page-frame", label: coreUiComponentAccessLayerMeta["page-frame"].label },
  { value: "page-api", label: coreUiComponentAccessLayerMeta["page-api"].label },
  { value: "core-internal", label: coreUiComponentAccessLayerMeta["core-internal"].label },
  { value: "foundation", label: coreUiComponentAccessLayerMeta.foundation.label },
];

const META_COLUMNS: ColumnDef[] = [
  { key: "kind", label: "分类", defaultVisible: true },
  { key: "accessLayer", label: "开放层", defaultVisible: true },
  { key: "usedBy", label: "被引用", defaultVisible: true },
  { key: "files", label: "文件", defaultVisible: true },
  { key: "verified", label: "改造状态", defaultVisible: true },
];

const DEFAULT_VISIBLE_META: UiComponentTreeMetaKey[] = ["kind", "accessLayer", "usedBy", "files", "verified"];

function findComponent(name: string) {
  return coreUiComponentRegistry.find((component) => component.name === name) as CoreUiComponentRegistration | undefined;
}

export default function UiComponentsShowcase({
  usageRows = [],
}: UiComponentsShowcaseProps) {
  const firstRoot = coreUiComponentRegistry.find(
    (component) => component.accessLayer !== "private-impl",
  );
  const [accessLayerValue, setAccessLayerValue] = useState<string>(ALL_ACCESS_LAYER);
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>(ALL_VERIFIED);
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(firstRoot?.name ?? null);
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visibleMeta, setVisibleMeta] = useState<string[]>(DEFAULT_VISIBLE_META);
  const [pendingScrollName, setPendingScrollName] = useState<string | null>(null);
  const { verifiedNames, toggleVerified, canWrite } = useUiComponentVerified();

  const componentByName = useMemo(() => {
    return new Map<string, CoreUiComponentRegistration>(
      coreUiComponentRegistry.map((component) => [component.name, component as CoreUiComponentRegistration]),
    );
  }, []);

  const usageFilesByName = useMemo(() => {
    return new Map<string, readonly string[]>(
      usageRows.map((row) => [row.name, row.usageFiles]),
    );
  }, [usageRows]);

  const usedByNamesByName = useMemo(() => {
    const graph = getCoreUiCompositionGraph();
    return new Map<string, readonly string[]>(
      [...graph.usedBy.entries()].map(([name, usedBy]) => [name, usedBy]),
    );
  }, []);

  const treeRoots = useMemo(() => {
    return buildCoreUiComponentTree({ verifiedNames, usageFilesByName });
  }, [usageFilesByName, verifiedNames]);

  const filteredRoots = useMemo(() => {
    return filterUiComponents(treeRoots, {
      keyword: query.trim(),
      accessLayerValue: accessLayerValue,
      verifiedFilter,
      usageFilesByName,
      usedByNamesByName,
    });
  }, [accessLayerValue, query, treeRoots, usageFilesByName, usedByNamesByName, verifiedFilter]);

  const visibleRoots = filteredRoots;
  const selectedComponent = selectedName ? (componentByName.get(selectedName) ?? null) : null;
  const selectedRelation = selectedComponent
    ? getCoreUiComponentRelationView(selectedComponent.name, {
      usageFiles: usageFilesByName.get(selectedComponent.name) ?? [],
    })
    : null;
  const selectedNestDepth = useMemo(() => {
    return treeRoots.find((node) => node.name === selectedName)?.nestDepth ?? 1;
  }, [treeRoots, selectedName]);

  useEffect(() => {
    if (!selectedName) return;
    if (selectedComponent) return;
    if (visibleRoots[0]) setSelectedName(visibleRoots[0].name);
  }, [selectedComponent, selectedName, visibleRoots]);

  useEffect(() => {
    if (!pendingScrollName) return;
    const target = document.getElementById(getUiComponentTreeRootId(pendingScrollName));
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setPendingScrollName(null);
  }, [pendingScrollName, visibleRoots]);

  function toggleExpanded(name: string) {
    setExpandedNames((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function collapseComponent(name: string) {
    setSelectedName(null);
    setExpandedNames((current) => {
      if (!current.has(name)) return current;
      const next = new Set(current);
      next.delete(name);
      return next;
    });
  }

  function focusComponent(name: string) {
    if (selectedName === name) {
      collapseComponent(name);
      return;
    }

    const component = findComponent(name);
    if (!component) return;
    setSelectedName(name);
    if (component.accessLayer === "private-impl") return;

    setExpandedNames((current) => new Set([...current, name]));
    setSideOpen(true);
    setDrawerOpen(false);
    setPendingScrollName(name);
  }

  function toggleSideFromToolbar() {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setDrawerOpen(true);
      return;
    }
    setSideOpen((open) => !open);
  }

  const toolbarItems = useMemo<ToolbarItem[]>(() => [
    { kind: "create", key: "create", label: "新建组件", disabled: true, onClick: () => {} },
    { kind: "panel-toggle", key: "toggle-list", icon: sideOpen ? "panel-open" : "panel-close", label: sideOpen ? "隐藏组件目录" : "显示组件目录", variant: sideOpen ? "primary" : "secondary", onClick: toggleSideFromToolbar },
    { kind: "search", key: "search", value: query, onChange: setQuery, placeholder: "搜索组件..." },
    { kind: "option-group", key: "access-layer", value: accessLayerValue, options: ACCESS_LAYER_OPTIONS, onChange: (value) => setAccessLayerValue(value as TreeAccessLayerFilter), ariaLabel: "开放层" },
    { kind: "option-group", key: "verified", value: verifiedFilter, options: [{ value: ALL_VERIFIED, label: "全部" }, { value: "verified", label: "无需改造" }, { value: "unverified", label: "待改造" }], onChange: (value) => setVerifiedFilter(value as VerifiedFilter), ariaLabel: "改造状态" },
    { kind: "icon-button", key: "refresh", icon: "refresh", label: "刷新", onClick: () => {} },
    { kind: "icon-button", key: "download", icon: "download", label: "下载", disabled: true, onClick: () => {} },
    { kind: "icon-button", key: "edit", icon: "edit", label: "编辑", disabled: true, onClick: () => {} },
    { kind: "text", key: "meta", content: <>共 {filteredRoots.length} 个组件</> },
    { kind: "column-toggle", key: "columns", columns: META_COLUMNS, visible: visibleMeta, onChange: setVisibleMeta },
  ], [accessLayerValue, filteredRoots.length, query, sideOpen, verifiedFilter, visibleMeta]);

  return (
    <WorkspaceSplitPage
      sideOpen={sideOpen}
      drawerOpen={drawerOpen}
      onSideOpenChange={setSideOpen}
      onDrawerOpenChange={setDrawerOpen}
      sideLabel="组件目录"
      splitRatio={[3, 7]}
      contentClassName="max-w-7xl py-8"
      showSideControls={false}
      header={(
        <Toolbar items={toolbarItems} hideOverflowItems />
      )}
      renderSide={() => (
        <UiComponentTreePanel
          nodes={visibleRoots}
          selectedName={selectedName}
          expandedNames={expandedNames}
          visibleMeta={visibleMeta}
          onSelect={focusComponent}
          onToggle={toggleExpanded}
        />
      )}
    >
      {selectedComponent && selectedRelation ? (
        <div className="space-y-4">
          <UiComponentPreviewPanel
            component={selectedComponent}
            nestDepth={selectedNestDepth}
            verified={verifiedNames.has(selectedComponent.name)}
            canWrite={canWrite}
            onToggleVerified={() => toggleVerified(selectedComponent.name)}
          />
          <UiComponentRelationPanel
            relation={selectedRelation}
            onSelect={focusComponent}
          />
        </div>
      ) : (
        <EmptyStateCard>请选择一个组件</EmptyStateCard>
      )}
    </WorkspaceSplitPage>
  );
}
