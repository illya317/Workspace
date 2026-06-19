"use client";

import { useEffect, useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { SelectField } from "@workspace/core/ui";

interface Dept {
  id: number;
  name: string;
  company: string;
}

export default function DepartmentSwitcher({ onChange }: { onChange?: (deptId: number | null) => void }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/workspace/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const u = data.user as SessionUser;
        setUser(u);
        if (u?.isWorkListAdmin) {
          const saved = localStorage.getItem("selectedDeptId");
          if (saved) setSelectedDeptId(parseInt(saved));
          fetch("/workspace/api/hr/departments")
            .then((r) => r.json())
            .then((d) => {
              const list = (d.departments || []) as Dept[];
              setDepts(list);
              const comps = [...new Set(list.map((d) => d.company).filter(Boolean))];
              setCompanies(comps);
              if (saved) {
                const savedDept = list.find((d) => d.id === parseInt(saved));
                if (savedDept) setSelectedCompany(savedDept.company);
              }
            });
        }
      });
  }, []);

  function handleCompanyChange(company: string) {
    setSelectedCompany(company);
    // 切换公司时不自动提交，等用户选部门
  }

  function handleDeptChange(deptId: number) {
    setSelectedDeptId(deptId);
    localStorage.setItem("selectedDeptId", String(deptId));
    if (onChange) onChange(deptId);
  }

  function clearSelection() {
    setSelectedCompany("");
    setSelectedDeptId(null);
    localStorage.removeItem("selectedDeptId");
    if (onChange) onChange(null);
  }

  if (!user) return null;

  // 非管理员：只显示当前部门文本
  if (!user.isWorkListAdmin) {
    return (
      <span className="ml-2 text-xs text-gray-500">
        {user.company} - {user.departmentName}
      </span>
    );
  }

  // 管理员：两个下拉框
  const deptsInCompany = depts.filter((d) => d.company === selectedCompany);
  return (
    <div className="flex items-center gap-2">
      <SelectField
        value={selectedCompany}
        onChange={handleCompanyChange}
        placeholder="选择公司"
        options={companies.map((c) => ({ value: c, label: c }))}
        selectClassName="min-w-24 px-2 py-1 text-xs"
      />
      <SelectField
        value={selectedDeptId == null ? "" : String(selectedDeptId)}
        onChange={(val) => {
          if (!val) clearSelection();
          else handleDeptChange(parseInt(String(val)));
        }}
        placeholder="选择部门"
        options={deptsInCompany.map((d) => ({
          value: String(d.id),
          label: d.id === selectedDeptId ? `${d.name}（当前）` : d.name,
        }))}
        selectClassName="min-w-28 px-2 py-1 text-xs"
      />
    </div>
  );
}
