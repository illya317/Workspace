"use client";

import { useEffect, useState } from "react";
import type { ResourceItem } from "./types";

interface Position {
  id: number;
  code: string;
  name: string;
  company: string;
  headcount: number;
}

interface Grant {
  positionId: number;
  resource: { key: string } | null;
  role: { key: string } | null;
}

function positionHasPerm(
  grants: Grant[],
  positionId: number,
  resourceKey: string,
  roleKey: string
): boolean {
  return grants.some(
    (g) =>
      g.positionId === positionId &&
      g.resource?.key === resourceKey &&
      g.role?.key === roleKey
  );
}

export function useByPositionTab(
  resources: ResourceItem[],
  showToast: (msg: string, type?: "success" | "error") => void
) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [positionDeptMap, setPositionDeptMap] = useState<Map<number, string[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);

  const [filterCompany, setFilterCompany] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [posRes, grantRes, epRes] = await Promise.all([
          fetch("/api/positions"),
          fetch("/api/admin/position-permissions"),
          fetch("/api/employee-positions"),
        ]);
        const posData = await posRes.json();
        const grantData = await grantRes.json();
        const epData = await epRes.json();

        setPositions(posData.positions || []);
        setGrants(grantData.grants || []);

        const map = new Map<number, Set<string>>();
        (epData.positions || []).forEach((ep: any) => {
          if (ep.positionId && ep.dept1) {
            if (!map.has(ep.positionId)) {
              map.set(ep.positionId, new Set());
            }
            map.get(ep.positionId)!.add(ep.dept1);
          }
        });
        const finalMap = new Map<number, string[]>();
        map.forEach((depts, posId) => {
          finalMap.set(posId, Array.from(depts));
        });
        setPositionDeptMap(finalMap);
      } catch (e) {
        console.error("ByPositionTab load failed:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function togglePerm(
    positionId: number,
    resourceKey: string,
    value: boolean
  ) {
    try {
      const res = await fetch("/api/admin/position-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId,
          resourceKey,
          roleKey: "access",
          value,
        }),
      });
      if (res.ok) {
        const grantRes = await fetch("/api/admin/position-permissions");
        const grantData = await grantRes.json();
        setGrants(grantData.grants || []);
        showToast(value ? "已授权" : "已撤销", "success");
      } else {
        const data = await res.json();
        showToast(data.error || "操作失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  }

  const companies = Array.from(
    new Set(positions.map((p) => p.company).filter(Boolean))
  ).sort();

  const allDeptNames = Array.from(
    new Set(Array.from(positionDeptMap.values()).flat())
  ).sort();

  const filteredPositions = positions.filter((p) => {
    if (filterCompany && p.company !== filterCompany) return false;
    if (filterDept) {
      const depts = positionDeptMap.get(p.id) || [];
      if (!depts.includes(filterDept)) return false;
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      return (
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.name && p.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const allResources = [...resources].sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  return {
    loading,
    filterCompany,
    setFilterCompany,
    filterDept,
    setFilterDept,
    searchText,
    setSearchText,
    companies,
    allDeptNames,
    filteredPositions,
    positionDeptMap,
    allResources,
    grants,
    togglePerm,
    positionHasPerm,
  };
}
