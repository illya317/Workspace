"use client";

import { useEffect, useState, useCallback } from "react";
import HRToolbar from "@/app/components/HRToolbar";
import SearchBox from "@/app/components/SearchBox";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

import type { HRUser as User, RosterEmployee as Employee } from "../types";

interface FieldDef {
  key: string;
  label: string;
}

export default function RosterTab({ user: _user, selectedCompany }: { user: User; selectedCompany: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);
  const [, setAllDepts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sortField, setSortField] = useState<string>("employeeId");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { toast, closeToast } = useToast();
  const [rosterFilter, setRosterFilter] = useState<"在职" | "离职">("在职");
  const [resetKey, setResetKey] = useState(0);

  const loadRoster = useCallback(async (deptOverride?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company", selectedCompany);
    const deptParam = deptOverride !== undefined ? deptOverride : filterDept;
    if (deptParam) params.set("dept", deptParam);
    if (keyword) params.set("keyword", keyword);
    params.set("status", rosterFilter);
    const res = await fetch(`/workspace/api/hr/roster?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setEmployees(data.employees || []);
      setFields(data.fields || []);
      setVisibleFields(data.visibleFields || []);
      setAllDepts(data.allDepts || []);
    }
    setLoading(false);
  }, [selectedCompany, filterDept, rosterFilter, keyword]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  function downloadExcel() {
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company", selectedCompany);
    if (filterDept) params.set("dept", filterDept);
    if (keyword) params.set("keyword", keyword);
    params.set("status", rosterFilter);
    params.set("export", "1");
    const url = `/api/hr/roster?${params.toString()}`;
    window.open(url, "_blank");
  }

  const displayFields = fields.filter((f) => visibleFields.includes(f.key));

  const sortedEmployees = [...employees].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortField] ?? "");
    const bVal = String((b as unknown as Record<string, unknown>)[sortField] ?? "");
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return a.employeeId.localeCompare(b.employeeId);
  });

  const mergeInfo = (() => {
    const info = new Map<number, Record<string, { rowspan: number; skip: boolean }>>();
    let i = 0;
    while (i < sortedEmployees.length) {
      const emp = sortedEmployees[i];
      let j = i + 1;
      while (j < sortedEmployees.length && sortedEmployees[j].employeeId === emp.employeeId) {
        j++;
      }
      const group = sortedEmployees.slice(i, j);
      if (group.length > 1) {
        for (const field of displayFields) {
          const key = field.key;
          const values = group.map((e) => (e as unknown as Record<string, unknown>)[key]);
          const allSame = values.every((v) => v === values[0]);
          if (allSame) {
            group.forEach((_, idx) => {
              const globalIdx = i + idx;
              const map = info.get(globalIdx) || {};
              map[key] = { rowspan: group.length, skip: idx !== 0 };
              info.set(globalIdx, map);
            });
          }
        }
      }
      i = j;
    }
    return info;
  })();

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  return (
    <div className="space-y-4">
      <HRToolbar
        rosterFilter={rosterFilter} onRosterChange={setRosterFilter}
        keyword={keyword} onKeywordChange={setKeyword}
        onKeywordEnter={loadRoster}
        onReset={() => { setFilterDept(""); setKeyword(""); setRosterFilter("在职"); setResetKey((k) => k + 1); loadRoster(); }}
      >
        <div className="w-48">
          <SearchBox key={resetKey} config={{ target: "department" }}
            placeholder="部门筛选"
            onSelect={(item: { name: string }) => setFilterDept(item.name)}
            renderItem={(item: { name: string }) => <span>{item.name}</span>} />
        </div>
        <button onClick={downloadExcel}
          className="rounded-md border border-emerald-300 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50">
          下载Excel
        </button>
      </HRToolbar>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : employees.length === 0 ? (
          <p className="p-8 text-center text-gray-500">暂无数据</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600">序号</th>
                {displayFields.map((f) => (
                  <th
                    key={f.key}
                    onClick={() => toggleSort(f.key)}
                    className="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600 hover:bg-gray-100 select-none"
                  >
                    <span className="flex items-center gap-1">
                      {f.label}
                      {sortField === f.key && (
                        <span className="text-emerald-500">{sortDirection === "asc" ? "↑" : "↓"}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let seq = 0;
                let lastEmpId = "";
                return sortedEmployees.map((emp, rowIndex) => {
                  if (emp.employeeId !== lastEmpId) {
                    seq++;
                    lastEmpId = emp.employeeId;
                  }
                  const empMerge = mergeInfo.get(rowIndex) || {};
                  return (
                    <tr key={`${emp.employeeId}-${rowIndex}`} className={`border-b last:border-0 hover:bg-gray-50 ${emp.status === "离职" ? "bg-gray-100" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-500">{seq}</td>
                      {displayFields.map((f) => {
                      const merge = empMerge[f.key];
                      if (merge?.skip) return null;
                      const val = String((emp as unknown as Record<string, unknown>)[f.key] ?? "");
                      const rowSpan = merge?.rowspan && merge.rowspan > 1 ? merge.rowspan : undefined;
                      return (
                        <td
                          key={f.key}
                          rowSpan={rowSpan}
                          className="whitespace-nowrap px-3 py-2 text-gray-700"
                        >
                          {val || "-"}
                        </td>
                      );
                    })}
                  </tr>
                );
              });
            })()}
            </tbody>
          </table>
        )}
      </div>
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
