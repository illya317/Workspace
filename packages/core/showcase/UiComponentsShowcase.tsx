"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActionGlyph,
  coreUiComponentKindMeta,
  coreUiComponentRegistry,
  coreUiComponentTierMeta,
  EmptyStateCard,
  PageContent,
  PanelCard,
  Toolbar,
  type ToolbarItem,
} from "@workspace/core/ui";
import { getCoreUiCompositionGraph } from "@workspace/core/ui/component-registry";
import type { CoreUiComponentRegistration, CoreUiComponentTier } from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import { ComponentPreview } from "./ComponentPreview";
import { previewCaseByName } from "./previews";

const TIER_LABELS: Record<CoreUiComponentTier, string> = {
  foundation: coreUiComponentTierMeta.foundation.label,
  primitive: coreUiComponentTierMeta.primitive.label,
  assembly: coreUiComponentTierMeta.assembly.label,
  shell: coreUiComponentTierMeta.shell.label,
  frame: coreUiComponentTierMeta.frame.label,
};
const TIERS: CoreUiComponentTier[] = ["foundation", "primitive", "assembly", "shell", "frame"];
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
  clickable,
  onSelect,
}: {
  label: string;
  names: readonly string[];
  color: "blue" | "amber" | "emerald" | "violet";
  clickable?: (name: string) => boolean;
  onSelect?: (name: string) => void;
}) {
  if (!names.length) return null;
  const colorClass = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
  }[color];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="py-0.5 text-[11px] text-slate-400">{label}：</span>
      {names.map((name) => {
        const isClickable = !!onSelect && clickable?.(name);
        if (isClickable) {
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelect(name)}
              className={`rounded px-1.5 py-0.5 text-[11px] ${colorClass} hover:opacity-80`}
              title={`查看 ${name}`}
            >
              {name}
            </button>
          );
        }
        return (
          <code key={name} className={`rounded px-1.5 py-0.5 text-[11px] ${colorClass}`}>
            {name}
          </code>
        );
      })}
    </div>
  );
}

export default function UiComponentsShowcase() {
  const [tier, setTier] = useState<CoreUiComponentTier>("primitive");
  const [kind, setKind] = useState<string>(ALL_KIND);
  const [query, setQuery] = useState("");
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [verifiedNames, setVerifiedNames] = useState<Set<string>>(new Set());

  function toggleVerified(name: string) {
    setVerifiedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const graph = useMemo(() => getCoreUiCompositionGraph(), []);
  const registryByName = useMemo(() => {
    const map = new Map<string, CoreUiComponentRegistration>();
    for (const component of coreUiComponentRegistry) {
      map.set(component.name, component as CoreUiComponentRegistration);
    }
    return map;
  }, []);

  function selectComponent(name: string) {
    const registration = registryByName.get(name);
    if (!registration) return;
    setTier(registration.tier);
    setKind(ALL_KIND);
    setQuery("");
    setScrollTarget(name);
  }

  useEffect(() => {
    if (!scrollTarget) return;
    const element = document.getElementById(scrollTarget);
    if (element) {
      element.scrollIntoView({ block: "start" });
    }
    setScrollTarget(null);
  }, [scrollTarget]);

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

  const toolbarItems: ToolbarItem[] = useMemo(
    () => [
      // view: 层级切换（option-group）
      {
        kind: "option-group",
        key: "tier",
        section: "view",
        value: tier,
        options: TIERS.map((value) => ({ value, label: TIER_LABELS[value] })),
        onChange: (value) => {
          setTier(value as CoreUiComponentTier);
          setKind(ALL_KIND);
        },
        ariaLabel: "注册项层级",
      },
      // filter: 分类下拉（select）
      {
        kind: "select",
        key: "kind",
        section: "filter",
        value: kind,
        options: kindOptions,
        onChange: setKind,
        placeholder: "全部分类",
        triggerClassName: "!w-32",
      },
      // filter: 关键词搜索（search）
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
      // meta: 结果计数（text）
      {
        kind: "text",
        key: "count",
        section: "meta",
        content: <>共 {filteredItems.length} 个注册项</>,
      },
    ],
    [tier, kind, query, filteredItems.length, kindOptions],
  );

  return (
    <PageContent className="max-w-6xl py-8">
      <Toolbar items={toolbarItems} className="mb-5" />

      <div className="mt-5 columns-1 gap-4 md:columns-2">
        {filteredItems.map((component) => {
          const registration = component as CoreUiComponentRegistration;
          const kindMeta = coreUiComponentKindMeta[registration.kind];
          const composes = graph.composes.get(registration.name) ?? [];
          const foundations = graph.foundations.get(registration.name) ?? [];
          const usedBy = graph.usedBy.get(registration.name) ?? [];
          const rawCases = previewCaseByName[registration.name] ?? [];
          const configured = new Set([registration.name, ...composes, ...foundations]);
          const cases = rawCases.filter((name) => !configured.has(name));
          const isFoundation = registration.tier === "foundation";
          const verified = verifiedNames.has(registration.name);
          return (
            <div
              key={registration.name}
              id={registration.name}
              className="mb-4 break-inside-avoid scroll-mt-24"
            >
              <PanelCard
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
                actions={(
                  <button
                    type="button"
                    onClick={() => toggleVerified(registration.name)}
                    className={`transition ${verified ? "text-emerald-600" : "text-slate-300 hover:text-slate-400"}`}
                    title={verified ? "已验证" : "未验证"}
                    aria-label={`${registration.name} ${verified ? "已验证" : "未验证"}`}
                  >
                    <ActionGlyph kind="verified" className="h-5 w-5" />
                  </button>
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
                <RelationTags label="组合" names={composes} color="blue" clickable={(name) => registryByName.has(name)} onSelect={selectComponent} />
                <RelationTags label="基础" names={foundations} color="amber" clickable={(name) => registryByName.has(name)} onSelect={selectComponent} />
                <RelationTags label="被使用" names={usedBy} color="emerald" clickable={(name) => registryByName.has(name)} onSelect={selectComponent} />
                <RelationTags label="组合案例" names={cases} color="violet" clickable={(name) => registryByName.has(name)} onSelect={selectComponent} />
                <PreviewBlock name={registration.name} isFoundation={isFoundation}>
                  {isFoundation
                    ? <span className="text-xs text-slate-400">Foundation 为样式 recipe / token，不提供运行时组件预览。</span>
                    : <ComponentPreview name={registration.name} />}
                </PreviewBlock>
              </PanelCard>
            </div>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <EmptyStateCard className="mt-5">没有找到匹配的注册项</EmptyStateCard>
      )}
    </PageContent>
  );
}
