"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyStateCard,
  PageToolbar,
  WorkspaceSplitPage,
  type ColumnDef,
} from "@workspace/core/ui";
import {
  coreUiComponentRegistry,
  coreUiComponentTierMeta,
  getCoreUiCompositionGraph,
} from "@workspace/core/ui/component-registry";
import {
  buildCoreUiComponentTree,
  getCoreUiComponentRelationView,
} from "@workspace/core/ui/component-registry-view";
import type {
  CoreUiComponentRegistration,
  CoreUiComponentTier,
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

const ALL_TIER = "all";
const ALL_VERIFIED = "all";

type UiComponentsShowcaseProps = {
  usageRows?: Array<{
    name: string;
    usageFiles: string[];
  }>;
};

type TreeTierFilter = Exclude<CoreUiComponentTier, "foundation"> | typeof ALL_TIER;
type VerifiedFilter = "verified" | "unverified" | typeof ALL_VERIFIED;

const TIER_OPTIONS: Array<{ value: TreeTierFilter; label: string }> = [
  { value: ALL_TIER, label: "全部层级" },
  { value: "primitive", label: coreUiComponentTierMeta.primitive.label },
  { value: "assembly", label: coreUiComponentTierMeta.assembly.label },
  { value: "shell", label: coreUiComponentTierMeta.shell.label },
  { value: "frame", label: coreUiComponentTierMeta.frame.label },
];

const META_COLUMNS: ColumnDef[] = [
  { key: "kind", label: "分类", defaultVisible: true },
  { key: "tier", label: "层级", defaultVisible: true },
  { key: "usedBy", label: "被引用", defaultVisible: true },
  { key: "files", label: "文件", defaultVisible: true },
  { key: "verified", label: "验证", defaultVisible: true },
];

const DEFAULT_VISIBLE_META: UiComponentTreeMetaKey[] = ["kind", "tier", "usedBy", "files", "verified"];

function findComponent(name: string) {
  return coreUiComponentRegistry.find((component) => component.name === name) as CoreUiComponentRegistration | undefined;
}

export default function UiComponentsShowcase({
  usageRows = [],
}: UiComponentsShowcaseProps) {
  const firstRoot = coreUiComponentRegistry.find((component) => component.tier !== "foundation");
  const [filterValue, setFilterValue] = useState<string>(ALL_TIER);
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>(ALL_VERIFIED);
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string>(firstRoot?.name ?? "");
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
      tierValue: filterValue,
      verifiedFilter,
      usageFilesByName,
      usedByNamesByName,
    });
  }, [filterValue, query, treeRoots, usageFilesByName, usedByNamesByName, verifiedFilter]);

  const visibleRoots = filteredRoots;
  const selectedComponent = componentByName.get(selectedName) ?? null;
  const selectedRelation = selectedComponent
    ? getCoreUiComponentRelationView(selectedComponent.name, {
      usageFiles: usageFilesByName.get(selectedComponent.name) ?? [],
    })
    : null;
  const selectedNestDepth = useMemo(() => {
    return treeRoots.find((node) => node.name === selectedName)?.nestDepth ?? 1;
  }, [treeRoots, selectedName]);

  useEffect(() => {
    if (selectedComponent) return;
    if (visibleRoots[0]) setSelectedName(visibleRoots[0].name);
  }, [selectedComponent, visibleRoots]);

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

  function focusComponent(name: string) {
    const component = findComponent(name);
    if (!component) return;
    setSelectedName(name);
    if (component.tier === "foundation") return;

    setFilterValue(ALL_TIER);
    setVerifiedFilter(ALL_VERIFIED);
    setQuery("");
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
        <PageToolbar
          features={["view", "search", "filter", "meta", "columns"]}
          onToggleList={toggleSideFromToolbar}
          listVisible={sideOpen}
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "搜索组件...",
          }}
          optionGroups={[
            {
              value: verifiedFilter,
              options: [
                { value: ALL_VERIFIED, label: "全部" },
                { value: "verified", label: "已验证" },
                { value: "unverified", label: "未验证" },
              ],
              onChange: (value) => setVerifiedFilter(value as VerifiedFilter),
              ariaLabel: "验证状态",
            },
            {
              value: filterValue,
              options: TIER_OPTIONS,
              onChange: (value) => setFilterValue(value as TreeTierFilter),
              ariaLabel: "层级",
            },
          ]}
          columns={{
            defs: META_COLUMNS,
            visible: visibleMeta,
            onChange: setVisibleMeta,
          }}
          meta={<>共 {filteredRoots.length} 个组件</>}
        />
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
