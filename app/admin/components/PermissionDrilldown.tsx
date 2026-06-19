"use client";

import { useMemo, useState, useEffect } from "react";
import { matchEmployee } from "@workspace/platform/search";
import FilterBar from "@workspace/core/ui/FilterBar";
import SelectField from "@workspace/core/ui/SelectField";
import { SearchInput } from "@workspace/core/ui";

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
  const [companyMap, setCompanyMap] = useState<Map<string, { name: string; managementGroup: string }>>(new Map());

  useEffect(() => {
    fetch("/workspace/api/hr/companies?active=1")
      .then((r) => r.json())
      .then((data) => {
        const map = new Map<string, { name: string; managementGroup: string }>();
        for (const c of data.companies || []) {
          map.set(c.name, c);
        }
        setCompanyMap(map);
      });
  }, []);

  const filtered = useMemo(() => empPerms.filter(emp => {
    if (fCompany !== "全部") {
      const target = companyMap.get(fCompany);
      if (!target) return false;
      const mgmt = target.managementGroup;
      const allowed = new Set(
        Array.from(companyMap.values())
          .filter((c) => c.managementGroup === mgmt)
          .map((c) => c.name)
      );
      if (!emp.roles.some(r => allowed.has(r.company || ""))) return false;
    }
    if (fDept !== "全部" && !emp.roles.some(r => r.dept1 === fDept)) return false;
    if (fKeyword && !matchEmployee(emp, fKeyword)) return false;
    return true;
  }).sort((a, b) => {
    const aHas = empHasAccess(a, drillKey) ? 0 : 1;
    const bHas = empHasAccess(b, drillKey) ? 0 : 1;
    return aHas - bHas;
  }), [empPerms, fCompany, fDept, fKeyword, drillKey, empHasAccess, companyMap]);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-800">人员 · {drillKey}</h2>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">关闭</button>
      </div>
      <FilterBar>
        <SelectField
          value={fCompany}
          onChange={(nextValue) => { setFCompany(nextValue); setFDept("全部"); }}
          options={allCompanies.map((c) => ({ value: c, label: c }))}
          size="toolbar"
          selectClassName="min-w-40"
        />
        <SelectField
          value={fDept}
          onChange={setFDept}
          options={allDepts.map((d) => ({ value: d, label: d }))}
          size="toolbar"
          selectClassName="min-w-40"
        />
        <SearchInput
          value={fKeyword}
          onChange={setFKeyword}
          placeholder="搜索姓名/工号..."
          size="toolbar"
          className="min-w-0 sm:w-[22rem]"
        />
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
