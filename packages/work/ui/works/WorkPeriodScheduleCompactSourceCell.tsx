"use client";

import { ActionGlyph } from "@workspace/core/ui";
import type { WorkItem, WorkItemType } from "./types";

export function WorkPeriodScheduleCompactSourceCell({
  source,
  label,
  itemType,
  depth,
  childCount,
  collapsed,
  onToggle,
}: {
  source: WorkItem;
  label: string;
  itemType: Extract<WorkItemType, "objective" | "key_result">;
  depth: number;
  childCount: number;
  collapsed: boolean;
  onToggle?: (work: WorkItem) => void;
}) {
  const canToggle = Boolean(source && childCount > 0 && onToggle);
  const badgeLabel = itemType === "objective" ? "目标" : "KR";
  const badgeClass = itemType === "objective"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-sky-50 text-sky-700";
  return (
    <div data-work-schedule-source-line className={`min-w-0 whitespace-normal break-words text-sm font-medium leading-5 text-slate-900 ${depth > 0 ? "pl-4" : ""}`}>
      {canToggle ? (
        <button
          type="button"
          className="mr-1.5 inline-grid h-5 w-5 place-items-center align-top text-slate-500 transition hover:text-slate-800"
          aria-label={collapsed ? "展开" : "收起"}
          title={collapsed ? "展开" : "收起"}
          onClick={() => onToggle?.(source as WorkItem)}
        >
          <ActionGlyph kind={collapsed ? "tree-expand" : "tree-collapse"} className="h-4 w-4" />
        </button>
      ) : null}
      <span className={`mr-1.5 inline-block rounded px-1.5 align-top text-xs font-medium leading-5 ${badgeClass}`}>{badgeLabel}</span>
      <span>{source.content || label}</span>
    </div>
  );
}
