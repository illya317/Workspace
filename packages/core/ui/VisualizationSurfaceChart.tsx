"use client";

import { useState, type ReactNode } from "react";
import { EmptyStateCard } from "./Card";
import { joinClassNames } from "./card-utils";
import type {
  VisualizationBarChartSpec,
  VisualizationComparisonBarsSpec,
  VisualizationGroupedBarChartSpec,
  VisualizationLegendSpec,
  VisualizationSpec,
  VisualizationTone,
  VisualizationTreeNodeSpec,
  VisualizationTreeSpec,
} from "./surface/VisualizationSurfaceTypes";

function visualToneClass(tone: VisualizationTone = "slate", slot: "bar" | "text" | "soft" | "border" = "bar") {
  const classes = {
    blue: { bar: "bg-blue-400", text: "text-blue-600", soft: "bg-blue-50 text-blue-700", border: "border-blue-200" },
    emerald: { bar: "bg-emerald-400", text: "text-emerald-600", soft: "bg-emerald-50 text-emerald-700", border: "border-emerald-200" },
    amber: { bar: "bg-amber-400", text: "text-amber-600", soft: "bg-amber-50 text-amber-700", border: "border-amber-200" },
    rose: { bar: "bg-rose-400", text: "text-rose-600", soft: "bg-rose-50 text-rose-700", border: "border-rose-200" },
    slate: { bar: "bg-slate-300", text: "text-slate-600", soft: "bg-slate-100 text-slate-600", border: "border-slate-200" },
  };
  return classes[tone][slot];
}

