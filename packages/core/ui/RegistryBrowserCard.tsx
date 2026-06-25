"use client";

import { useEffect, useMemo, useState } from "react";
import ToolbarOptionGroup from "./ToolbarOptionGroup";
import { ComponentPreview } from "./registry-browser/previews/ComponentPreview";
import { RegistryPill } from "./registry-browser/RegistryPill";
import { UsageFiles } from "./registry-browser/UsageFiles";
import { groupItems } from "./registry-browser/group-items";
import { getRegistryBrowserLayer, registryBrowserLayers } from "./registry-browser/template";
import type { RegistryBrowserCardProps, RegistryBrowserItem, RegistryBrowserLayerKey } from "./registry-browser/types";

export type {
  RegistryBrowserCardProps,
  RegistryBrowserGroup,
  RegistryBrowserItem,
} from "./registry-browser/types";

export default function RegistryBrowserCard({
  title,
  subtitle,
  items,
  emptyText = "暂无注册项",
}: RegistryBrowserCardProps) {
  const [activeLayer, setActiveLayer] = useState<RegistryBrowserLayerKey>("primitive");
  const layerItems = useMemo(
    () => items.filter((item) => getRegistryBrowserLayer(item) === activeLayer),
    [activeLayer, items],
  );
  const groups = useMemo(() => groupItems(layerItems), [layerItems]);
  const [activeKind, setActiveKind] = useState(() => groups[0]?.kind ?? "");
  const activeGroup = groups.find((group) => group.kind === activeKind) ?? groups[0];
  const layerMeta = registryBrowserLayers.find((layer) => layer.key === activeLayer);

  useEffect(() => {
    setActiveKind(groups[0]?.kind ?? "");
  }, [activeLayer, groups]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <div className="text-sm text-slate-400">
            {layerItems.length} 个注册组件 / {groups.length} 个分类
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ToolbarOptionGroup
            ariaLabel="组件层级"
            value={activeLayer}
            options={registryBrowserLayers.map((layer) => ({
              value: layer.key,
              label: layer.label,
            }))}
            onChange={(value) => setActiveLayer(value as RegistryBrowserLayerKey)}
          />
        </div>
        {layerMeta && <p className="mt-3 text-sm leading-6 text-slate-500">{layerMeta.description}</p>}
      </div>

      {activeGroup ? (
        <div className="grid gap-0 lg:grid-cols-[3fr_7fr]">
          <div className="border-b border-slate-200 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              {groups.map((group) => {
                const active = group.kind === activeGroup.kind;
                return (
                  <button
                    key={group.kind}
                    type="button"
                    onClick={() => setActiveKind(group.kind)}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                      active
                        ? "border-emerald-200 bg-white shadow-sm"
                        : "border-transparent hover:border-slate-200 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-900">{group.label}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {group.items.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{group.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900">{activeGroup.label}</h3>
              <p className="mt-1 text-sm text-slate-500">{activeGroup.description}</p>
            </div>

            <div className="space-y-4">
              {activeGroup.items.map((item) => (
                <RegistryItemCard key={item.name} item={item} showPreview={activeLayer === "primitive"} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="p-8 text-center text-sm text-slate-400">{emptyText}</p>
      )}
    </section>
  );
}

function RegistryItemCard({
  item,
  showPreview,
}: {
  item: RegistryBrowserItem;
  showPreview: boolean;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h4 className="font-mono text-sm font-semibold text-slate-950">{item.name}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <span className="font-medium text-slate-800">使用案例：</span>
            {item.example}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          {item.kindLabel}
        </span>
      </div>

      <div className={showPreview ? "mt-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : "mt-4"}>
        {showPreview && <ComponentPreview item={item} />}
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">包括的子组件</div>
            <div className="flex flex-wrap gap-1.5">
              {item.includedComponents.length > 0 ? (
                item.includedComponents.map((component) => (
                  <RegistryPill key={component}>{component}</RegistryPill>
                ))
              ) : (
                <RegistryPill muted>primitive</RegistryPill>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">使用的文件</div>
            <UsageFiles files={item.usageFiles} />
          </div>
        </div>
      </div>
    </article>
  );
}
