"use client";

import { useEffect, useState, useRef } from "react";
import { isTopLevelResource } from "./page";
import { FENGHUA_BIO_GROUP } from "@/lib/company";

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
  resources: Array<{ id: number; key: string; name: string; description: string | null; userCount?: number }>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

interface EmployeeResult {
  rowId: number; employeeId: string; name: string; alias: string;
  dept1: string; position: string; userId: number | null;
}

export default function ByPermissionTab({ user, resources, showToast }: Props) {
  const topResources = resources.filter((r) => isTopLevelResource(r.key));

  const [systemAdmins, setSystemAdmins] = useState<Array<{ id: number; name: string; username: string }>>([]);
  const [deptData, setDeptData] = useState<Array<{ id: number; name: string; company: string; admins: Array<{ id: number; userId: number; user: { id: number; name: string; username: string } }> }>>([]);
  const [loading, setLoading] = useState(true);
  const [companyTab, setCompanyTab] = useState<"全部" | "丰华制药" | "丰华生物">("全部");

  // Search states
  const [sysSearchQ, setSysSearchQ] = useState("");
  const [sysResults, setSysResults] = useState<EmployeeResult[]>([]);
  const [sysConfirm, setSysConfirm] = useState<number | null>(null);
  const sysTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deptAddOpen, setDeptAddOpen] = useState<number | null>(null);
  const [deptSearchQ, setDeptSearchQ] = useState("");
  const [deptResults, setDeptResults] = useState<EmployeeResult[]>([]);
  const [deptConfirm, setDeptConfirm] = useState<number | null>(null);
  const deptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load data
  async function loadAll() {
    setLoading(true);
    await Promise.all([loadSystemAdmins(), loadDeptAdmins()]);
    setLoading(false);
  }

  async function loadSystemAdmins() {
    if (!user.isWorkListAdmin) return;
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setSystemAdmins((data.users || []).filter((u: any) =>
          u.resourceRoles?.some((rr: any) => rr.resource?.key === "system" && rr.role?.key === "admin")
        ).map((u: any) => ({ id: u.id, name: u.name, username: u.username })));
      }
    } catch (e) { console.error(e); }
  }

  async function loadDeptAdmins() {
    try {
      const res = await fetch("/api/admin/department-admins");
      if (!res.ok) return;
      const data = await res.json();
      const depts = data.departments || [];
      const admins = data.admins || [];
      setDeptData(depts.map((d: any) => ({
        ...d, admins: admins.filter((a: any) => a.scopeId === String(d.id))
      })).sort((a: any, b: any) => {
        const ga = FENGHUA_BIO_GROUP.includes(a.company) ? "丰华生物" : a.company;
        const gb = FENGHUA_BIO_GROUP.includes(b.company) ? "丰华生物" : b.company;
        return ga.localeCompare(gb) || a.name.localeCompare(b.name);
      }));
    } catch (e) { console.error(e); }
  }

  useEffect(() => { loadAll(); }, []);

  // Debounced system admin search
  useEffect(() => {
    if (!sysSearchQ.trim()) { setSysResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/employees/search?q=${encodeURIComponent(sysSearchQ.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSysResults((data.items || []).filter((item: EmployeeResult) => item.userId != null));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [sysSearchQ]);

  // Debounced department admin search
  useEffect(() => {
    if (!deptSearchQ.trim() || deptAddOpen === null) { setDeptResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/employees/search?q=${encodeURIComponent(deptSearchQ.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setDeptResults((data.items || []).filter((item: EmployeeResult) => item.userId != null));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [deptSearchQ, deptAddOpen]);

  // Confirm helpers
  function confirmRemove(id: number, cur: number | null, set: (v: number | null) => void, timer: typeof sysTimer) {
    if (cur === id) { set(null); if (timer.current) clearTimeout(timer.current); return true; }
    set(id); if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set(null), 3000);
    return false;
  }

  async function addSystemAdmin(userId: number, name: string) {
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceKey: "system", roleKey: "admin", value: true }),
    });
    if (res.ok) { showToast(`已添加：${name}`, "success"); setSysSearchQ(""); loadSystemAdmins(); }
    else { const e = await res.json().catch(() => ({ error: "失败" })); showToast(e.error, "error"); }
  }

  async function removeSystemAdmin(userId: number) {
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceKey: "system", roleKey: "admin", value: false }),
    });
    if (res.ok) { showToast("已移除", "success"); loadSystemAdmins(); }
    else { const e = await res.json().catch(() => ({ error: "失败" })); showToast(e.error, "error"); }
  }

  async function addDeptAdmin(departmentId: number, userId: number, name: string) {
    const res = await fetch("/api/admin/department-admins", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, userId }),
    });
    if (res.ok) { showToast(`已添加：${name}`, "success"); setDeptAddOpen(null); setDeptSearchQ(""); loadDeptAdmins(); }
    else { const e = await res.json().catch(() => ({ error: "失败" })); showToast(e.error, "error"); }
  }

  async function removeDeptAdmin(adminId: number) {
    const res = await fetch(`/api/admin/department-admins?id=${adminId}`, { method: "DELETE" });
    if (res.ok) { showToast("已移除", "success"); loadDeptAdmins(); }
    else { const e = await res.json().catch(() => ({ error: "失败" })); showToast(e.error, "error"); }
  }

  const filteredDepts = companyTab === "全部" ? deptData
    : companyTab === "丰华制药" ? deptData.filter((d) => d.company === "丰华制药")
    : deptData.filter((d) => FENGHUA_BIO_GROUP.includes(d.company));

  return (
    <div className="space-y-6">
      {/* Section 1: Overview */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">全局权限概览</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topResources.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">{r.name}</h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{r.userCount ?? 0} 人</span>
              </div>
              {r.description && <p className="mt-1 text-xs text-gray-500">{r.description}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: System Admins */}
      {user.isWorkListAdmin && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-800">系统管理员</h2>
            <span className="text-sm text-gray-500">({systemAdmins.length} 人)</span>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            {loading ? <p className="py-4 text-center text-sm text-gray-500">加载中...</p> : (
              <>
                {systemAdmins.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {systemAdmins.map((a) => {
                      const confirming = sysConfirm === a.id;
                      return (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                          {a.name} <span className="text-xs text-gray-400">({a.username})</span>
                          <button type="button"
                            onClick={() => { if (confirmRemove(a.id, sysConfirm, setSysConfirm, sysTimer)) removeSystemAdmin(a.id); }}
                            className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${confirming ? "bg-red-100 text-red-600" : "text-gray-400 hover:bg-red-50 hover:text-red-500"}`}
                          >{confirming ? "?" : "×"}</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="relative">
                  <input type="text" value={sysSearchQ} onChange={(e) => setSysSearchQ(e.target.value)}
                    placeholder="搜索员工姓名/工号添加管理员..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                  {sysSearchQ.trim() && sysResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                      <div className="max-h-48 overflow-y-auto">
                        {sysResults.map((emp) => (
                          <div key={`${emp.rowId}-${emp.employeeId}`} onClick={() => addSystemAdmin(emp.userId!, emp.name)}
                            className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50">
                            <span className="font-medium text-gray-800">{emp.name}</span>
                            <span className="text-xs text-gray-400">{emp.employeeId}{emp.dept1 ? ` · ${emp.dept1}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Section 3: Department Admins */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">部门管理员</h2>
        <div className="mb-3 flex gap-2">
          {(["全部", "丰华制药", "丰华生物"] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => setCompanyTab(tab)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${companyTab === tab ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >{tab}</button>
          ))}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
          {loading ? <p className="py-8 text-center text-sm text-gray-500">加载中...</p> :
            filteredDepts.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">暂无部门</p> :
            filteredDepts.map((dept) => (
              <div key={dept.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{dept.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{dept.company}</span>
                  </div>
                  <button type="button" onClick={() => setDeptAddOpen(deptAddOpen === dept.id ? null : dept.id)}
                    className="text-xs text-emerald-600 hover:text-emerald-800">
                    {deptAddOpen === dept.id ? "取消" : "添加"}
                  </button>
                </div>
                {dept.admins.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {dept.admins.map((a) => {
                      const confirming = deptConfirm === a.id;
                      return (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">
                          {a.user.name}
                          <button type="button"
                            onClick={() => { if (confirmRemove(a.id, deptConfirm, setDeptConfirm, deptTimer)) removeDeptAdmin(a.id); }}
                            className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold ${confirming ? "bg-red-100 text-red-600" : "text-gray-400 hover:bg-red-50 hover:text-red-500"}`}
                          >{confirming ? "?" : "×"}</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {deptAddOpen === dept.id && (
                  <div className="relative mt-2">
                    <input type="text" value={deptSearchQ} onChange={(e) => setDeptSearchQ(e.target.value)}
                      placeholder="搜索员工姓名/工号..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                    {deptSearchQ.trim() && deptResults.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                        <div className="max-h-40 overflow-y-auto">
                          {deptResults.map((emp) => (
                            <div key={`${emp.rowId}-${emp.employeeId}`} onClick={() => addDeptAdmin(dept.id, emp.userId!, emp.name)}
                              className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50">
                              <span className="font-medium text-gray-800">{emp.name}</span>
                              <span className="text-xs text-gray-400">{emp.employeeId}{emp.dept1 ? ` · ${emp.dept1}` : ""}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
