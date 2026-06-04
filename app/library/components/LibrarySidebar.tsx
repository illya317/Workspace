"use client";

import { useMemo } from "react";
import type { LibraryDocumentItem } from "../types";

interface Props {
  documents: LibraryDocumentItem[];
  selectedCategory: string | null;
  onSelectCategory: (code: string | null) => void;
}

export default function LibrarySidebar({ documents, selectedCategory, onSelectCategory }: Props) {
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const d of documents) {
      if (!d.categoryCode) continue;
      const existing = map.get(d.categoryCode);
      if (existing) {
        existing.count++;
      } else {
        map.set(d.categoryCode, { name: d.categoryName || d.categoryCode, count: 1 });
      }
    }
    return Array.from(map.entries())
      .map(([code, { name, count }]) => ({ code, name, count }))
      .sort((a, b) => a.code.localeCompare(b.code, "zh"));
  }, [documents]);

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
