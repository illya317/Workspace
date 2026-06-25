"use client";

import { useEffect, useMemo, useState } from "react";
import {
  coreUiComponentKindMeta,
  coreUiComponentRegistry,
  coreUiComponentTierMeta,
  EmptyStateCard,
  PageContent,
  Toolbar,
  type ToolbarItem,
} from "@workspace/core/ui";
import {
  buildCoreUiRegistryTreeGroups,
  getCoreUiComponentRelationView,
} from "@workspace/core/ui/component-registry-view";
import type {
  CoreUiComponentKind,
  CoreUiComponentRegistration,
  CoreUiComponentTier,
} from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import { UiComponentPreviewPanel } from "./UiComponentPreviewPanel";
import { UiComponentRelationPanel } from "./UiComponentRelations";
import { UiComponentTreePanel } from "./UiComponentTreePanel";
import { useUiComponentVerified } from "./use-ui-component-verified";

const ALL_TIER = "all";
const ALL_KIND = "all";

type UiComponentsShowcaseProps = {
  usageRows?: Array<{
    name: string;
    usageFiles: string[];
  }>;
};

type TreeTierFilter = CoreUiComponentTier | typeof ALL_TIER;
type TreeKindFilter = CoreUiComponentKind | typeof ALL_KIND;

const TIER_OPTIONS: Array<{ value: TreeTierFilter; label: string }> = [
  { value: ALL_TIER, label: "全部" },
  { value: "foundation", label: coreUiComponentTierMeta.foundation.label },
  { value: "primitive", label: coreUiComponentTierMeta.primitive.label },
  { value: "assembly", label: coreUiComponentTierMeta.assembly.label },
  { value: "shell", label: coreUiComponentTierMeta.shell.label },
  { value: "frame", label: coreUiComponentTierMeta.frame.label },
];

export default function UiComponentsShowcase({
  usageRows = [],
}: UiComponentsShowcaseProps) {
  const [tier, setTier] = useState<TreeTierFilter>(ALL_TIER);
  const [kind, setKind] = useState<TreeKindFilter>(ALL_KIND);
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string>(coreUiComponentRegistry[0]?.name ?? "");
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

  const treeGroups = useMemo(() => {
    return buildCoreUiRegistryTreeGroups({ verifiedNames, usageFilesByName });
  }, [usageFilesByName, verifiedNames]);

  const kindOptions = useMemo(() => {
    return [
      { value: ALL_KIND, label: "全部分类" },
      ...Object.keys(coreUiComponentKindMeta).map((key) => {
        const typedKey = key as CoreUiComponentKind;
        return { value: typedKey, label: coreUiComponentKindMeta[typedKey].label };
      }),
    ];
  }, []);

  const filteredTreeGroups = useMemo(() => {
    const keyword = query.trim();
    return treeGroups.flatMap((tierGroup) => {
      if (tier !== ALL_TIER && tierGroup.tier !== tier) return [];
      const kinds = tierGroup.kinds.flatMap((kindGroup) => {
        if (kind !== ALL_KIND && kindGroup.kind !== kind) return [];
        const nodes = kindGroup.nodes.filter((node) => {
          if (!keyword) return true;
          return matchText(node.name, keyword)
            || matchText(node.component.description, keyword)
            || matchText(node.kind, keyword)
            || matchText(coreUiComponentKindMeta[node.kind].label, keyword)
            || matchText(coreUiComponentTierMeta[node.tier].label, keyword);
        });
        return nodes.length ? [{ ...kindGroup, nodes }] : [];
      });
      return kinds.length ? [{ ...tierGroup, kinds }] : [];
    });
  }, [kind, query, tier, treeGroups]);

  const filteredNodeCount = useMemo(() => {
    return filteredTreeGroups.reduce((sum, tierGroup) => (
      sum + tierGroup.kinds.reduce((kindSum, kindGroup) => kindSum + kindGroup.nodes.length, 0)
    ), 0);
  }, [filteredTreeGroups]);

  const selectedComponent = componentByName.get(selectedName) ?? null;
  const selectedRelation = selectedComponent
    ? getCoreUiComponentRelationView(selectedComponent.name, {
      usageFiles: usageFilesByName.get(selectedComponent.name) ?? [],
    })
    : null;

  useEffect(() => {
    if (selectedComponent) return;
    const firstNode = filteredTreeGroups[0]?.kinds[0]?.nodes[0];
    if (firstNode) setSelectedName(firstNode.name);
  }, [filteredTreeGroups, selectedComponent]);

  function selectComponent(name: string) {
    if (componentByName.has(name)) setSelectedName(name);
  }

  const toolbarItems: ToolbarItem[] = useMemo(
    () => [
      {
        kind: "option-group",
        key: "tier",
        section: "view",
        value: tier,
        options: TIER_OPTIONS,
        onChange: (value) => setTier(value as TreeTierFilter),
        ariaLabel: "注册项层级",
      },
      {
        kind: "select",
        key: "kind",
        section: "filter",
        value: kind,
        options: kindOptions,
        onChange: (value) => setKind(value as TreeKindFilter),
        placeholder: "全部分类",
        triggerClassName: "!w-32",
      },
      {
        kind: "search",
        key: "query",
        section: "filter",
        value: query,
        onChange: setQuery,
        placeholder: "搜索注册项...",
        ariaLabel: "搜索注册项",
        className: "w-48",
      },
      {
        kind: "text",
        key: "count",
        section: "meta",
        content: <>共 {filteredNodeCount} 个注册项</>,
      },
    ],
    [filteredNodeCount, kind, kindOptions, query, tier],
  );

  return (
    <PageContent className="max-w-7xl py-8">
      <Toolbar items={toolbarItems} className="mb-5" />

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <UiComponentTreePanel
          groups={filteredTreeGroups}
          selectedName={selectedName}
          onSelect={selectComponent}
        />
        {selectedComponent && selectedRelation ? (
          <div className="space-y-4">
            <UiComponentPreviewPanel
              component={selectedComponent}
              verified={verifiedNames.has(selectedComponent.name)}
              canWrite={canWrite}
              onToggleVerified={() => toggleVerified(selectedComponent.name)}
            />
            <UiComponentRelationPanel
              relation={selectedRelation}
              onSelect={selectComponent}
            />
          </div>
        ) : (
          <EmptyStateCard>请选择一个组件</EmptyStateCard>
        )}
      </div>
    </PageContent>
  );
}
