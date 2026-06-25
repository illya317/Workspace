"use client";

import { useMemo } from "react";
import { matchText } from "@workspace/core/search";
import { Toolbar, type ToolbarItem } from "@workspace/core/ui";
import type { Department, Position, Selection } from "./types";
import { departmentPath } from "./utils";

type SearchResult =
  | { key: string; type: "department"; label: string; subtitle: string; selection: Selection }
  | { key: string; type: "position"; label: string; subtitle: string; selection: Selection };

export function DepartmentPositionToolbar({
  departments,
  departmentById,
  keyword,
  positions,
  onKeywordChange,
  onSelect,
}: {
  departments: Department[];
  departmentById: Map<number, Department>;
  keyword: string;
  positions: Position[];
  onKeywordChange: (value: string) => void;
  onSelect: (selection: Selection) => void;
}) {
  const results = useMemo(() => {
    const query = keyword.trim();
    if (!query) return [];
    const next: SearchResult[] = [];

    for (const department of departments) {
      const path = departmentPath(department, departmentById);
      const haystack = [department.code, department.name, department.alias, path].filter(Boolean).map(String);
      if (!haystack.some((item) => matchText(item, query))) continue;
      next.push({
        key: `department-${department.id}`,
        type: "department",
        label: department.name,
        subtitle: path || department.code,
        selection: { type: "department", id: department.id },
      });
    }

    for (const position of positions) {
      const department = position.departmentId ? departmentById.get(position.departmentId) : undefined;
      const path = departmentPath(department, departmentById);
      const haystack = [
        position.code,
        position.codeRaw,
        position.name,
        position.alias,
        position.positionDescriptionName,
        position.positionDescriptionCode,
        path,
      ].filter(Boolean).map(String);
      if (!haystack.some((item) => matchText(item, query))) continue;
      next.push({
        key: `position-${position.id}`,
        type: "position",
        label: position.name,
        subtitle: [path || position.departmentName, position.positionDescriptionName].filter(Boolean).join(" / ") || position.code,
        selection: { type: "position", id: position.id },
      });
    }

    return next.slice(0, 8);
  }, [departmentById, departments, keyword, positions]);

  function selectResult(result: SearchResult) {
    onSelect(result.selection);
    onKeywordChange("");
  }

  const items: ToolbarItem[] = [
    {
      kind: "search",
      key: "search",
      section: "filter",
      value: keyword,
      onChange: onKeywordChange,
      placeholder: "搜索部门/岗位",
      scope: ["部门", "岗位"],
      className: "w-full min-w-[18rem] sm:w-80",
    },
  ];

  if (keyword.trim()) {
    items.push({
      kind: "text",
      key: "meta",
      section: "meta",
      content: `${results.length} 个匹配`,
    });
  }

  return (
    <div className="relative">
      <Toolbar items={items} />

      {keyword.trim() && (
        <div className="absolute left-3 top-[calc(100%+6px)] z-30 w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          {results.length > 0 ? (
            <div className="max-h-80 overflow-auto py-1">
              {results.map((result) => (
                <button
                  key={result.key}
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none"
                  onClick={() => selectResult(result)}
                >
                  <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {result.type === "department" ? "部门" : "岗位"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{result.label}</span>
                    <span className="block truncate text-xs text-slate-500">{result.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-sm text-slate-500">没有匹配的部门或岗位</div>
          )}
        </div>
      )}
    </div>
  );
}
