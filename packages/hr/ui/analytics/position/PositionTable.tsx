"use client";

import { createPageBody, createAnalysisBlock, PageSurface, type DataSurfaceColumnSpec, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import type { EnrichedPosition, SortKey } from "./usePositionData";

interface PositionTableBlockParams {
  filtered: EnrichedPosition[];
  search: string;
  setSearch: (v: string) => void;
  sortKey: SortKey;
  sortDesc: boolean;
  handleSort: (key: SortKey) => void;
  sortIcon: (key: SortKey) => string;
}

export function createPositionTableBlock({
  filtered,
  search,
  setSearch,
  sortKey: _sortKey,
  sortDesc: _sortDesc,
  handleSort,
  sortIcon,
}: PositionTableBlockParams): PageSurfaceBlockSpec {
  const columns: DataSurfaceColumnSpec<EnrichedPosition>[] = [
    { key: "code", label: `编码 ${sortIcon("code")}`, required: true, onHeaderClick: () => handleSort("code"), cellClassName: "font-mono text-slate-500", cell: (position) => position.code },
    { key: "name", label: `岗位名 ${sortIcon("name")}`, required: true, onHeaderClick: () => handleSort("name"), cellClassName: "font-medium", cell: (position) => position.name },
    { key: "dept", label: `部门 ${sortIcon("dept")}`, required: true, onHeaderClick: () => handleSort("dept"), cellClassName: "text-slate-500", cell: (position) => position.departmentName || "—" },
    { key: "headcount", label: `编制 ${sortIcon("headcount")}`, required: true, onHeaderClick: () => handleSort("headcount"), headerClassName: "text-right", cellClassName: "text-right text-slate-500", cell: (position) => position.headcount || "—" },
    { key: "actual", label: `实际 ${sortIcon("actual")}`, required: true, onHeaderClick: () => handleSort("actual"), headerClassName: "text-right", cellClassName: "text-right font-medium", cell: (position) => position.actual || "—" },
    {
      key: "diff",
      label: `差异 ${sortIcon("diff")}`,
      required: true,
      onHeaderClick: () => handleSort("diff"),
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (position) => position.headcount > 0 ? (
        <span className={`font-medium ${position.diff > 0 ? "text-rose-600" : position.diff < 0 ? "text-amber-600" : "text-emerald-600"}`}>
          {position.diff > 0 ? `+${position.diff}` : position.diff}
        </span>
      ) : <span className="text-gray-400">—</span>,
    },
    {
      key: "status",
      label: "状态",
      required: true,
      cell: (position) => ({
        kind: "badge",
        label: position.status,
        tone: position.status === "超编"
          ? "red"
          : position.status === "缺编"
            ? "slate"
            : position.status === "满编"
              ? "emerald"
              : position.status === "有任职"
                ? "sky"
                : "amber",
      }),
    },
  ];
  return createAnalysisBlock("positions", {
        title: "岗位明细",
        toolbar: {
          items: [
            { kind: "search", key: "search", value: search, onChange: setSearch, placeholder: "搜索岗位名、编码、部门..." },
            { kind: "text", key: "meta", content: <>共 {filtered.length} 个岗位</> },
          ],
        },
        blocks: [{
          kind: "data",
          key: "positions-table",
          surface: {
            kind: "table",
            rows: filtered,
            columns,
            visibleColumns: columns.map((column) => column.key),
            rowKey: (position) => position.id,
            emptyText: "暂无匹配数据",
            rowClassName: (position) =>
              position.status === "空岗" ? "bg-amber-50/30" :
              position.status === "超编" ? "bg-rose-50/30" :
              position.status === "缺编" ? "bg-purple-50/20" : "",
          },
        }],
      });
}

export default function PositionTable(props: PositionTableBlockParams) {
  return <PageSurface kind="analysis" body={createPageBody([createPositionTableBlock(props)])} />;
}
