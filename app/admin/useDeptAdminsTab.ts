"use client";

import { useEffect, useState, useRef } from "react";
import { FENGHUA_BIO_GROUP } from "@/lib/company";

interface EmployeeResult {
  rowId: number;
  employeeId: string;
  name: string;
  alias: string;
  dept1: string;
  position: string;
  userId: number | null;
}

interface DeptAdminUser {
  id: number;
  name: string;
}

interface DeptAdminEntry {
  id: number;
  userId: number;
  user: DeptAdminUser;
}

interface DeptItem {
  id: number;
  name: string;
  company: string;
  admins: DeptAdminEntry[];
}

export function useDeptAdminsTab(
  showToast: (msg: string, type?: "success" | "error") => void
) {
  const [deptData, setDeptData] = useState<DeptItem[]>([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [companyTab, setCompanyTab] = useState<"全部" | "丰华制药" | "丰华生物">("全部");

  const [deptAddOpen, setDeptAddOpen] = useState<number | null>(null);
  const [deptSearchQ, setDeptSearchQ] = useState("");
  const [deptResults, setDeptResults] = useState<EmployeeResult[]>([]);
  const [deptConfirm, setDeptConfirm] = useState<number | null>(null);
  const deptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadDeptAdmins() {
    try {
      const res = await fetch("/api/admin/department-admins");
      if (!res.ok) return;
      const data = await res.json();
      const depts = data.departments || [];
      const admins = data.admins || [];
      setDeptData(
        depts
          .map((d: any) => ({
            ...d,
            admins: admins.filter((a: any) => a.scopeId === String(d.id)),
          }))
          .sort((a: any, b: any) => {
            const ga = FENGHUA_BIO_GROUP.includes(a.company) ? "丰华生物" : a.company;
            const gb = FENGHUA_BIO_GROUP.includes(b.company) ? "丰华生物" : b.company;
            return ga.localeCompare(gb) || a.name.localeCompare(b.name);
          })
      );
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    (async () => {
      setDeptLoading(true);
      await loadDeptAdmins();
      setDeptLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!deptSearchQ.trim() || deptAddOpen === null) {
      setDeptResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/employees/search?q=${encodeURIComponent(deptSearchQ.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setDeptResults((data.items || []).filter((item: EmployeeResult) => item.userId != null));
        }
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [deptSearchQ, deptAddOpen]);

  function handleRemoveDeptAdmin(adminId: number) {
    if (deptConfirm === adminId) {
      removeDeptAdmin(adminId);
      setDeptConfirm(null);
      if (deptTimer.current) {
        clearTimeout(deptTimer.current);
        deptTimer.current = null;
      }
    } else {
      setDeptConfirm(adminId);
      if (deptTimer.current) clearTimeout(deptTimer.current);
      deptTimer.current = setTimeout(() => setDeptConfirm(null), 3000);
    }
  }

  async function addDeptAdmin(departmentId: number, userId: number, name: string) {
    const res = await fetch("/api/admin/department-admins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, userId }),
    });
    if (res.ok) {
      showToast(`已添加：${name}`, "success");
      setDeptAddOpen(null);
      setDeptSearchQ("");
      loadDeptAdmins();
    } else {
      const e = await res.json().catch(() => ({ error: "失败" }));
      showToast(e.error, "error");
    }
  }

  async function removeDeptAdmin(adminId: number) {
    const res = await fetch(`/api/admin/department-admins?id=${adminId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("已移除", "success");
      loadDeptAdmins();
    } else {
      const e = await res.json().catch(() => ({ error: "失败" }));
      showToast(e.error, "error");
    }
  }

  const filteredDepts =
    companyTab === "全部"
      ? deptData
      : companyTab === "丰华制药"
        ? deptData.filter((d) => d.company === "丰华制药")
        : deptData.filter((d) => FENGHUA_BIO_GROUP.includes(d.company));

  return {
    deptLoading,
    companyTab,
    setCompanyTab,
    deptAddOpen,
    setDeptAddOpen,
    deptSearchQ,
    setDeptSearchQ,
    deptResults,
    deptConfirm,
    handleRemoveDeptAdmin,
    addDeptAdmin,
    filteredDepts,
  };
}
