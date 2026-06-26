"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { InputControl } from "@workspace/core/ui";

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
    fetch(workspacePath("/api/auth/me"))
      .then((r) => r.json())
      .then((data) => {
        const u = data.user as SessionUser;
        setUser(u);
        if (u?.isWorkListAdmin) {
          const saved = localStorage.getItem("selectedDeptId");
          if (saved) setSelectedDeptId(parseInt(saved));
          fetch(workspacePath("/api/modules/hr/roster/departments"))
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
      <InputControl
        spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: companies.map((c) => ({ value: c, label: c })) } }}
        value={selectedCompany}
        onChange={(value) => handleCompanyChange(String(value ?? ""))}
        placeholder="选择公司"
      />
      <InputControl
        spec={{ valueType: "reference", editor: "select", options: { source: "static", mode: "dropdown", items: deptsInCompany.map((d) => ({ value: String(d.id), label: d.id === selectedDeptId ? `${d.name}（当前）` : d.name })) } }}
        value={selectedDeptId == null ? "" : String(selectedDeptId)}
        onChange={(val) => {
          if (!val) clearSelection();
          else handleDeptChange(parseInt(String(val)));
        }}
        placeholder="选择部门"
      />
    </div>
  );
}
