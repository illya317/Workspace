"use client";

import { joinClassNames } from "./card-utils";

export interface DisclosureSectionHeaderProps {
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}

export default function DisclosureSectionHeader({
  title,
  count,
  expanded,
  onToggle,
  className = "",
}: DisclosureSectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={joinClassNames("mb-3 flex items-center gap-2 text-base font-semibold text-gray-800", className)}
    >
      <span className={joinClassNames("text-xs transition-transform", expanded && "rotate-90")}>▶</span>
      <span>{title}</span>
      {typeof count === "number" && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{count}</span>
      )}
    </button>
  );
}