function renderVisualLegend(legend?: VisualizationLegendSpec[]) {
  if (!Array.isArray(legend) || legend.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
      {legend.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1">
          <span className={joinClassNames("inline-block size-3 rounded", item.marker === "reference" ? "border-r-2 border-dashed border-slate-400 bg-slate-200" : visualToneClass(item.tone, "bar"))} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function renderBarChart(visual: VisualizationBarChartSpec) {
  if (visual.bars.length === 0) return <EmptyStateCard compact>{visual.emptyText ?? "暂无数据"}</EmptyStateCard>;
  const max = visual.max ?? Math.max(...visual.bars.map((bar) => bar.value), 1);
  const min = visual.min;
  const range = min === undefined ? Math.max(max, 1) : Math.max(max - min, 1);
  return (
    <div>
      {visual.title ? <h4 className="mb-2 text-xs text-slate-500">{visual.title}</h4> : null}
      <div className="flex items-stretch gap-1" style={{ height: visual.height ?? 128 }}>
        {visual.bars.map((bar) => {
          const percent = min === undefined
            ? Math.round((bar.value / range) * 100)
            : Math.round(((bar.value - min) / range) * 70 + 30);
          const height = Math.min(100, Math.max(percent, bar.value > 0 ? bar.minPercent ?? 4 : bar.minPercent ?? 1));
          return (
            <div key={bar.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium text-slate-500">{bar.valueLabel ?? (bar.value || "")}</span>
              <div className="flex min-h-0 w-full flex-1 items-end">
                <div className={joinClassNames("w-full rounded-t", visualToneClass(bar.tone ?? "emerald", "bar"))} style={{ height: `${height}%` }} title={bar.title ?? `${bar.label} ${bar.value}`} />
              </div>
              <span className="max-w-full truncate whitespace-nowrap text-[9px] text-slate-400" title={bar.label}>{bar.label}</span>
            </div>
          );
        })}
      </div>
      {renderVisualLegend(visual.legend)}
    </div>
  );
}

function renderGroupedBarChart(visual: VisualizationGroupedBarChartSpec) {
  if (visual.groups.length === 0) return <EmptyStateCard compact>{visual.emptyText ?? "暂无数据"}</EmptyStateCard>;
  const max = visual.max ?? Math.max(...visual.groups.flatMap((group) => group.bars.map((bar) => bar.value)), 1);
  return (
    <div>
      {visual.title ? <h4 className="mb-2 text-xs text-slate-500">{visual.title}</h4> : null}
      <div className="flex items-stretch gap-1" style={{ height: visual.height ?? 128 }}>
        {visual.groups.map((group) => (
          <div key={group.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex min-h-0 flex-1 items-end gap-0.5">
              {group.bars.map((bar) => {
                const percent = Math.round((bar.value / Math.max(max, 1)) * 100);
                const height = Math.min(100, Math.max(percent, bar.value > 0 ? bar.minPercent ?? 4 : bar.minPercent ?? 1));
                return (
                  <div
                    key={bar.key}
                    className={joinClassNames("w-2.5 rounded-t", visualToneClass(bar.tone ?? "blue", "bar"))}
                    style={{ height: `${height}%` }}
                    title={bar.title ?? `${bar.label} ${bar.value}`}
                  />
                );
              })}
            </div>
            <span className="max-w-full truncate whitespace-nowrap text-[9px] text-slate-400" title={group.label}>{group.label}</span>
          </div>
        ))}
      </div>
      {renderVisualLegend(visual.legend)}
    </div>
  );
}

function renderComparisonBars(visual: VisualizationComparisonBarsSpec) {
  const hasItems = visual.sections.some((section) => section.items.length > 0);
  if (!hasItems) return <EmptyStateCard compact>{visual.emptyText ?? "暂无数据"}</EmptyStateCard>;
  const max = visual.max ?? Math.max(...visual.sections.flatMap((section) => section.items.flatMap((item) => [item.actual, item.reference ?? 0])), 1);
  return (
    <div>
      {visual.sections.map((section) => section.items.length > 0 ? (
        <div key={section.key} className="mb-5 last:mb-0">
          <h4 className={joinClassNames("mb-2 text-sm font-semibold", visualToneClass(section.tone, "text"))}>
            {section.title}
            {section.subtitle ? <span className="ml-2 text-xs font-normal text-slate-400">{section.subtitle}</span> : null}
          </h4>
          <div className="space-y-2">
            {section.items.map((item) => {
              const actualWidth = Math.min(100, Math.round((item.actual / Math.max(max, 1)) * 100));
              const referenceWidth = Math.min(100, Math.round(((item.reference ?? 0) / Math.max(max, 1)) * 100));
              return (
                <div key={item.key} className="flex items-center gap-4 py-0.5">
                  <span className="w-36 shrink-0 truncate text-sm text-slate-700" title={item.label}>{item.label}</span>
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="relative h-6 flex-1 overflow-hidden rounded bg-slate-100">
                      {item.reference !== undefined && item.reference > 0 ? (
                        <div className="absolute inset-y-0 left-0 rounded-l border-r-2 border-dashed border-slate-300 bg-slate-200" style={{ width: `${referenceWidth}%` }} />
                      ) : null}
                      <div className={joinClassNames("absolute inset-y-0 left-0 rounded opacity-90", visualToneClass(item.tone ?? "emerald", "bar"))} style={{ width: `${actualWidth}%` }} />
                    </div>
                    <span className="w-16 text-right text-sm text-slate-500">{item.valueLabel ?? item.actual}</span>
                    <span className={joinClassNames("w-12 text-right text-xs font-medium", visualToneClass(item.diffTone ?? item.tone ?? "slate", "text"))}>{item.diffLabel ?? ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null)}
      {renderVisualLegend(visual.legend)}
    </div>
  );
}

function VisualTree({ visual }: { visual: VisualizationTreeSpec }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  if (visual.nodes.length === 0) return <EmptyStateCard compact>{visual.emptyText ?? "暂无数据"}</EmptyStateCard>;

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderNode(node: VisualizationTreeNodeSpec, depth: number): ReactNode {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const collapsedNode = collapsed.has(node.key);
    const level = node.level ?? depth;
    const tone = level === 0 ? "blue" : level === 1 ? "emerald" : "amber";
    return (
      <div key={node.key} className={depth > 0 ? "ml-6 border-l-2 border-slate-200 pl-4" : ""}>
        <button
          type="button"
          className={joinClassNames("my-2 flex w-full items-center gap-3 rounded-lg border p-3 text-left", visualToneClass(tone, "soft"), visualToneClass(tone, "border"), hasChildren ? "cursor-pointer" : "cursor-default")}
          onClick={() => hasChildren ? toggle(node.key) : undefined}
        >
          <span className="w-4 select-none text-center text-xs text-slate-500">{hasChildren ? (collapsedNode ? "▸" : "▾") : ""}</span>
          <span className={joinClassNames("rounded px-1.5 py-0.5 text-xs font-bold", visualToneClass(tone, "soft"))}>L{level + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.label}</span>
          <span className="flex shrink-0 flex-wrap justify-end gap-2">
            {node.badges?.map((badge) => (
              <span key={badge.key} className={joinClassNames("rounded px-2 py-0.5 text-xs font-medium", badge.tone ? visualToneClass(badge.tone, "soft") : "bg-white/60")}>{badge.label}</span>
            ))}
          </span>
          {node.subtitle ? <span className="shrink-0 text-xs opacity-60">{node.subtitle}</span> : null}
        </button>
        {!collapsedNode && children.length > 0 ? <div>{children.map((child) => renderNode(child, depth + 1))}</div> : null}
      </div>
    );
  }

  return (
    <div className="overflow-y-auto pr-2" style={{ maxHeight: visual.maxHeight ?? 600 }}>
      {visual.nodes.map((node) => renderNode(node, 0))}
    </div>
  );
}

export function renderVisual(visual: VisualizationSpec) {
  if (visual.kind === "barChart") return renderBarChart(visual);
  if (visual.kind === "groupedBarChart") return renderGroupedBarChart(visual);
  if (visual.kind === "comparisonBars") return renderComparisonBars(visual);
  return <VisualTree visual={visual} />;
}
