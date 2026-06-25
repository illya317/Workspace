"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CommandToolbar,
  coreUiComponentKindMeta,
  coreUiComponentRegistry,
  coreUiComponentTierMeta,
  EmptyStateCard,
  PageContent,
  PanelCard,
  SearchInput,
  SelectField,
  ToolbarOptionGroup,
} from "@workspace/core/ui";
import { getCoreUiCompositionGraph } from "@workspace/core/ui/component-registry";
import type { CoreUiComponentRegistration, CoreUiComponentTier } from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import { ComponentPreview } from "./ComponentPreview";

const TIER_LABELS: Record<CoreUiComponentTier, string> = {
  foundation: coreUiComponentTierMeta.foundation.label,
  primitive: coreUiComponentTierMeta.primitive.label,
  assembly: coreUiComponentTierMeta.assembly.label,
  frame: coreUiComponentTierMeta.frame.label,
};
const TIERS: CoreUiComponentTier[] = ["foundation", "primitive", "assembly", "frame"];
const ALL_KIND = "all";

function PreviewBlock({
  name,
  isFoundation,
  children,
}: {
  name: string;
  isFoundation: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-slate-400">
        {isFoundation ? "Recipe 示意（非 React 组件）" : "实时预览"}
      </p>
      {isFoundation ? (
        <div
          data-ui-preview-canvas={name}
          className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2"
        >
          {children}
        </div>
      ) : (
        <div data-ui-preview-canvas={name} className="overflow-visible">
          {children}
        </div>
      )}
    </div>
  );
}

function RelationTags({
  label,
  names,
  color,
}: {
  label: string;
  names: readonly string[];
  color: "blue" | "amber" | "emerald";
}) {
  if (!names.length) return null;
  const colorClass = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  }[color];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-400">{label}：</span>
      {names.map((name) => (
        <code key={name} className={`rounded px-1.5 py-0.5 text-[11px] ${colorClass}`}>
          {name}
        </code>
      ))}
    </div>
  );
}

export default function UiComponentsShowcase() {
  const [tier, setTier] = useState<CoreUiComponentTier>("primitive");
  const [kind, setKind] = useState<string>(ALL_KIND);
  const [query, setQuery] = useState("");

  const graph = useMemo(() => getCoreUiCompositionGraph(), []);

  const kindOptions = useMemo(() => {
    const options = [{ value: ALL_KIND, label: "全部分类" }];
    for (const key of Object.keys(coreUiComponentKindMeta)) {
      const meta = coreUiComponentKindMeta[key as keyof typeof coreUiComponentKindMeta];
      options.push({ value: key, label: meta.label });
    }
    return options;
  }, []);

  const filteredItems = useMemo(() => {
    return coreUiComponentRegistry.filter((component) => {
      if (component.tier !== tier) return false;
      if (kind !== ALL_KIND && component.kind !== kind) return false;
      if (query.trim()) {
        const keyword = query.trim();
        return matchText(component.name, keyword)
          || matchText(component.description, keyword)
          || matchText(component.kind, keyword);
      }
      return true;
    });
  }, [tier, kind, query]);

  return (
    <PageContent className="max-w-6xl py-8">
      <CommandToolbar
        viewControls={(
          <ToolbarOptionGroup
            ariaLabel="注册项层级"
            value={tier}
            options={TIERS.map((value) => ({
              value,
              label: TIER_LABELS[value],
            }))}
            onChange={(value) => {
              setTier(value as CoreUiComponentTier);
              setKind(ALL_KIND);
            }}
          />
        )}
        filters={(
          <>
            <SelectField
              ariaLabel="注册项分类"
              options={kindOptions}
              value={kind}
              onChange={setKind}
              size="toolbar"
              className="w-32"
            />
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="搜索注册项..."
              size="toolbar"
              className="w-48"
            />
          </>
        )}
        meta={<>共 {filteredItems.length} 个注册项</>}
      />

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {filteredItems.map((component) => {
          const registration = component as CoreUiComponentRegistration;
          const kindMeta = coreUiComponentKindMeta[registration.kind];
          const composes = graph.composes.get(registration.name) ?? [];
          const foundations = graph.foundations.get(registration.name) ?? [];
          const usedBy = graph.usedBy.get(registration.name) ?? [];
          const isFoundation = registration.tier === "foundation";
          return (
            <PanelCard
              key={registration.name}
              title={(
                <span className="flex items-center gap-2">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-semibold text-slate-900">
                    {registration.name}
                  </code>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {kindMeta?.label ?? registration.kind}
                  </span>
                </span>
              )}
              bodyClassName="p-4"
            >
              <p className="text-sm text-slate-700">{registration.description}</p>
              {registration.example && (
                <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-medium text-slate-500">{isFoundation ? "Recipe 示例" : "示例"}</p>
                  <p className="mt-1 text-sm text-slate-600">{registration.example}</p>
                </div>
              )}
              <RelationTags label="组合" names={composes} color="blue" />
              <RelationTags label="基础" names={foundations} color="amber" />
              <RelationTags label="被使用" names={usedBy} color="emerald" />
              <PreviewBlock name={registration.name} isFoundation={isFoundation}>
                {isFoundation
                  ? <span className="text-xs text-slate-400">Foundation 为样式 recipe / token，不提供运行时组件预览。</span>
                  : <ComponentPreview name={registration.name} />}
              </PreviewBlock>
            </PanelCard>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <EmptyStateCard className="mt-5">没有找到匹配的注册项</EmptyStateCard>
      )}
    </PageContent>
  );
}
