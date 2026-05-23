"use client";

import { useState, useEffect, useRef } from "react";

interface UserItem {
  id: number;
  name: string;
  username: string | null;
  employeeId: string | null;
  canLogin: boolean;
  isWorkListAdmin: boolean;
  canAccessHR: boolean;
  canAccessWorks: boolean;
}

interface EmpOption { id: number; name: string; subtitle?: string }

export default function AdminUsersTab({ showToast }: { showToast: (msg: string, type?: "success" | "error") => void }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  // Create form
  const [creating, setCreating] = useState(false);
  const [empQuery, setEmpQuery] = useState("");
  const [empResults, setEmpResults] = useState<EmpOption[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<EmpOption | null>(null);
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const empRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowEmpDropdown(false);
      }
    }
    if (showEmpDropdown) { document.addEventListener("mousedown", handleClickOutside); return () => document.removeEventListener("mousedown", handleClickOutside); }
  }, [showEmpDropdown]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function searchEmployee(q: string) {
    setEmpQuery(q); setSelectedEmp(null);
    if (!q.trim()) { setEmpResults([]); setShowEmpDropdown(false); return; }
    try {
      const res = await fetch(`/api/hr/autocomplete?entity=employee&keyword=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setEmpResults((data.items || []).slice(0, 10));
        setShowEmpDropdown(true);
      }
    } catch {}
  }

  function selectEmployee(emp: EmpOption) {
    setSelectedEmp(emp);
    setEmpQuery(`${emp.name} / ${emp.subtitle || emp.id}`);
    setShowEmpDropdown(false);
  }

  async function handleCreate() {
    if (!selectedEmp) { showToast("请选择员工", "error"); return; }
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedEmp.name,
          username: newUsername.trim() || null,
          employeeId: selectedEmp.subtitle || String(selectedEmp.id),
        }),
      });
      if (res.ok) {
        showToast("已创建", "success");
        setSelectedEmp(null); setEmpQuery(""); setNewUsername(""); setCreating(false);
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "创建失败", "error");
      }
    } catch { showToast("网络错误", "error"); }
  }

  async function resetPassword(id: number) {
    try {
      const res = await fetch("/api/admin/users/" + id, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        showToast("新密码: " + data.password, "success");
      } else {
        showToast("重置失败", "error");
      }
    } catch { showToast("网络错误", "error"); }
  }

  async function toggleLogin(id: number, current: boolean) {
    try {
      const res = await fetch("/api/admin/users/" + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "canLogin", value: !current }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, canLogin: !current } : u)));
        showToast(current ? "已停用" : "已启用", "success");
      }
    } catch { showToast("操作失败", "error"); }
  }

  const filtered = keyword
    ? users.filter((u) => u.name.includes(keyword) || (u.username || "").includes(keyword) || (u.employeeId || "").includes(keyword))
    : users;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索姓名/用户名/员工编号..."
          className="rounded border border-gray-300 px-3 py-2 text-sm w-64 focus:border-emerald-400 focus:outline-none"
        />
        <span className="text-sm text-gray-400">{users.length} 个用户</span>
        <button onClick={() => { setCreating(true); setTimeout(() => empRef.current?.focus(), 50); }} className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700">新建</button>
      </div>

      {creating && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="relative" ref={dropdownRef}>
            <input
              ref={empRef}
              value={empQuery}
              onChange={(e) => searchEmployee(e.target.value)}
              placeholder="搜索员工（姓名/工号）*"
              className="rounded border border-gray-300 px-2 py-1 text-sm w-56 focus:border-emerald-400 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            {showEmpDropdown && empResults.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border bg-white shadow-lg max-h-40 overflow-y-auto">
                {empResults.map((e) => (
                  <button key={e.id} onClick={() => selectEmployee(e)} className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50">
                    {e.name} <span className="text-gray-400 text-xs">/ {e.subtitle}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="用户名（可选，用于登录）" className="rounded border border-gray-300 px-2 py-1 text-sm w-44 focus:border-emerald-400 focus:outline-none" onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          <button onClick={handleCreate} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">保存</button>
          <button onClick={() => { setCreating(false); setSelectedEmp(null); setEmpQuery(""); setNewUsername(""); }} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">取消</button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">ID</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">用户名</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">关联员工</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">状态</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">权限</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 font-mono">{u.id}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{u.name}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono">{u.username || "-"}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono">{u.employeeId || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${u.canLogin ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {u.canLogin ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.isWorkListAdmin && <span className="bg-purple-50 text-purple-600 rounded px-1 py-0.5 text-[10px]">管理员</span>}
                      {u.canAccessHR && <span className="bg-blue-50 text-blue-600 rounded px-1 py-0.5 text-[10px]">HR</span>}
                      {u.canAccessWorks && <span className="bg-amber-50 text-amber-600 rounded px-1 py-0.5 text-[10px]">工作</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => resetPassword(u.id)} className="text-xs text-blue-500 hover:text-blue-700">重置密码</button>
                      <button onClick={() => toggleLogin(u.id, u.canLogin)} className={`text-xs ${u.canLogin ? "text-red-500 hover:text-red-700" : "text-emerald-500 hover:text-emerald-700"}`}>
                        {u.canLogin ? "停用" : "启用"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
