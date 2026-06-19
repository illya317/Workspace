"use client";

import { EditToolbar, FilterBar, SearchInput, getToolbarActionClassName } from "@workspace/core/ui";
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
  const rosterButtonClassName = (active: boolean) =>
    active ? getToolbarActionClassName("primary") : getToolbarActionClassName("secondary");

  return (
    <FilterBar>
      {rosterFilter && onRosterChange && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onRosterChange("在职")}
            className={rosterButtonClassName(rosterFilter === "在职")}
          >
            在职
          </button>
          <button
            onClick={() => onRosterChange("离职")}
            className={rosterButtonClassName(rosterFilter === "离职")}
          >
            离职
          </button>
        </div>
      )}
      <SearchInput
        value={keyword}
        onChange={onKeywordChange}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onKeywordEnter) onKeywordEnter();
        }}
        placeholder={keywordPlaceholder}
        size="toolbar"
        className="min-w-0 sm:w-[22rem]"
      />
      <button
        onClick={onReset}
        className={getToolbarActionClassName("secondary")}
      >
        重置
      </button>
      {children}
      {showEdit && editProps && <EditToolbar {...editProps} />}
    </FilterBar>
  );
}
