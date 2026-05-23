"use client";

import { useState, useEffect, useRef } from "react";
import { getInitials } from "@/lib/search";

function copyFallback(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed"; el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

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

export default function AdminUsersTab({ showToast }: { showToast: (msg: string, type?: "success" | "error") => void }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "all">("name");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

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

  async function handleCreate() {
    if (!newName.trim()) { showToast("请输入姓名", "error"); return; }
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), username: newUsername.trim() || null }),
      });
      if (res.ok) {
        showToast("已创建", "success");
        setNewName(""); setNewUsername(""); setCreating(false);
        load();
      } else {
        showToast((await res.json().catch(() => ({}))).error || "创建失败", "error");
      }
    } catch { showToast("网络错误", "error"); }
  }

  async function resetPassword(id: number) {
    try {
      const res = await fetch("/api/admin/users/" + id, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const pw = data.password;
        // 兼容 HTTP 的剪贴板复制
        if (navigator.clipboard?.writeText) {
          try { await navigator.clipboard.writeText(pw); } catch { copyFallback(pw); }
        } else {
          copyFallback(pw);
        }
        showToast("新密码 " + pw + " 已复制到剪贴板", "success");
      } else {
        showToast("重置失败", "error");
      }
    } catch { showToast("网络错误", "error"); }
  }

  async function toggleLogin(id: number, current: boolean) {
    try {
      const res = await fetch("/api/admin/users/" + id, {
        method: "PUT",
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
    ? users.filter((u) => {
        const q = keyword.toLowerCase();
        if (searchMode === "name") {
          return u.name.toLowerCase().includes(q) || getInitials(u.name).includes(q);
        }
        if (u.name.toLowerCase().includes(q)) return true;
        if ((u.username || "").toLowerCase().includes(q)) return true;
        if ((u.employeeId || "").toLowerCase().includes(q)) return true;
        if (getInitials(u.name).includes(q)) return true;
        return false;
      })
    : users;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex rounded-md border border-gray-300 overflow-hidden">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder={searchMode === "name" ? "搜索姓名..." : "搜索全部..."}
            className="px-3 py-2 text-sm w-48 focus:outline-none"
          />
          <button onClick={() => setSearchMode((m) => (m === "name" ? "all" : "name"))}
            className={`px-2 text-xs ${searchMode === "name" ? "bg-gray-50 text-gray-500" : "bg-emerald-50 text-emerald-600"}`}
          >
            {searchMode === "name" ? "姓名" : "全部"}
          </button>
        </div>
        <span className="text-sm text-gray-400">{users.length} 个用户</span>
        <button onClick={() => { setCreating(true); setTimeout(() => nameRef.current?.focus(), 50); }}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700">新建</button>
      </div>

      {creating && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <input ref={nameRef} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="姓名 *"
            className="rounded border border-gray-300 px-2 py-1 text-sm w-32 focus:border-emerald-400 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="用户名（可选）"
            className="rounded border border-gray-300 px-2 py-1 text-sm w-44 focus:border-emerald-400 focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          <button onClick={handleCreate} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">保存</button>
          <button onClick={() => { setCreating(false); setNewName(""); setNewUsername(""); }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">取消</button>
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
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">状态</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">权限</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 font-mono">{u.id}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {u.name}
                    {u.employeeId && <span className="text-gray-400 ml-1 text-[11px] font-normal">/ {u.employeeId}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 font-mono">{u.username || "-"}</td>
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
