"use client";

import { useEffect, useState } from "react";

interface Dept {
  id: number;
  name: string;
  company: string;
}

interface UserInfo {
  name: string;
  company: string | null;
  departmentName: string | null;
  departmentId: number;
  isWorkListAdmin: boolean;
}

export default function DepartmentSwitcher() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const u = data.user as UserInfo;
        setUser(u);
        if (u?.isWorkListAdmin) {
          const saved = localStorage.getItem("selectedDeptId");
          if (saved) setSelectedDeptId(parseInt(saved));
          fetch("/api/departments")
            .then((r) => r.json())
            .then((d) => {
              const list = (d.departments || []) as Dept[];
              setDepts(list);
              const comps = [
                ...new Set(list.map((d) => d.company).filter((c) => c === "丰华生物" || c === "丰华制药")),
              ];
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
    window.location.reload();
  }

  function clearSelection() {
    setSelectedCompany("");
    setSelectedDeptId(null);
    localStorage.removeItem("selectedDeptId");
    window.location.reload();
  }

  if (!user) return null;

  const selectCls =
    "rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-emerald-400 focus:outline-none";

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
  const savedLabel = selectedDeptId
    ? depts.find((d) => d.id === selectedDeptId)?.name
    : null;

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedCompany}
        onChange={(e) => handleCompanyChange(e.target.value)}
        className={selectCls}
      >
        <option value="">选择公司</option>
        {companies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={selectedDeptId ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          if (!val) clearSelection();
          else handleDeptChange(parseInt(val));
        }}
        className={selectCls}
      >
        <option value="">选择部门</option>
        {deptsInCompany.map((d) => (
          <option key={d.id} value={d.id}>
            {d.id === selectedDeptId ? `${d.name}（当前）` : d.name}
          </option>
        ))}
      </select>
    </div>
  );
}
