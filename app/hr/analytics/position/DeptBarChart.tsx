"use client";

import { AnalysisBlock, SelectField } from "@workspace/core/ui";
import type { DeptEntry, FilteredDept } from "./usePositionData";

const LEVEL_LABEL: Record<number, string> = { 1: "L1 事业部", 2: "L2 部门", 3: "L3 子部门" };
const LEVEL_COLOR: Record<number, string> = { 1: "text-blue-600", 2: "text-emerald-600", 3: "text-amber-600" };

function DeptBarRow({ d, globalMax }: { d: DeptEntry; globalMax: number }) {
  const hcPct = Math.round((d.headcount / globalMax) * 100);
  const acPct = Math.round((d.actual / globalMax) * 100);
  const barColor = d.diff > 0 ? "bg-rose-400" : d.diff < 0 ? "bg-amber-400" : "bg-emerald-400";
  const textColor = d.diff > 0 ? "text-rose-600" : d.diff < 0 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="flex items-center gap-4 py-0.5">
      <span className="w-36 shrink-0 text-sm text-gray-700 truncate" title={d.name}>{d.name}</span>
      <div className="flex-1 flex items-center gap-4">
        <div className="flex-1 h-6 bg-gray-100 rounded relative overflow-hidden">
          {d.headcount > 0 && (
            <div
              className="absolute inset-y-0 left-0 border-r-2 border-dashed border-gray-300 bg-gray-200 rounded-l"
              style={{ width: `${hcPct}%` }}
            />
          )}
          <div
            className={`absolute inset-y-0 left-0 ${barColor} rounded opacity-90`}
            style={{ width: `${acPct}%` }}
          />
        </div>
        <span className="w-16 text-right text-sm text-gray-500">
          <span className="font-medium text-gray-700">{d.actual}</span>
          {d.headcount > 0 && <span className="text-gray-400"> / {d.headcount}</span>}
        </span>
        <span className={`w-12 text-right text-xs font-medium ${textColor}`}>
          {d.headcount > 0 ? (
            d.diff > 0 ? `+${d.diff}` : d.diff === 0 ? "满" : d.diff
          ) : "—"}
        </span>
      </div>
    </div>
  );
}

function LevelSection({ level, entries, globalMax }: { level: number; entries: DeptEntry[]; globalMax: number }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-5">
      <h4 className={`text-sm font-semibold mb-2 ${LEVEL_COLOR[level] || "text-gray-600"}`}>
        {LEVEL_LABEL[level] || `L${level}`}
        <span className="ml-2 text-xs font-normal text-gray-400">{entries.length} 个部门</span>
      </h4>
      <div className="space-y-2">
        {entries.map((d) => (
          <DeptBarRow key={d.name} d={d} globalMax={globalMax} />
        ))}
      </div>
    </div>
  );
}

export default function DeptBarChart({
  filteredDept,
  l1List,
  filterL1,
  setFilterL1,
  globalMax,
}: {
  filteredDept: FilteredDept;
  l1List: DeptEntry[];
  filterL1: number | null;
  setFilterL1: (v: number | null) => void;
  globalMax: number;
}) {
  return (
    <AnalysisBlock
      title="各部门编制 vs 实际"
      subtitle="条形宽度跨层级统一比例"
      toolbar={
        <SelectField
          value={filterL1 == null ? "" : String(filterL1)}
          onChange={(value) => setFilterL1(value ? Number(value) : null)}
          placeholder="全部事业部"
          options={l1List.map((dept) => ({ value: String(dept.id), label: dept.name }))}
          className="ml-auto w-40"
          selectClassName="min-h-8"
        />
      }
    >

      <LevelSection level={1} entries={filteredDept.l1} globalMax={globalMax} />
      <LevelSection level={2} entries={filteredDept.l2} globalMax={globalMax} />
      <LevelSection level={3} entries={filteredDept.l3} globalMax={globalMax} />

      {filteredDept.entries.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">暂无数据</p>
      )}

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 border-t pt-3">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400 inline-block" /> 满编/平衡</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> 缺编</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-400 inline-block" /> 超编</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block border-r-2 border-dashed border-gray-300" /> 编制参考线</span>
      </div>
    </AnalysisBlock>
  );
}
