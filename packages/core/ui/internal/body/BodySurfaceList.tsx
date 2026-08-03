"use client";

import type { ReactNode } from "react";
import type { BodySurfaceListItemSpec, BodySurfaceListSpec, BodySurfaceSectionSpec } from "../../BodySurface.types";
import { renderAntdCommands } from "../common/antd-command";
import { joinClassNames } from "../common/card-utils";
import { useSurfaceFrameDepth } from "../common/SurfaceFrameContextParts";
import { renderBodyEmpty, renderSectionBadges } from "./BodySurfaceBlocks";

function listItemClassName(item: BodySurfaceListItemSpec, presentation: BodySurfaceListSpec["presentation"] = "list", nestedInFrame = false) {
  const toneClass =
    item.tone === "success"
      ? "bg-emerald-50/60"
      : item.tone === "warning"
        ? "bg-amber-50/70"
        : item.tone === "danger"
          ? "bg-rose-50/70"
          : item.tone === "info"
            ? "bg-sky-50/60"
            : item.tone === "muted"
              ? "bg-slate-50"
              : "bg-white";
  return joinClassNames(
    presentation === "cards" ? "rounded-lg border px-3 py-3 shadow-sm" : nestedInFrame ? "py-3" : "px-4 py-3",
    "transition",
    item.onClick ? "cursor-pointer hover:bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-100" : "",
    presentation === "cards" && item.tone !== "success" ? toneClass.replace("bg-white", "bg-white hover:border-slate-300") : toneClass,
  );
}

export function BodySurfaceList({
  list,
  renderSections,
}: {
  list: BodySurfaceListSpec;
  renderSections: (sections: BodySurfaceSectionSpec[]) => ReactNode;
}) {
  const nestedInFrame = useSurfaceFrameDepth() > 0;
  if (list.items.length === 0) return renderBodyEmpty(list.empty ?? { content: "暂无数据", compact: true });
  const titleClassName = (item: BodySurfaceListItemSpec) => joinClassNames(
    "min-w-0 text-left text-sm",
    item.unread ? "font-semibold text-slate-950" : "font-medium text-slate-700",
    item.onClick ? "hover:text-emerald-700" : "",
  );
  return (
    <div className={list.presentation === "cards" ? "space-y-2" : nestedInFrame ? "" : "overflow-hidden rounded-md border border-slate-100 bg-white"} data-body-list-frame={list.presentation === "list" ? (nestedInFrame ? "nested" : "primary") : undefined}>
      <div className={list.presentation === "cards" ? "space-y-2" : "divide-y divide-slate-100"}>
        {list.items.map((item) => (
          <div
            key={item.key}
            className={listItemClassName(item, list.presentation, nestedInFrame)}
            role={item.onClick ? "button" : undefined}
            tabIndex={item.onClick ? 0 : undefined}
            onClick={item.onClick}
            onKeyDown={item.onClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); item.onClick?.(); } } : undefined}
            onMouseEnter={item.onMouseEnter}
          >
            <div className="flex items-start justify-between gap-3">
              {item.leading ? <div className="shrink-0">{item.leading}</div> : null}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  {item.unread ? <span aria-label="未读" className="size-1.5 shrink-0 rounded-full bg-sky-500" /> : null}
                  <div className={titleClassName(item)}>{item.title}</div>
                  {renderSectionBadges(item.badges)}
                </div>
                {item.description ? <div className="mt-1 text-xs leading-5 text-slate-600">{item.description}</div> : null}
                {item.meta ? <div className="mt-2 min-w-0 text-left text-[11px] text-slate-400">{item.meta}</div> : null}
                {item.sections?.length ? <div className="mt-3">{renderSections(item.sections)}</div> : null}
              </div>
              {item.trailing ? <div className="shrink-0">{item.trailing}</div> : null}
              {item.actions?.length ? (
                <div className="shrink-0" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  {renderAntdCommands(item.actions)}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {list.footerAction ? (
        <div className="border-t border-slate-100 px-4 py-3 text-center">
          {renderAntdCommands([{ ...list.footerAction, size: list.footerAction.size ?? "sm" }])}
        </div>
      ) : null}
    </div>
  );
}
