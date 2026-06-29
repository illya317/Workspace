"use client";

import { createPageBody, createAnalysisSection, PageSurface, type BodySurfaceSectionSpec, type VisualizationComparisonBarSectionSpec, type VisualizationTone } from "@workspace/core/ui";
import type { DeptEntry, FilteredDept } from "./usePositionData";

const LEVEL_LABEL: Record<number, string> = { 1: "L1 事业部", 2: "L2 部门", 3: "L3 子部门" };
const LEVEL_TONE: Record<number, VisualizationTone> = { 1: "blue", 2: "emerald", 3: "amber" };

function toneForDiff(diff: number): VisualizationTone {
  if (diff > 0) return "rose";
  if (diff < 0) return "amber";
  return "emerald";
}

function diffLabel(entry: DeptEntry) {
  if (entry.headcount <= 0) return "—";
  if (entry.diff > 0) return `+${entry.diff}`;
  if (entry.diff === 0) return "满";
  return String(entry.diff);
}

function toSection(level: number, entries: DeptEntry[]): VisualizationComparisonBarSectionSpec {
  return {
    key: `l${level}`,
    title: LEVEL_LABEL[level] || `L${level}`,
    subtitle: `${entries.length} 个部门`,
    tone: LEVEL_TONE[level] ?? "slate",
    items: entries.map((entry) => ({
      key: String(entry.id ?? entry.name),
      label: entry.name,
      actual: entry.actual,
      reference: entry.headcount > 0 ? entry.headcount : undefined,
      valueLabel: entry.headcount > 0 ? `${entry.actual} / ${entry.headcount}` : String(entry.actual),
      diffLabel: diffLabel(entry),
      tone: toneForDiff(entry.diff),
      diffTone: toneForDiff(entry.diff),
    })),
  };
}

interface DeptBarChartBlockParams {
  filteredDept: FilteredDept;
  l1List: DeptEntry[];
  filterL1: number | null;
  setFilterL1: (v: number | null) => void;
  globalMax: number;
}

export function createDeptBarChartSection({
  filteredDept,
  l1List,
  filterL1,
  setFilterL1,
  globalMax,
}: DeptBarChartBlockParams): BodySurfaceSectionSpec {
  const sections = [
    toSection(1, filteredDept.l1),
    toSection(2, filteredDept.l2),
    toSection(3, filteredDept.l3),
  ];

  return createAnalysisSection("dept-bars", {
        title: "各部门编制 vs 实际",
        subtitle: "条形宽度跨层级统一比例",
        toolbar: {
          items: [{
            kind: "select",
            key: "l1",
            value: filterL1 == null ? "" : String(filterL1),
            onChange: (value) => setFilterL1(value ? Number(value) : null),
            placeholder: "全部事业部",
            options: l1List.map((dept) => ({ value: String(dept.id), label: dept.name })),
          }],
        },
        sections: [{
          key: "bars",
          body: { kind: "visualization", visualization: {
            kind: "chart",
            chart: {
              visual: {
                kind: "comparisonBars",
                sections,
                max: Math.max(globalMax, 1),
                emptyText: "暂无数据",
                legend: [
                  { key: "balanced", label: "满编/平衡", tone: "emerald" },
                  { key: "under", label: "缺编", tone: "amber" },
                  { key: "over", label: "超编", tone: "rose" },
                  { key: "reference", label: "编制参考线", marker: "reference" },
                ],
              },
            },
          } },
        }],
      });
}

export default function DeptBarChart(props: DeptBarChartBlockParams) {
  return <PageSurface kind="standard" body={createPageBody([createDeptBarChartSection(props)])} />;
}
