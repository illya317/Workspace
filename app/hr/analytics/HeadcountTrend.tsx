"use client";

import type { Employment } from "./useAnalyticsData";
import { useHeadcountData } from "./useHeadcountData";
import StatCard from "./shared/StatCard";

export default function HeadcountTrend({ employments }: { employments: Employment[] }) {
  const stats = useHeadcountData(employments);

  const barMax = Math.max(stats.maxFlow, 1);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="当前在职" value={stats.currentActive} color="emerald" />
        <StatCard label="本月入职" value={stats.thisMonthJoins} color="blue" />
        <StatCard label="本月离职" value={stats.thisMonthLeaves} color="rose" />
        <StatCard label="本月净变动" value={stats.thisMonthNet > 0 ? `+${stats.thisMonthNet}` : stats.thisMonthNet} color={stats.thisMonthNet >= 0 ? "emerald" : "rose"} />
        <StatCard label="年度入职" value={stats.yearJoins} color="amber" />
        <StatCard label="年度离职" value={stats.yearLeaves} color="purple" />
      </div>

      {/* 月度趋势图 */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center gap-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">人员流动趋势（近12个月）</h3>
        </div>

        {/* 在职人数折线 */}
        <div className="mb-6">
          <h4 className="text-xs text-gray-500 mb-2">月均在职人数</h4>
          <div className="flex items-end gap-1 h-20">
            {stats.months.map((m, i) => {
              const range = stats.activeRange.max - stats.activeRange.min || 1;
              const h = Math.round(((m.active - stats.activeRange.min) / range) * 70 + 30);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500 font-medium">{m.active}</span>
                  <div className="w-full bg-emerald-300 rounded-t" style={{ height: `${h}%` }} />
                  <span className="text-[9px] text-gray-400">{m.label.slice(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 流入流出柱状图 */}
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

        <div className="flex items-center gap-6 text-[10px] text-gray-400 border-t pt-3 mt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" /> 入职</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-400 inline-block" /> 离职</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-300 inline-block" /> 在职人数</span>
        </div>
      </div>

      {/* 月度明细表 */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">月度明细</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-2 px-2">月份</th>
                <th className="text-right py-2 px-2">月初在职</th>
                <th className="text-right py-2 px-2">入职</th>
                <th className="text-right py-2 px-2">离职</th>
                <th className="text-right py-2 px-2">净变动</th>
                <th className="text-right py-2 px-2">月末在职</th>
              </tr>
            </thead>
            <tbody>
              {[...stats.months].reverse().map((m, _i) => (
                <tr key={m.label} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium text-gray-700">{m.label}</td>
                  <td className="py-2 px-2 text-right text-gray-500">{m.active - m.net}</td>
                  <td className="py-2 px-2 text-right text-blue-600 font-medium">{m.joins}</td>
                  <td className="py-2 px-2 text-right text-rose-600 font-medium">{m.leaves}</td>
                  <td className={`py-2 px-2 text-right font-medium ${m.net > 0 ? "text-blue-600" : m.net < 0 ? "text-rose-600" : "text-gray-600"}`}>
                    {m.net > 0 ? `+${m.net}` : m.net === 0 ? "0" : m.net}
                  </td>
                  <td className="py-2 px-2 text-right font-medium text-gray-700">{m.active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
