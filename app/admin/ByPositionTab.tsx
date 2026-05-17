"use client";

import { useEffect, useState } from "react";
import FilterBar from "@/app/components/FilterBar";
import { isTopLevelResource } from "./page";

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
  resources: Array<{ id: number; key: string; name: string; description: string | null }>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

function positionHasPerm(
  grants: Array<{ positionId: number; resource: { key: string } | null; role: { key: string } | null }>,
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

export default function ByPositionTab({ user, resources, showToast }: Props) {
  const [positions, setPositions] = useState<Array<{ id: number; code: string; name: string; company: string; headcount: number }>>([]);
  const [grants, setGrants] = useState<any[]>([]);
  const [positionDeptMap, setPositionDeptMap] = useState<Map<number, string[]>>(new Map());
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

  async function togglePerm(positionId: number, resourceKey: string, value: boolean) {
    try {
      const res = await fetch("/api/admin/position-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId, resourceKey, roleKey: "access", value }),
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

  const topResources = resources.filter((r) => isTopLevelResource(r.key));

  if (loading) {
    return <p className="text-sm text-gray-500">加载中...</p>;
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <select
          value={filterCompany}
          onChange={(e) => {
            setFilterCompany(e.target.value);
            setFilterDept("");
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">全部公司</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">全部部门</option>
          {allDeptNames.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="搜索岗位编码/名称..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        />
      </FilterBar>

      {filteredPositions.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">暂无数据</p>
      )}

      {filteredPositions.map((pos) => {
        const depts = positionDeptMap.get(pos.id) || [];
        return (
          <div key={pos.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="mr-2 text-xs text-gray-400">{pos.code}</span>
                <span className="font-medium text-gray-800">{pos.name}</span>
                <span className="ml-2 text-xs text-gray-400">{pos.company}</span>
                {depts.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    ({depts.join(", ")})
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">{pos.headcount}人</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topResources.map((r) => {
                const has = positionHasPerm(grants, pos.id, r.key, "access");
                return (
                  <button
                    key={r.key}
                    onClick={() => togglePerm(pos.id, r.key, !has)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      has
                        ? "border border-emerald-300 bg-emerald-100 text-emerald-700"
                        : "border border-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200"
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
