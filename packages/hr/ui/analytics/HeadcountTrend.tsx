"use client";

import { PageSurface, type DataTableColumn } from "@workspace/core/ui";
import type { Employment } from "./useAnalyticsData";
import { type MonthlySnapshot, useHeadcountData } from "./useHeadcountData";

export default function HeadcountTrend({ employments }: { employments: Employment[] }) {
  const stats = useHeadcountData(employments);

  const barMax = Math.max(stats.maxFlow, 1);
  const columns: DataTableColumn<MonthlySnapshot>[] = [
    { key: "label", label: "月份", required: true, cellClassName: "font-medium text-slate-800", render: (month) => month.label },
    { key: "startActive", label: "月初在职", required: true, headerClassName: "text-right", cellClassName: "text-right text-slate-500", render: (month) => month.active - month.net },
    { key: "joins", label: "入职", required: true, headerClassName: "text-right", cellClassName: "text-right font-medium text-blue-600", render: (month) => month.joins },
    { key: "leaves", label: "离职", required: true, headerClassName: "text-right", cellClassName: "text-right font-medium text-rose-600", render: (month) => month.leaves },
    {
      key: "net",
      label: "净变动",
      required: true,
      headerClassName: "text-right",
      cellClassName: "text-right font-medium",
      render: (month) => <span className={month.net > 0 ? "text-blue-600" : month.net < 0 ? "text-rose-600" : "text-gray-600"}>{month.net > 0 ? `+${month.net}` : month.net}</span>,
    },
    { key: "active", label: "月末在职", required: true, headerClassName: "text-right", cellClassName: "text-right font-medium text-slate-800", render: (month) => month.active },
  ];

  return (
    <PageSurface
      kind="analysis"
      blocks={[
        {
          kind: "data",
          key: "stats",
          surface: {
            kind: "metrics",
            metrics: [
              { key: "currentActive", label: "当前在职", value: stats.currentActive },
              { key: "thisMonthJoins", label: "本月入职", value: stats.thisMonthJoins },
              { key: "thisMonthLeaves", label: "本月离职", value: stats.thisMonthLeaves },
              { key: "thisMonthNet", label: "本月净变动", value: stats.thisMonthNet > 0 ? `+${stats.thisMonthNet}` : stats.thisMonthNet },
              { key: "yearJoins", label: "年度入职", value: stats.yearJoins },
              { key: "yearLeaves", label: "年度离职", value: stats.yearLeaves },
            ],
          },
        },
        {
          kind: "analysis",
          key: "trend",
          title: "人员流动趋势（近12个月）",
          blocks: [{
            kind: "moduleView",
            key: "trend-chart",
            view: (
              <>
                <div className="mb-6">
                  <h4 className="text-xs text-gray-500 mb-2">月均在职人数</h4>
                  <div className="flex items-end gap-1 h-20">
                    {stats.months.map((m, i) => {
                      const range = stats.activeRange.max - stats.activeRange.min || 1;
                      const h = Math.round(((m.active - stats.activeRange.min) / range) * 70 + 30);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs text-gray-500 font-medium">{m.active}</span>
                          <div className="w-full bg-emerald-300 rounded-t" style={{ height: `${h}%` }} />
                          <span className="text-[9px] text-gray-400">{m.label.slice(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-1">
                  <h4 className="text-xs text-gray-500 mb-2">月度入职/离职</h4>
                  <div className="flex items-end gap-1 h-32">
                    {stats.months.map((m, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="flex gap-0.5 items-end">
                          <div
                            className="w-2.5 bg-blue-400 rounded-t"
                            style={{ height: `${Math.round((m.joins / barMax) * 100)}%` }}
                            title={`入职 ${m.joins}`}
                          />
                          <div
                            className="w-2.5 bg-rose-400 rounded-t"
                            style={{ height: `${Math.round((m.leaves / barMax) * 100)}%` }}
                            title={`离职 ${m.leaves}`}
                          />
                        </div>
                        <span className="text-[8px] text-gray-400">{m.label.slice(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs text-gray-400 border-t pt-3 mt-2">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" /> 入职</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-400 inline-block" /> 离职</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-300 inline-block" /> 在职人数</span>
                </div>
              </>
            ),
          }],
        },
        {
          kind: "analysis",
          key: "monthly-details",
          title: "月度明细",
          blocks: [{
            kind: "data",
            key: "monthly-table",
            surface: {
              kind: "table",
              rows: [...stats.months].reverse(),
              columns,
              visibleColumns: columns.map((column) => column.key),
              rowKey: (month) => month.label,
            },
          }],
        },
      ]}
    />
  );
}
