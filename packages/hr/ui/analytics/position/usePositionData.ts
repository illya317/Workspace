"use client";

import { useMemo, useState } from "react";
import { matchSearchFields } from "@workspace/platform/search";
import type { Position, EDP, Department } from "../useAnalyticsData";

export interface EnrichedPosition extends Position {
  actual: number;
  diff: number;
  status: string;
}

export interface DeptEntry {
  id: number;
  name: string;
  level: number;
  actual: number;
  headcount: number;
  positions: number;
  diff: number;
}

export interface StatsData {
  total: number;
  occupied: number;
  vacant: number;
  overStaffed: number;
  underStaffed: number;
  hasHeadcount: number;
  deptByLevel: { l1: DeptEntry[]; l2: DeptEntry[]; l3: DeptEntry[] };
  deptEntries: DeptEntry[];
}

export interface FilteredDept {
  l1: DeptEntry[];
  l2: DeptEntry[];
  l3: DeptEntry[];
  entries: DeptEntry[];
}

export type SortKey = "code" | "name" | "actual" | "headcount" | "diff" | "dept";

export function usePositionData(
  positions: Position[],
  edps: EDP[],
  departments: Department[],
) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("actual");
  const [sortDesc, setSortDesc] = useState(true);
  const [filterL1, setFilterL1] = useState<number | null>(null);

  const activeEdps = useMemo(() => edps.filter((e) => !e.endDate), [edps]);

  const enriched = useMemo(() => {
    const actualMap = new Map<number, number>();
    const posPeople = new Map<number, Set<number>>();
    activeEdps.forEach((e) => {
      if (e.positionId && e.isPrimary) {
        const set = posPeople.get(e.positionId) || new Set();
        set.add(e.employeeId);
        posPeople.set(e.positionId, set);
      }
    });
    for (const [pid, s] of posPeople) actualMap.set(pid, s.size);

    return positions.map((p) => {
      const actual = actualMap.get(p.id) || 0;
      const hc = p.headcount || 0;
      const diff = actual - hc;
      return {
        ...p,
        actual,
        diff,
        status: hc > 0 ? (diff > 0 ? "超编" : diff < 0 ? "缺编" : "满编") : (actual > 0 ? "有任职" : "空岗"),
      };
    });
  }, [positions, activeEdps]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const occupied = enriched.filter((p) => p.actual > 0).length;
    const vacant = enriched.filter((p) => p.actual === 0).length;
    const overStaffed = enriched.filter((p) => p.headcount > 0 && p.actual > p.headcount).length;
    const underStaffed = enriched.filter((p) => p.headcount > 0 && p.actual < p.headcount).length;
    const hasHeadcount = enriched.filter((p) => p.headcount > 0).length;

    // 按部门ID聚合本部门直属岗位数据
    const deptDirect = new Map<number, { name: string; level: number; parentId: number | null; actual: number; headcount: number; positions: number }>();
    enriched.forEach((p) => {
      const deptId = p.departmentId || 0;
      const dept = departments.find((d) => d.id === deptId);
      if (!deptDirect.has(deptId)) {
        deptDirect.set(deptId, {
          name: dept?.name || "未分配",
          level: dept?.level || 0,
          parentId: dept?.parentId ?? null,
          actual: 0, headcount: 0, positions: 0,
        });
      }
      const curr = deptDirect.get(deptId)!;
      curr.actual += p.actual;
      curr.headcount += p.headcount || 0;
      curr.positions++;
    });

    // 补全祖先部门（可能有子部门岗位但本身无直接岗位，如 L1 事业部）
    for (const [_id, d] of [...deptDirect.entries()]) {
      let parentId = d.parentId;
      while (parentId !== null && !deptDirect.has(parentId)) {
        const pd = departments.find((dd) => dd.id === parentId);
        if (!pd) break;
        deptDirect.set(parentId, {
          name: pd.name,
          level: pd.level,
          parentId: pd.parentId ?? null,
          actual: 0, headcount: 0, positions: 0,
        });
        parentId = pd.parentId ?? null;
      }
    }

    // 构建 children 索引（包含全部部门，不仅是直接有岗位的）
    const childrenMap = new Map<number, number[]>();
    for (const [id] of deptDirect) childrenMap.set(id, []);
    for (const [id, d] of deptDirect) {
      if (d.parentId !== null && deptDirect.has(d.parentId)) {
        childrenMap.get(d.parentId)!.push(id);
      }
    }

    // 递归汇总：每个部门的子树合计
    function aggregate(deptId: number): { actual: number; headcount: number; positions: number } {
      const direct = deptDirect.get(deptId);
      if (!direct) return { actual: 0, headcount: 0, positions: 0 };
      const total = { actual: direct.actual, headcount: direct.headcount, positions: direct.positions };
      for (const childId of (childrenMap.get(deptId) || [])) {
        const childAgg = aggregate(childId);
        total.actual += childAgg.actual;
        total.headcount += childAgg.headcount;
        total.positions += childAgg.positions;
      }
      return total;
    }

    const deptEntries: DeptEntry[] = [...deptDirect.entries()]
      .map(([id, d]) => {
        const subtree = aggregate(id);
        return {
          id,
          name: d.name,
          level: d.level,
          actual: subtree.actual,
          headcount: subtree.headcount,
          positions: subtree.positions,
          diff: subtree.actual - subtree.headcount,
        };
      })
      .sort((a, b) => a.id - b.id);

    const deptByLevel = {
      l1: deptEntries.filter((d) => d.level === 1),
      l2: deptEntries.filter((d) => d.level === 2),
      l3: deptEntries.filter((d) => d.level === 3),
    };

    return { total, occupied, vacant, overStaffed, underStaffed, hasHeadcount, deptByLevel, deptEntries };
  }, [enriched, departments]);

  // L1 子树索引 + 筛选
  const { l1List, filteredDept } = useMemo(() => {
    const l1Depts = stats.deptByLevel.l1;
    // 为每个 L1 构建子树 ID 集合
    const subtreeOf = new Map<number, Set<number>>();
    for (const l1 of l1Depts) {
      const subtree = new Set<number>();
      // 从 deptEntries 中找所有在该 L1 子树下的部门（父链追溯）
      for (const d of stats.deptEntries) {
        // 查找该部门是否在 L1 子树下
        const allDeptIds = new Set(stats.deptEntries.map(e => e.id));
        if (d.id === l1.id) { subtree.add(d.id); continue; }
        if (d.level > 1 && allDeptIds.has(d.id)) {
          // 通过 departments 的 parentId 追溯，检查是否属于该 L1
          let curr = departments.find(dd => dd.id === d.id);
          while (curr?.parentId) {
            if (curr.parentId === l1.id) { subtree.add(d.id); break; }
            curr = departments.find(dd => dd.id === curr!.parentId);
          }
        }
      }
      subtreeOf.set(l1.id, subtree);
    }

    if (filterL1 !== null) {
      const subtree = subtreeOf.get(filterL1) || new Set();
      subtree.add(filterL1);
      return {
        l1List: l1Depts,
        filteredDept: {
          l1: l1Depts.filter(d => d.id === filterL1),
          l2: stats.deptByLevel.l2.filter(d => subtree.has(d.id)),
          l3: stats.deptByLevel.l3.filter(d => subtree.has(d.id)),
          entries: stats.deptEntries.filter(d => subtree.has(d.id)),
        },
      };
    }
    return { l1List: l1Depts, filteredDept: { ...stats.deptByLevel, entries: stats.deptEntries } };
  }, [stats, filterL1, departments]);

  const filtered = useMemo(() => {
    let list = [...enriched];
    if (search.trim()) {
      list = list.filter((p) => matchSearchFields(p, search, ["name", "code", "alias", "departmentName"]));
    }
    return [...list].sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case "code": av = a.code; bv = b.code; break;
        case "name": av = a.name; bv = b.name; break;
        case "actual": av = a.actual; bv = b.actual; break;
        case "headcount": av = a.headcount; bv = b.headcount; break;
        case "diff": av = a.diff; bv = b.diff; break;
        case "dept": av = a.departmentName || ""; bv = b.departmentName || ""; break;
        default: av = a.actual; bv = b.actual;
      }
      if (typeof av === "string" && typeof bv === "string") return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
      if (typeof av === "number" && typeof bv === "number") return sortDesc ? bv - av : av - bv;
      return 0;
    });
  }, [enriched, search, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(true); }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortDesc ? "↓" : "↑";
  };

  const globalMax = Math.max(...filteredDept.entries.map(d => Math.max(d.headcount, d.actual)), 1);

  return {
    enriched,
    stats,
    filteredDept,
    l1List,
    filtered,
    search,
    setSearch,
    sortKey,
    sortDesc,
    handleSort,
    sortIcon,
    globalMax,
    filterL1,
    setFilterL1,
  };
}
