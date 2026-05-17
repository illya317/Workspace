"use client";

import { useEffect, useState, useRef } from "react";
import { isTopLevelResource } from "./page";
import { FENGHUA_BIO_GROUP } from "@/lib/company";

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
  resources: Array<{ id: number; key: string; name: string; description: string | null; userCount?: number }>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

interface SystemAdminUser {
  id: number;
  name: string;
  username: string;
}

interface EmployeeResult {
  rowId: number;
  employeeId: string;
  name: string;
  alias: string;
  dept1: string;
  position: string;
  userId: number | null;
}

interface DeptWithAdmins {
  id: number;
  name: string;
  company: string;
  admins: Array<{ id: number; userId: number; user: { id: number; name: string; username: string } }>;
}

export default function ByPermissionTab({ user, resources, showToast }: Props) {
  // ── Global Access Overview ──
  const topResources = resources.filter((r) => isTopLevelResource(r.key));

  // ── System Administrators ──
  const [systemAdmins, setSystemAdmins] = useState<SystemAdminUser[]>([]);
  const [sysLoading, setSysLoading] = useState(false);
  const [sysSearchQ, setSysSearchQ] = useState("");
  const [sysResults, setSysResults] = useState<EmployeeResult[]>([]);
  const [sysSearching, setSysSearching] = useState(false);
  const [sysConfirm, setSysConfirm] = useState<number | null>(null);
  const sysConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Department Administrators ──
  const [deptData, setDeptData] = useState<DeptWithAdmins[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [companyTab, setCompanyTab] = useState<"全部" | "丰华制药" | "丰华生物">("全部");
  const [deptAddOpen, setDeptAddOpen] = useState<number | null>(null);
  const [deptSearchQ, setDeptSearchQ] = useState("");
  const [deptResults, setDeptResults] = useState<EmployeeResult[]>([]);
  const [deptSearching, setDeptSearching] = useState(false);
  const [deptConfirm, setDeptConfirm] = useState<number | null>(null);
  const deptConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data Loading ──
  async function loadSystemAdmins() {
    if (!user.isWorkListAdmin) return;
    setSysLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setSystemAdmins(
        (data.users || [])
          .filter((u: any) =>
            u.resourceRoles?.some(
              (rr: any) => rr.resource?.key === "system" && rr.role?.key === "admin"
            )
          )
          .map((u: any) => ({ id: u.id, name: u.name, username: u.username }))
      );
    } catch (e: any) {
      showToast(e.message || "加载系统管理员失败", "error");
    } finally {
      setSysLoading(false);
    }
  }

  async function loadDeptAdmins() {
    setDeptLoading(true);
    try {
      const res = await fetch("/api/admin/department-admins");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      const depts: Array<{ id: number; name: string; company: string }> = data.departments || [];
      const admins = data.admins || [];
      setDeptData(
        depts
          .map((d) => ({ ...d, admins: admins.filter((a: any) => a.scopeId === String(d.id)) }))
          .sort((a, b) => {
            const ga = FENGHUA_BIO_GROUP.includes(a.company) ? "丰华生物" : a.company;
            const gb = FENGHUA_BIO_GROUP.includes(b.company) ? "丰华生物" : b.company;
            return ga.localeCompare(gb) || a.name.localeCompare(b.name);
          })
      );
    } catch (e: any) {
      showToast(e.message || "加载部门管理员失败", "error");
    } finally {
      setDeptLoading(false);
    }
  }

  useEffect(() => { loadSystemAdmins(); loadDeptAdmins(); }, []);

  // ── Shared search helper ──
  function useDebouncedSearch(q: string, setResults: (r: EmployeeResult[]) => void, setSearching: (v: boolean) => void) {
    useEffect(() => {
      if (!q.trim()) { setResults([]); return; }
      setSearching(true);
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/employees/search?q=${encodeURIComponent(q.trim())}`);
          if (res.ok) {
            const data = await res.json();
            setResults((data.items || []).filter((item: EmployeeResult) => item.userId != null));
          }
        } catch { /* ignore */ }
        finally { setSearching(false); }
      }, 300);
      return () => clearTimeout(timer);
    }, [q]);
  }

  useDebouncedSearch(sysSearchQ, setSysResults, setSysSearching);
  useDebouncedSearch(deptAddOpen !== null ? deptSearchQ : "", setDeptResults, setDeptSearching);

  // ── System Admin Actions ──
  function confirmRemove(id: number, cur: number | null, set: (v: number | null) => void, timer: typeof sysConfirmTimer) {
    if (cur === id) {
      set(null);
      if (timer.current) clearTimeout(timer.current);
      return true;
    }
    set(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set(null), 3000);
    return false;
  }

  async function addSystemAdmin(userId: number, name: string) {
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceKey: "system", roleKey: "admin", value: true }),
    });
    if (res.ok) {
      showToast(`已添加系统管理员：${name}`, "success");
      setSysSearchQ("");
      loadSystemAdmins();
    } else {
      const err = await res.json().catch(() => ({ error: "操作失败" }));
      showToast(err.error || "添加失败", "error");
    }
  }

  async function removeSystemAdmin(userId: number) {
    const res = await fetch("/api/admin/user-permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceKey: "system", roleKey: "admin", value: false }),
    });
    if (res.ok) { showToast("已移除系统管理员权限", "success"); loadSystemAdmins(); }
    else { const err = await res.json().catch(() => ({ error: "操作失败" })); showToast(err.error || "移除失败", "error"); }
  }

  // ── Department Admin Actions ──
  function openDeptAdd(deptId: number) {
    if (deptAddOpen === deptId) { setDeptAddOpen(null); setDeptSearchQ(""); }
    else { setDeptAddOpen(deptId); setDeptSearchQ(""); setDeptResults([]); }
  }

  async function addDeptAdmin(departmentId: number, userId: number, name: string) {
    const res = await fetch("/api/admin/department-admins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, userId }),
    });
    if (res.ok) {
      showToast(`已添加部门管理员：${name}`, "success");
      setDeptAddOpen(null); setDeptSearchQ("");
      loadDeptAdmins();
    } else {
      const err = await res.json().catch(() => ({ error: "操作失败" }));
      showToast(err.error || "添加失败", "error");
    }
  }

  async function removeDeptAdmin(adminRecordId: number) {
    const res = await fetch(`/api/admin/department-admins?id=${adminRecordId}`, { method: "DELETE" });
    if (res.ok) { showToast("已移除部门管理员", "success"); loadDeptAdmins(); }
    else { const err = await res.json().catch(() => ({ error: "操作失败" })); showToast(err.error || "移除失败", "error"); }
  }

  // ── Department Filtering ──
  const filteredDepts =
    companyTab === "全部" ? deptData
      : companyTab === "丰华制药" ? deptData.filter((d) => d.company === "丰华制药")
      : deptData.filter((d) => FENGHUA_BIO_GROUP.includes(d.company));

  // ── Search result dropdown (reusable) ──
  function SearchDropdown({ results, searching, onSelect }: {
    results: EmployeeResult[]; searching: boolean;
    onSelect: (emp: EmployeeResult) => void;
  }) {
    if (searching) return <p className="px-3 py-2 text-sm text-gray-400">搜索中...</p>;
    if (results.length === 0) return <p className="px-3 py-2 text-sm text-gray-400">无匹配结果</p>;
    return (
      <ul className="max-h-48 overflow-y-auto">
        {results.map((emp) => (
          <li key={`${emp.rowId}-${emp.employeeId}`}
            onClick={() => onSelect(emp)}
            className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50">
            <span>
              <span className="font-medium text-gray-800">{emp.name}</span>
              {emp.alias && <span className="ml-1 text-gray-400">({emp.alias})</span>}
            </span>
            <span className="text-xs text-gray-400">{emp.employeeId}{emp.dept1 ? ` · ${emp.dept1}` : ""}</span>
          </li>
        ))}
      </ul>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Section 1: Global Access Overview */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">全局权限概览</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topResources.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">{r.name}</h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  {r.userCount ?? 0} 人
                </span>
              </div>
              {r.description && <p className="mt-1 text-xs text-gray-500">{r.description}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: System Administrators */}
      {user.isWorkListAdmin && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-800">系统管理员</h2>
            {!sysLoading && <span className="text-sm text-gray-500">({systemAdmins.length} 人)</span>}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            {sysLoading ? (
              <p className="py-4 text-center text-sm text-gray-500">加载中...</p>
            ) : (
              <>
                {systemAdmins.length === 0 ? (
                  <p className="mb-3 text-sm text-gray-400">暂无系统管理员</p>
                ) : (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {systemAdmins.map((a) => {
                      const confirming = sysConfirm === a.id;
                      return (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
                          {a.name} <span className="text-xs text-gray-400">({a.username})</span>
                          <button
                            onClick={() => confirmRemove(a.id, sysConfirm, setSysConfirm, sysConfirmTimer) && removeSystemAdmin(a.id)}
                            className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                              confirming ? "bg-red-100 text-red-600" : "text-gray-400 hover:bg-red-50 hover:text-red-500"
                            }`}
                            title={confirming ? "确认删除" : "移除"}
                          >{confirming ? "?" : "×"}</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="relative">
                  <input type="text" value={sysSearchQ} onChange={(e) => setSysSearchQ(e.target.value)}
                    placeholder="搜索员工姓名/工号添加管理员..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                  {sysSearchQ.trim() && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                      <SearchDropdown results={sysResults} searching={sysSearching}
                        onSelect={(emp) => addSystemAdmin(emp.userId!, emp.name)} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Section 3: Department Administrators */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">部门管理员</h2>
        <div className="mb-3 flex gap-2">
          {(["全部", "丰华制药", "丰华生物"] as const).map((tab) => (
            <button key={tab} onClick={() => setCompanyTab(tab)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                companyTab === tab ? "bg-emerald-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
              }`}>{tab}</button>
          ))}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {deptLoading ? (
            <p className="p-8 text-center text-sm text-gray-500">加载中...</p>
          ) : filteredDepts.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">暂无部门</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredDepts.map((dept) => (
                <div key={dept.id} className="px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">{dept.name}</span>
                        <span className="text-xs text-gray-400">({dept.company})</span>
                      </div>
                      {dept.admins.length === 0 ? (
                        <p className="mt-1 text-xs text-gray-400">暂无管理员</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {dept.admins.map((a) => {
                            const confirming = deptConfirm === a.id;
                            return (
                              <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-800">
                                {a.user.name}
                                <button
                                  onClick={() => confirmRemove(a.id, deptConfirm, setDeptConfirm, deptConfirmTimer) && removeDeptAdmin(a.id)}
                                  className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                                    confirming ? "bg-red-100 text-red-600" : "text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  }`}
                                  title={confirming ? "确认删除" : "移除"}
                                >{confirming ? "?" : "×"}</button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <button onClick={() => openDeptAdd(dept.id)}
                      className={`ml-2 shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        deptAddOpen === dept.id ? "bg-gray-200 text-gray-700" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}>
                      {deptAddOpen === dept.id ? "取消" : "添加"}
                    </button>
                  </div>
                  {deptAddOpen === dept.id && (
                    <div className="relative mt-3">
                      <input type="text" value={deptSearchQ} onChange={(e) => setDeptSearchQ(e.target.value)}
                        placeholder="搜索员工姓名/工号..." autoFocus
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                      {deptSearchQ.trim() && (
                        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                          <SearchDropdown results={deptResults} searching={deptSearching}
                            onSelect={(emp) => addDeptAdmin(dept.id, emp.userId!, emp.name)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
