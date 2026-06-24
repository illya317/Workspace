"use client";

import { useState } from "react";
import {
  coreUiComponentRegistry,
  coreUiComponentTierMeta,
  PageContent,
  PanelCard,
  ToolbarOptionGroup,
} from "@workspace/core/ui";
import type { CoreUiComponentTier } from "@workspace/core/ui";

const TIERS: CoreUiComponentTier[] = ["primitive", "assembly", "frame"];

export default function UiComponentsClient() {
  const [tier, setTier] = useState<CoreUiComponentTier>("primitive");
  const tierMeta = coreUiComponentTierMeta[tier];
  const items = coreUiComponentRegistry.filter((component) => component.tier === tier);

  return (
    <PageContent className="max-w-5xl py-10">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-slate-900">UI 组件库</h1>
        <p className="text-sm text-slate-500">按核心分层查看已注册的共享组件</p>
      </div>

      <PanelCard title="组件层级" bodyClassName="p-4">
        <ToolbarOptionGroup
          ariaLabel="组件层级"
          value={tier}
          options={TIERS.map((value) => ({
            value,
            label: coreUiComponentTierMeta[value].label,
          }))}
          onChange={(value) => setTier(value as CoreUiComponentTier)}
        />
        <p className="mt-3 text-sm text-slate-600">{tierMeta.description}</p>
      </PanelCard>

      <div className="mt-6 grid gap-4">
        {items.map((component) => (
          <PanelCard
            key={component.name}
            title={(
              <span className="flex items-center gap-2">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-semibold text-slate-900">
                  {component.name}
                </code>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  {component.kind}
                </span>
              </span>
            )}
            bodyClassName="p-4"
          >
            <p className="text-sm text-slate-700">{component.description}</p>
            {component.example && (
              <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-500">示例</p>
                <p className="mt-1 text-sm text-slate-600">{component.example}</p>
              </div>
            )}
            {"includes" in component && component.includes && component.includes.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">包含：</span>
                {component.includes.map((name) => (
                  <code key={name} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                    {name}
                  </code>
                ))}
              </div>
            )}
          </PanelCard>
        ))}
      </div>
    </PageContent>
  );
}
