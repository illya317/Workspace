"use client";

import FilterBar from "./FilterBar";
import EditToolbar from "./EditToolbar";
import type { EditToolbarProps } from "./EditToolbar";

interface Props {
  /** 在职/离职筛选（可选） */
  rosterFilter?: "在职" | "离职";
  onRosterChange?: (v: "在职" | "离职") => void;
  /** 关键词搜索 */
  keyword: string;
  onKeywordChange: (v: string) => void;
  keywordPlaceholder?: string;
  onKeywordEnter?: () => void;
  /** 重置 */
  onReset: () => void;
  /** 额外元素（如部门筛选、Excel下载） */
  children?: React.ReactNode;
  /** 编辑工具栏 */
  showEdit?: boolean;
  editProps?: EditToolbarProps;
}

export default function HRToolbar({
  rosterFilter, onRosterChange,
  keyword, onKeywordChange, keywordPlaceholder = "姓名筛选", onKeywordEnter,
  onReset, children, showEdit, editProps,
}: Props) {
  return (
    <FilterBar>
      {rosterFilter && onRosterChange && (
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          <button
            onClick={() => onRosterChange("在职")}
            className={`px-3 py-1.5 text-sm ${rosterFilter === "在职" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >在职</button>
          <button
            onClick={() => onRosterChange("离职")}
            className={`px-3 py-1.5 text-sm ${rosterFilter === "离职" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >离职</button>
        </div>
      )}
      <input
        type="text" value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onKeywordEnter) onKeywordEnter(); }}
        placeholder={keywordPlaceholder}
        className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
      />
      <button onClick={onReset}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
      >重置</button>
      {children}
      {showEdit && editProps && <EditToolbar {...editProps} />}
    </FilterBar>
  );
}
