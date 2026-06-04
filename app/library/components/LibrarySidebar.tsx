"use client";

import type { CategoryGroup } from "../types";

interface Props {
  categories: CategoryGroup[];
  selectedCategory: string | null;
  onSelectCategory: (code: string | null) => void;
  loading?: boolean;
}

export default function LibrarySidebar({
  categories,
  selectedCategory,
  onSelectCategory,
  loading,
}: Props) {
  return (
    <div className="h-full overflow-y-auto py-2">
      <button
        onClick={() => onSelectCategory(null)}
        className={`w-full text-left rounded px-3 py-2 text-sm transition hover:bg-gray-100 ${
          selectedCategory === null ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
        }`}
      >
        全部
      </button>
      {loading && (
        <div className="px-3 py-4 text-xs text-gray-400">加载中…</div>
      )}
      {categories.map((c) => (
        <button
          key={c.code}
          onClick={() => onSelectCategory(c.code)}
          className={`w-full text-left flex items-center justify-between rounded px-3 py-2 text-sm transition hover:bg-gray-100 ${
            selectedCategory === c.code ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
          }`}
        >
          <span className="truncate">{c.name}</span>
          <span className="shrink-0 text-xs text-gray-400 ml-2">{c.count}</span>
        </button>
      ))}
    </div>
  );
}
