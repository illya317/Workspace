"use client";

import { useEffect, useState } from "react";
import FilterBar from "@/app/components/FilterBar";
import SearchBox from "@/app/components/SearchBox";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

interface User {
  id: number;
  name: string;
  canAccessHR: boolean;
  isWorkListAdmin: boolean;
  company?: string | null;
}

interface Employee {
  id: number;
  employeeId: string;
  name: string;
  company: string | null;
  center: string | null;
  dept1: string | null;
  dept2: string | null;
  position: string | null;
  gender: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  majorRelevant: string | null;
  phone: string | null;
  office1: string | null;
  office2: string | null;
  office3: string | null;
  attendance1: string | null;
  attendance2: string | null;
  joinDate: string | null;
  nature: string | null;
  status?: string | null;
  leaveDate?: string | null;
  alias?: string | null;
  deleted?: boolean | null;
  deletedTime?: string | null;
  deletedBy?: string | null;
}

interface FieldDef {
  key: string;
  label: string;
}

export default function RosterTab({ user, selectedCompany }: { user: User; selectedCompany: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [visibleFields, setVisibleFields] = useState<string[]>([]);
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sortField, setSortField] = useState<string>("employeeId");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { toast, showToast, closeToast } = useToast();
  const [rosterFilter, setRosterFilter] = useState<"在职" | "离职">("在职");
  const [resetKey, setResetKey] = useState(0);

  async function loadRoster(deptOverride?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company", selectedCompany);
    const deptParam = deptOverride !== undefined ? deptOverride : filterDept;
    if (deptParam) params.set("dept", deptParam);
    if (keyword) params.set("keyword", keyword);
    params.set("status", rosterFilter);
    const res = await fetch(`/api/employees?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setEmployees(data.employees || []);
      setFields(data.fields || []);
      setVisibleFields(data.visibleFields || []);
      setAllDepts(data.allDepts || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRoster();
  }, [selectedCompany, filterDept, rosterFilter, keyword]);

  function downloadExcel() {
    const params = new URLSearchParams();
    if (selectedCompany) params.set("company", selectedCompany);
    if (filterDept) params.set("dept", filterDept);
    if (keyword) params.set("keyword", keyword);
    params.set("status", rosterFilter);
    params.set("export", "1");
    const url = `/api/employees?${params.toString()}`;
    window.open(url, "_blank");
  }

  const displayFields = fields.filter((f) => visibleFields.includes(f.key));

  const sortedEmployees = [...employees].sort((a, b) => {
    const aVal = (a as any)[sortField] || "";
    const bVal = (b as any)[sortField] || "";
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
          const values = group.map((e) => (e as any)[key]);
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
      <FilterBar>
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          <button
            onClick={() => { setRosterFilter("在职"); }}
            className={`px-3 py-1.5 text-sm ${rosterFilter === "在职" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            在职
          </button>
          <button
            onClick={() => { setRosterFilter("离职"); }}
            className={`px-3 py-1.5 text-sm ${rosterFilter === "离职" ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            离职
          </button>
        </div>
        <div className="w-48">
          <SearchBox
            key={resetKey}
            config={{ target: "department" }}
            placeholder="部门筛选"
            onSelect={(item: { name: string }) => {
              setFilterDept(item.name);
            }}
            renderItem={(item: { name: string }) => <span>{item.name}</span>}
          />
        </div>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") loadRoster(); }}
          placeholder="姓名筛选"
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
        />
        <button
          onClick={() => { setFilterDept(""); setKeyword(""); setRosterFilter("在职"); setResetKey((k) => k + 1); loadRoster(); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          重置
        </button>
        <button
          onClick={downloadExcel}
          className="rounded-md border border-emerald-300 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50"
        >
          下载Excel
        </button>
      </FilterBar>

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
                      const val = (emp as any)[f.key] || "";
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
      <Toast message={toast?.message || ""} type={toast?.type as any} show={!!toast} onClose={closeToast} />
    </div>
  );
}
