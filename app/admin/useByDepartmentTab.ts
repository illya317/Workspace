"use client";

import { useEffect, useState, useMemo } from "react";
import { groupByParent } from "./lib";
import type { ResourceItem, DeptItem } from "./types";

function deptHasPerm(
  grants: Array<{ departmentId: number; resource: { key: string } | null; role: { key: string } | null }>,
  deptId: number,
  resourceKey: string,
  roleKey: string
): boolean {
  return grants.some(
    (g) =>
      g.departmentId === deptId &&
      g.resource?.key === resourceKey &&
      g.role?.key === roleKey
  );
}

export function useByDepartmentTab(
  resources: ResourceItem[],
  allDepts: DeptItem[],
  showToast: (msg: string, type?: "success" | "error") => void
) {
  const [grants, setGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCompany, setFilterCompany] = useState("");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/department-permissions");
        const data = await res.json();
        setGrants(data.grants || []);
      } catch (e) {
        console.error("ByDepartmentTab load failed:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function togglePerm(deptId: number, resourceKey: string, value: boolean) {
    try {
      const res = await fetch("/api/admin/department-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: String(deptId),
          resourceKey,
          roleKey: "access",
          value,
        }),
      });
      if (res.ok) {
        const grantRes = await fetch("/api/admin/department-permissions");
        const grantData = await grantRes.json();
        setGrants(grantData.grants || []);
        showToast(value ? "已授权" : "已撤销", "success");
      } else {
        const text = await res.text();
        let msg = `操作失败 (${res.status})`;
        try { msg = JSON.parse(text).error || msg; } catch { /* ignore */ }
        showToast(msg, "error");
      }
    } catch (e: any) {
      showToast(e?.message || "网络错误", "error");
    }
  }

  const companies = Array.from(
    new Set(allDepts.map((d) => d.company).filter(Boolean))
  ).sort();

  const filteredDepts = allDepts.filter((d) => {
    if (filterCompany && d.company !== filterCompany) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      return d.name.toLowerCase().includes(q);
    }
    return true;
  });

  const resourceGroups = useMemo(() => groupByParent(resources), [resources]);

  return {
    grants,
    loading,
    filterCompany,
    setFilterCompany,
    searchText,
    setSearchText,
    togglePerm,
    companies,
    filteredDepts,
    resourceGroups,
    deptHasPerm,
  };
}
