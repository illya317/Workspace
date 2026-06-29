"use client";

import { createPageBody, createAnalysisSection, createMetricsSection, PageSurface, type DataSurfaceColumnSpec, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { Employment } from "./useAnalyticsData";
import { type MonthlySnapshot, useHeadcountData } from "./useHeadcountData";

export function useHeadcountTrendSections({ employments }: { employments: Employment[] }): BodySurfaceSectionSpec[] {
  const stats = useHeadcountData(employments);

  const barMax = Math.max(stats.maxFlow, 1);
  const columns: DataSurfaceColumnSpec<MonthlySnapshot>[] = [
    { key: "label", label: "月份", required: true, emphasis: "medium", cell: (month) => month.label },
    { key: "startActive", label: "月初在职", required: true, align: "right",  tone: "muted", cell: (month) => month.active - month.net },
    { key: "joins", label: "入职", required: true, align: "right",  emphasis: "medium", tone: "info", cell: (month) => month.joins },
    { key: "leaves", label: "离职", required: true, align: "right",  emphasis: "medium", tone: "danger", cell: (month) => month.leaves },
    {
      key: "net",
      label: "净变动",
      required: true,
      align: "right",
       emphasis: "medium",
      cell: (month) => <span className={month.net > 0 ? "text-blue-600" : month.net < 0 ? "text-rose-600" : "text-gray-600"}>{month.net > 0 ? `+${month.net}` : month.net}</span>,
    },
    { key: "active", label: "月末在职", required: true, align: "right",  emphasis: "medium", cell: (month) => month.active },
  ];

  return [
        createMetricsSection("stats", {
            metrics: [
              { key: "currentActive", label: "当前在职", value: stats.currentActive },
              { key: "thisMonthJoins", label: "本月入职", value: stats.thisMonthJoins },
              { key: "thisMonthLeaves", label: "本月离职", value: stats.thisMonthLeaves },
              { key: "thisMonthNet", label: "本月净变动", value: stats.thisMonthNet > 0 ? `+${stats.thisMonthNet}` : stats.thisMonthNet },
              { key: "yearJoins", label: "年度入职", value: stats.yearJoins },
              { key: "yearLeaves", label: "年度离职", value: stats.yearLeaves },
            ],
          }),
        createAnalysisSection("trend", {
          title: "人员流动趋势（近12个月）",
          sections: [
            {
              key: "active-chart",
              body: { kind: "visualization", visualization: {
                kind: "chart",
                chart: {
                  visual: {
                    kind: "barChart",
                    title: "月均在职人数",
                    height: 80,
                    min: stats.activeRange.min,
                    max: Math.max(stats.activeRange.max, 1),
                    bars: stats.months.map((month) => ({
                      key: month.label,
                      label: month.label.slice(2),
                      value: month.active,
                      valueLabel: month.active,
                      tone: "emerald",
                      minPercent: month.active > 0 ? 4 : 1,
                    })),
                  },
                },
              } },
            },
            {
              key: "flow-chart",
              body: { kind: "visualization", visualization: {
                kind: "chart",
                chart: {
                  visual: {
                    kind: "groupedBarChart",
                    title: "月度入职/离职",
                    height: 128,
                    max: barMax,
                    groups: stats.months.map((month) => ({
                      key: month.label,
                      label: month.label.slice(2),
                      bars: [
                        { key: "joins", label: "入职", value: month.joins, tone: "blue", title: `入职 ${month.joins}` },
                        { key: "leaves", label: "离职", value: month.leaves, tone: "rose", title: `离职 ${month.leaves}` },
                      ],
                    })),
                    legend: [
                      { key: "joins", label: "入职", tone: "blue" },
                      { key: "leaves", label: "离职", tone: "rose" },
                      { key: "active", label: "在职人数", tone: "emerald" },
                    ],
                  },
                },
              } },
            },
          ],
        }),
        createAnalysisSection("monthly-details", {
          title: "月度明细",
          sections: [{
            key: "monthly-table",
            body: { kind: "data", data: {
              kind: "table",
              rows: [...stats.months].reverse(),
              columns,
              visibleColumns: columns.map((column) => column.key),
              rowKey: (month) => month.label,
            } },
          }],
        }),
      ];
}

export default function HeadcountTrend(props: { employments: Employment[] }) {
  return <PageSurface kind="standard" body={createPageBody(useHeadcountTrendSections(props))} />;
}
