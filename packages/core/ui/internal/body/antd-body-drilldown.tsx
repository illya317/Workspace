"use client";

import { useState, type ReactNode } from "react";
import type { BodySurfaceSectionSpec } from "../../BodySurface.types";
import { ActionGlyph } from "../action/ActionGlyphs";
import { textOverflowTitle } from "../common/text-overflow";
import { AntdSectionBadges } from "./antd-body-badges";
import { sectionNavigationTitle } from "./body-surface-drilldown";

/**
 * antd 原生移动端 drilldown(栏目目录 → 章节详情 → 返回)。
 * 与 legacy MobileSectionDrilldown 保持同一契约:目录顺序与编号、
 * 激活章节状态、返回章节目录/上一章节/下一章节导航语义、位置指示;
 * 目录行额外保留章节 header 徽章(antd Tag),不静默丢失徽章契约。
 * 章节详情由 renderSection 注入(antd-body 的 AntdBodySection),避免循环依赖。
 */
export function AntdMobileSectionDrilldown({
  sections,
  renderSection,
}: {
  sections: BodySurfaceSectionSpec[];
  renderSection: (section: BodySurfaceSectionSpec) => ReactNode;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeIndex = activeKey === null ? -1 : sections.findIndex((section) => section.key === activeKey);
  const activeSection = activeIndex >= 0 ? sections[activeIndex] : null;

  if (!activeSection) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:hidden" data-mobile-section-view="directory">
        {sections.map((section, index) => {
          const title = sectionNavigationTitle(section);
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setActiveKey(section.key)}
              className="flex min-h-14 w-full items-center gap-3 border-t border-slate-100 px-4 text-left transition first:border-t-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-200"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={textOverflowTitle(title)}>{title}</span>
              <AntdSectionBadges badges={section.header?.badges} />
              <span aria-hidden="true" className="shrink-0 text-xl leading-none text-slate-300">›</span>
            </button>
          );
        })}
      </div>
    );
  }

  const previous = sections[activeIndex - 1];
  const next = sections[activeIndex + 1];
  const activeTitle = sectionNavigationTitle(activeSection);
  return (
    <div className="sm:hidden" data-mobile-section-view="detail">
      <div className="mb-3 flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 shadow-sm">
        <button
          type="button"
          aria-label="返回章节目录"
          title="返回章节目录"
          onClick={() => setActiveKey(null)}
          className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          <ActionGlyph kind="back" className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={textOverflowTitle(activeTitle)}>{activeTitle}</span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-400">{activeIndex + 1} / {sections.length}</span>
        <button
          type="button"
          aria-label="上一章节"
          title="上一章节"
          disabled={!previous}
          onClick={() => previous && setActiveKey(previous.key)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          <ActionGlyph kind="back" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="下一章节"
          title="下一章节"
          disabled={!next}
          onClick={() => next && setActiveKey(next.key)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          <span className="rotate-180"><ActionGlyph kind="back" className="size-4" /></span>
        </button>
      </div>
      {renderSection(activeSection)}
    </div>
  );
}
