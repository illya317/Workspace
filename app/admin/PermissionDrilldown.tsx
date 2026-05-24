"use client";

import { useMemo } from "react";
import { matchEmployee } from "@/lib/search";
import { resolveCompanyFilter } from "@/lib/company";
import FilterBar from "@/app/components/FilterBar";

export interface EmployeePerm {
  employeeId: string; name: string; userId: number | null; username: string | null;
  permissions: string[]; canLogin: boolean; hasApiKey: boolean;
  roles: Array<{ company: string | null; dept1: string | null; position: string | null }>;
  resourceRoles: Array<{ resource: { key: string; name: string } | null; role: { key: string; name: string } | null }>;
}

interface Props {
  drillKey: string;
  empPerms: EmployeePerm[]; empLoading: boolean;
  fCompany: string; fDept: string; fKeyword: string;
  setFCompany: (v: string) => void; setFDept: (v: string) => void; setFKeyword: (v: string) => void;
  allCompanies: string[]; allDepts: string[];
  onToggle: (emp: EmployeePerm) => void;
  onClose: () => void;
  empHasAccess: (emp: EmployeePerm, key: string) => boolean;
}

export default function PermissionDrilldown({ drillKey, empPerms, empLoading, fCompany, fDept, fKeyword,
  setFCompany, setFDept, setFKeyword, allCompanies, allDepts, onToggle, onClose, empHasAccess,
}: Props) {
  const filtered = useMemo(() => empPerms.filter(emp => {
    if (fCompany !== "全部" && !emp.roles.some(r => resolveCompanyFilter(fCompany).includes(r.company || "" || ""))) return false;
    if (fDept !== "全部" && !emp.roles.some(r => r.dept1 === fDept)) return false;
    if (fKeyword && !matchEmployee(emp, fKeyword)) return false;
    return true;
  }).sort((a, b) => {
    const aHas = empHasAccess(a, drillKey) ? 0 : 1;
    const bHas = empHasAccess(b, drillKey) ? 0 : 1;
    return aHas - bHas;
  }), [empPerms, fCompany, fDept, fKeyword, drillKey]);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-800">人员 · {drillKey}</h2>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">关闭</button>
      </div>
      <FilterBar>
        <select value={fCompany} onChange={e => { setFCompany(e.target.value); setFDept("全部"); }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
          {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fDept} onChange={e => setFDept(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="text" value={fKeyword} onChange={e => setFKeyword(e.target.value)}
          placeholder="搜索姓名/工号..." className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
      </FilterBar>
      {empLoading ? <p className="py-4 text-center text-sm text-gray-500">加载中...</p> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map(emp => {
            const has = empHasAccess(emp, drillKey);
            return (
              <button key={emp.employeeId} onClick={() => onToggle(emp)}
                className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                  has ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}>
                <div className="font-medium text-gray-800">{emp.name}</div>
                <div className="text-gray-400">{emp.employeeId}</div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
