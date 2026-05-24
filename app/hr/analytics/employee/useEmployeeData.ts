import { useMemo } from "react";
import type { Employee, Employment, EDP } from "../useAnalyticsData";
import type { DimKey } from "./constants";
import { DIM_ORDER } from "./constants";

function sortEntries(entries: [string, number][]) {
  return entries.sort((a, b) => b[1] - a[1]);
}

export interface CrossMatrixData {
  rowKeys: string[];
  colKeys: string[];
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
}

export function useEmployeeData(
  employees: Employee[],
  employments: Employment[],
  edps: EDP[],
  crossRow: DimKey,
  crossCol: DimKey,
) {
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

    function sortKeys(keys: string[], dim: DimKey): string[] {
      const order = DIM_ORDER[dim];
      if (order) {
        return keys.sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99));
      }
      // 无固定顺序时按频率降序（多→少）
      const freq = new Map<string, number>();
      for (const r of enriched.rows) {
        const v = r[dim] || "未知";
        freq.set(v, (freq.get(v) || 0) + 1);
      }
      return keys.sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0));
    }

    sortKeys(rowKeys, crossRow);
    sortKeys(colKeys, crossCol);

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

  return { enriched, stats, crossMatrix };
}
