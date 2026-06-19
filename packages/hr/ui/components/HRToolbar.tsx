"use client";

import { EditToolbar, FilterBar } from "@workspace/core/ui";
import type { EditToolbarProps } from "@workspace/core/ui";

interface Props {
  rosterFilter?: "在职" | "离职";
  onRosterChange?: (value: "在职" | "离职") => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  keywordPlaceholder?: string;
  onKeywordEnter?: () => void;
  onReset: () => void;
  children?: React.ReactNode;
  showEdit?: boolean;
  editProps?: EditToolbarProps;
}

export default function HRToolbar({
  rosterFilter,
  onRosterChange,
  keyword,
  onKeywordChange,
  keywordPlaceholder = "搜索...",
  onKeywordEnter,
  onReset,
  children,
  showEdit,
  editProps,
}: Props) {
  return (
    <FilterBar>
      {rosterFilter && onRosterChange && (
        <div className="flex overflow-hidden rounded-md border border-gray-200">
          <button
            onClick={() => onRosterChange("在职")}
            className={`px-3 py-1.5 text-sm ${
              rosterFilter === "在职"
                ? "bg-emerald-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            在职
          </button>
          <button
            onClick={() => onRosterChange("离职")}
            className={`px-3 py-1.5 text-sm ${
              rosterFilter === "离职"
                ? "bg-emerald-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            离职
          </button>
        </div>
      )}
      <input
        type="text"
        value={keyword}
        onChange={(event) => onKeywordChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onKeywordEnter) onKeywordEnter();
        }}
        placeholder={keywordPlaceholder}
        className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
      />
      <button
        onClick={onReset}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
      >
        重置
      </button>
      {children}
      {showEdit && editProps && <EditToolbar {...editProps} />}
    </FilterBar>
  );
}
