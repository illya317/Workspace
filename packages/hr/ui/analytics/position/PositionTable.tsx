"use client";

import { createPageBody, createAnalysisSection, PageSurface, type DataSurfaceColumnSpec, type PageSurfaceSectionSpec } from "@workspace/core/ui";
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

export function createPositionTableSection({
  filtered,
  search,
  setSearch,
  sortKey: _sortKey,
  sortDesc: _sortDesc,
  handleSort,
  sortIcon,
}: PositionTableBlockParams): PageSurfaceSectionSpec {
  const columns: DataSurfaceColumnSpec<EnrichedPosition>[] = [
    { key: "code", label: `编码 ${sortIcon("code")}`, required: true, onHeaderClick: () => handleSort("code"), font: "mono", tone: "muted", cell: (position) => position.code },
    { key: "name", label: `岗位名 ${sortIcon("name")}`, required: true, onHeaderClick: () => handleSort("name"), emphasis: "medium", cell: (position) => position.name },
    { key: "dept", label: `部门 ${sortIcon("dept")}`, required: true, onHeaderClick: () => handleSort("dept"), tone: "muted", cell: (position) => position.departmentName || "—" },
    { key: "headcount", label: `编制 ${sortIcon("headcount")}`, required: true, onHeaderClick: () => handleSort("headcount"), align: "right",  tone: "muted", cell: (position) => position.headcount || "—" },
    { key: "actual", label: `实际 ${sortIcon("actual")}`, required: true, onHeaderClick: () => handleSort("actual"), align: "right",  emphasis: "medium", cell: (position) => position.actual || "—" },
    {
      key: "diff",
      label: `差异 ${sortIcon("diff")}`,
      required: true,
      onHeaderClick: () => handleSort("diff"),
      align: "right",

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
  return createAnalysisSection("positions", {
        title: "岗位明细",
        toolbar: {
          items: [
            { kind: "search", key: "search", value: search, onChange: setSearch, placeholder: "搜索岗位名、编码、部门..." },
            { kind: "text", key: "meta", content: <>共 {filtered.length} 个岗位</> },
          ],
        },
        sections: [{
          kind: "data",
          key: "positions-table",
          surface: {
            kind: "table",
            rows: filtered,
            columns,
            visibleColumns: columns.map((column) => column.key),
            rowKey: (position) => position.id,
            emptyText: "暂无匹配数据",
            rowState: (position) =>
              position.status === "空岗" ? "warning" :
              position.status === "超编" ? "danger" :
              position.status === "缺编" ? "info" : "normal",
          },
        }],
      });
}

export default function PositionTable(props: PositionTableBlockParams) {
  return <PageSurface kind="standard" body={createPageBody([createPositionTableSection(props)])} />;
}
