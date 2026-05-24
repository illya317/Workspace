"use client";

import { useMemo, useState } from "react";
import type { Employee, Employment, EDP } from "./useAnalyticsData";

function StatCard({ label, value, color = "emerald" }: { label: string; value: string | number; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-lg p-4 ${colorMap[color] || colorMap.emerald}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs opacity-80">{label}</div>
    </div>
  );
}

function DistributionBar({ label, count, total, color = "bg-emerald-500" }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-xs text-gray-600 truncate">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
        <div className={`h-full ${color} rounded transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs text-gray-700 font-medium">{count}</span>
      <span className="w-10 text-right text-xs text-gray-400">{pct}%</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-700 mb-3">{children}</h3>;
}

function sortEntries(entries: [string, number][]) {
  return entries.sort((a, b) => b[1] - a[1]);
}

type DimKey = "gender" | "age" | "education" | "politics" | "company" | "ethnicity" | "tenure" | "rank" | "personnelType";

const DIM_LABELS: Record<DimKey, string> = {
  gender: "性别", age: "年龄", education: "学历", politics: "政治面貌",
  company: "公司", ethnicity: "民族", tenure: "司龄", rank: "职级",
  personnelType: "人员类型",
};

const DIM_COLORS: Record<DimKey, string> = {
  gender: "bg-blue-400", age: "bg-emerald-400", education: "bg-amber-400",
  politics: "bg-purple-400", company: "bg-sky-400", ethnicity: "bg-rose-400",
  tenure: "bg-indigo-400", rank: "bg-teal-400", personnelType: "bg-orange-400",
};

export default function EmployeeAnalytics({ employees, employments, edps }: { employees: Employee[]; employments: Employment[]; edps: EDP[] }) {
  const [feature, setFeature] = useState<DimKey>("gender");
  const [crossRow, setCrossRow] = useState<DimKey>("company");
  const [crossCol, setCrossCol] = useState<DimKey>("gender");

  const enriched = useMemo(() => {
    // 在职员工
    const activeEmps = new Map<number, Employee>();
    for (const e of employees) activeEmps.set(e.id, e);

    const activeEmpIds = new Set(
      employments.filter((e) => e.isActive).map((e) => e.employeeId)
    );

    // 员工的 employment 信息
    const empActiveEmployment = new Map<number, Employment>();
    for (const em of employments) {
      if (em.isActive && activeEmps.has(em.employeeId)) empActiveEmployment.set(em.employeeId, em);
    }

    // 员工的主岗 EDP（isPrimary && 未结束）
    const empPrimaryEdp = new Map<number, EDP>();
    for (const ed of edps) {
      if (ed.isPrimary && !ed.endDate && activeEmps.has(ed.employeeId)) {
        empPrimaryEdp.set(ed.employeeId, ed);
      }
    }

    const now = new Date();
    const result: Array<Record<string, string>> = [];

    for (const eid of activeEmpIds) {
      const emp = activeEmps.get(eid);
      if (!emp) continue;
      const em = empActiveEmployment.get(eid);
      const edp = empPrimaryEdp.get(eid);

      const row: Record<string, string> = {};

      // 基础特征
      row.gender = emp.gender === true ? "男" : emp.gender === false ? "女" : "未知";
      row.education = emp.education || "未知";
      row.politics = emp.politics || "未知";
      row.ethnicity = emp.ethnicity || "未知";
      row.company = em?.currentCompany || "未知";

      // 年龄
      if (emp.birthDate) {
        const age = now.getFullYear() - new Date(emp.birthDate).getFullYear();
        if (age < 25) row.age = "25岁以下";
        else if (age < 30) row.age = "25-29岁";
        else if (age < 35) row.age = "30-34岁";
        else if (age < 40) row.age = "35-39岁";
        else if (age < 45) row.age = "40-44岁";
        else if (age < 50) row.age = "45-49岁";
        else row.age = "50岁及以上";
      } else {
        row.age = "未知";
      }

      // 司龄
      if (em?.joinDate) {
        const years = now.getFullYear() - new Date(em.joinDate).getFullYear();
        if (years < 1) row.tenure = "<1年";
        else if (years < 3) row.tenure = "1-3年";
        else if (years < 5) row.tenure = "3-5年";
        else if (years < 10) row.tenure = "5-10年";
        else row.tenure = "≥10年";
      } else {
        row.tenure = "未知";
      }

      // 职级（从主岗 EDP）
      row.rank = edp?.rank || "未知";

      // 人员类型（从主岗 EDP）
      row.personnelType = edp?.personnelType || "未知";

      result.push(row);
    }

    return { rows: result, count: result.length };
  }, [employees, employments, edps]);

  const stats = useMemo(() => {
    const total = employees.length;
    const totalActive = enriched.count;
    const totalInactive = total - totalActive;

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const joinedThisMonth = employments.filter((e) => {
      if (!e.joinDate) return false;
      const d = new Date(e.joinDate);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    }).length;

    const leftThisMonth = employments.filter((e) => {
      if (!e.leaveDate) return false;
      const d = new Date(e.leaveDate);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    }).length;

    // 各维度分布
    function distribution(dim: DimKey): [string, number][] {
      const map = new Map<string, number>();
      for (const r of enriched.rows) {
        const v = r[dim] || "未知";
        map.set(v, (map.get(v) || 0) + 1);
      }
      return sortEntries([...map.entries()]);
    }

    // 年龄保持固定顺序
    const ageOrder = ["25岁以下", "25-29岁", "30-34岁", "35-39岁", "40-44岁", "45-49岁", "50岁及以上", "未知"];
    const ageMap = new Map<string, number>();
    for (const r of enriched.rows) {
      const v = r.age || "未知";
      ageMap.set(v, (ageMap.get(v) || 0) + 1);
    }
    const ageEntries = ageOrder.map((k) => [k, ageMap.get(k) || 0] as [string, number]).filter(([, v]) => v > 0);

    // 司龄保持固定顺序
    const tenureOrder = ["<1年", "1-3年", "3-5年", "5-10年", "≥10年", "未知"];
    const tenureMap = new Map<string, number>();
    for (const r of enriched.rows) {
      const v = r.tenure || "未知";
      tenureMap.set(v, (tenureMap.get(v) || 0) + 1);
    }
    const tenureEntries = tenureOrder.map((k) => [k, tenureMap.get(k) || 0] as [string, number]).filter(([, v]) => v > 0);

    const recentJoins = employments
      .filter((e) => e.isActive && e.joinDate)
      .sort((a, b) => new Date(b.joinDate!).getTime() - new Date(a.joinDate!).getTime())
      .slice(0, 10);

    const recentLeaves = employments
      .filter((e) => !e.isActive && e.leaveDate)
      .sort((a, b) => new Date(b.leaveDate!).getTime() - new Date(a.leaveDate!).getTime())
      .slice(0, 10);

    return {
      total, active: totalActive, inactive: totalInactive,
      joinedThisMonth, leftThisMonth,
      distributions: {
        gender: distribution("gender"),
        education: distribution("education"),
        politics: distribution("politics"),
        ethnicity: distribution("ethnicity"),
        company: distribution("company"),
        rank: distribution("rank"),
        personnelType: distribution("personnelType"),
        tenure: tenureEntries,
        age: ageEntries,
      },
      recentJoins, recentLeaves,
    };
  }, [employees, employments, enriched]);

  // 交叉分析
  const crossMatrix = useMemo(() => {
    const rowKeys = [...new Set(enriched.rows.map((r) => r[crossRow] || "未知"))];
    const colKeys = [...new Set(enriched.rows.map((r) => r[crossCol] || "未知"))];

    // natural sort for keys
    rowKeys.sort();
    colKeys.sort();

    const matrix: Record<string, Record<string, number>> = {};
    for (const rk of rowKeys) {
      matrix[rk] = {};
      for (const ck of colKeys) matrix[rk][ck] = 0;
    }

    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    for (const rk of rowKeys) rowTotals[rk] = 0;
    for (const ck of colKeys) colTotals[ck] = 0;

    for (const r of enriched.rows) {
      const rv = r[crossRow] || "未知";
      const cv = r[crossCol] || "未知";
      matrix[rv][cv] = (matrix[rv]?.[cv] || 0) + 1;
      rowTotals[rv] = (rowTotals[rv] || 0) + 1;
      colTotals[cv] = (colTotals[cv] || 0) + 1;
    }

    return { rowKeys, colKeys, matrix, rowTotals, colTotals };
  }, [enriched, crossRow, crossCol]);

  function heatColor(v: number, max: number): string {
    if (max === 0) return "bg-gray-50";
    const ratio = v / max;
    if (ratio === 0) return "bg-gray-50";
    if (ratio < 0.15) return "bg-blue-100";
    if (ratio < 0.3) return "bg-blue-200";
    if (ratio < 0.5) return "bg-blue-300";
    if (ratio < 0.7) return "bg-blue-400 text-white";
    return "bg-blue-600 text-white";
  }

  const crossMax = Math.max(0, ...Object.values(crossMatrix.rowTotals));

  const featureList: DimKey[] = ["gender", "age", "education", "politics", "company", "ethnicity", "tenure", "rank", "personnelType"];

  function currentDist(): [string, number][] {
    if (feature in stats.distributions) return (stats.distributions as any)[feature] || [];
    return [];
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="员工总数" value={stats.total} color="emerald" />
        <StatCard label="在职人数" value={stats.active} color="blue" />
        <StatCard label="离职人数" value={stats.inactive} color="rose" />
        <StatCard label="本月入职" value={stats.joinedThisMonth} color="amber" />
        <StatCard label="本月离职" value={stats.leftThisMonth} color="purple" />
      </div>

      {/* 单维度特征分布 */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center gap-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">特征分布</h3>
          <select
            value={feature}
            onChange={(e) => setFeature(e.target.value as DimKey)}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
          >
            {featureList.map((f) => (
              <option key={f} value={f}>{DIM_LABELS[f]}分布</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">基于 {stats.active} 位在职员工</span>
        </div>

        {currentDist().map(([k, v]) => (
          <DistributionBar key={k} label={k} count={v} total={stats.active} color={DIM_COLORS[feature] || "bg-emerald-400"} />
        ))}
      </div>

      {/* 交叉分析 */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <SectionTitle>交叉分析</SectionTitle>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">行：</span>
            <select
              value={crossRow}
              onChange={(e) => setCrossRow(e.target.value as DimKey)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
            >
              {featureList.map((f) => (
                <option key={f} value={f} disabled={f === crossCol}>{DIM_LABELS[f]}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-gray-300">×</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">列：</span>
            <select
              value={crossCol}
              onChange={(e) => setCrossCol(e.target.value as DimKey)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-emerald-400"
            >
              {featureList.map((f) => (
                <option key={f} value={f} disabled={f === crossRow}>{DIM_LABELS[f]}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-gray-400">共 {stats.active} 人</span>
        </div>

        {crossMatrix.rowKeys.length === 0 ? (
          <p className="text-xs text-gray-400 py-4">无数据</p>
        ) : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="text-left py-2 px-2 border-b font-medium text-gray-600 sticky left-0 bg-white">
                    {DIM_LABELS[crossRow]} \ {DIM_LABELS[crossCol]}
                  </th>
                  {crossMatrix.colKeys.map((ck) => (
                    <th key={ck} className="text-center py-2 px-2 border-b font-medium text-gray-600 whitespace-nowrap">{ck}</th>
                  ))}
                  <th className="text-center py-2 px-2 border-b font-medium text-gray-500 bg-gray-50">合计</th>
                </tr>
              </thead>
              <tbody>
                {crossMatrix.rowKeys.map((rk) => (
                  <tr key={rk} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 px-2 font-medium text-gray-700 sticky left-0 bg-white whitespace-nowrap">{rk}</td>
                    {crossMatrix.colKeys.map((ck) => {
                      const v = crossMatrix.matrix[rk]?.[ck] || 0;
                      return (
                        <td key={ck} className={`text-center py-2 px-2 ${heatColor(v, crossMax)}`}>
                          {v > 0 ? v : "—"}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-2 font-medium bg-gray-50 text-gray-700">{crossMatrix.rowTotals[rk] || 0}</td>
                  </tr>
                ))}
                {/* 列合计 */}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                  <td className="py-2 px-2 text-gray-700 sticky left-0 bg-gray-50">合计</td>
                  {crossMatrix.colKeys.map((ck) => (
                    <td key={ck} className="text-center py-2 px-2 text-gray-700">{crossMatrix.colTotals[ck] || 0}</td>
                  ))}
                  <td className="text-center py-2 px-2 text-gray-700">{stats.active}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent changes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-5">
          <SectionTitle>最近入职（前10）</SectionTitle>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-2">姓名</th>
                <th className="text-left py-2">公司</th>
                <th className="text-left py-2">入职日期</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentJoins.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 font-medium">{e.employeeName}</td>
                  <td className="py-2 text-gray-500">{e.currentCompany || "—"}</td>
                  <td className="py-2 text-gray-500">{e.joinDate}</td>
                </tr>
              ))}
              {stats.recentJoins.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-gray-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-5">
          <SectionTitle>最近离职（前10）</SectionTitle>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-2">姓名</th>
                <th className="text-left py-2">公司</th>
                <th className="text-left py-2">离职日期</th>
                <th className="text-left py-2">原因</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentLeaves.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 font-medium">{e.employeeName}</td>
                  <td className="py-2 text-gray-500">{e.currentCompany || "—"}</td>
                  <td className="py-2 text-gray-500">{e.leaveDate}</td>
                  <td className="py-2 text-gray-500">{e.leaveReason || "—"}</td>
                </tr>
              ))}
              {stats.recentLeaves.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-gray-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
