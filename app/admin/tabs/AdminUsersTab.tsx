"use client";

import { useState, useEffect, useRef } from "react";
import { getInitials } from "@/lib/search";
import type { ResourceItem } from "../types";
import UserRow from "./UserRow";

function copyFallback(text: string) {
  const el = document.createElement("textarea");
  el.value = text; el.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(el); el.select();
  document.execCommand("copy"); document.body.removeChild(el);
}

interface UserItem {
  id: number;
  name: string;
  username: string | null;
  employeeId: string | null;
  canLogin: boolean;
  isWorkListAdmin: boolean;
  resourceRoles: Array<{ resourceKey: string; roleKey: string; scopeId?: string | null }>;
}

interface Props {
  showToast: (msg: string, type?: "success" | "error") => void;
  resources: ResourceItem[];
}

export default function AdminUsersTab({ showToast, resources }: Props) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "all">("name");

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/workspace/api/admin/users");
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
      const res = await fetch("/workspace/api/admin/users", {
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

  async function resetPassword(user: UserItem) {
    try {
      const res = await fetch("/workspace/api/admin/users/" + user.id, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const msg = `${user.name}您好，用户:${user.username || "(未设置)"}，密码:${data.password}`;
        try { await navigator.clipboard.writeText(msg); } catch { copyFallback(msg); }
        showToast("已复制到剪贴板", "success");
      } else { showToast("重置失败", "error"); }
    } catch { showToast("网络错误", "error"); }
  }

  async function toggleLogin(id: number, current: boolean) {
    try {
      const res = await fetch("/workspace/api/admin/users/" + id, {
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
        if (searchMode === "name") return u.name.toLowerCase().includes(q) || getInitials(u.name).includes(q);
        return u.name.toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q)
          || (u.employeeId || "").toLowerCase().includes(q) || getInitials(u.name).includes(q);
      })
    : users;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function onKeywordChange(k: string) { setKeyword(k); setPage(0); }
  function onPageSizeChange(size: number) { setPageSize(size); setPage(0); }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex rounded-md border border-gray-300 overflow-hidden">
          <input value={keyword} onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={searchMode === "name" ? "搜索姓名..." : "搜索全部..."}
            className="px-3 py-2 text-sm w-48 focus:outline-none"
          />
          <button onClick={() => setSearchMode((m) => (m === "name" ? "all" : "name"))}
            className={`px-2 text-xs ${searchMode === "name" ? "bg-gray-50 text-gray-500" : "bg-emerald-50 text-emerald-600"}`}
          >
            {searchMode === "name" ? "姓名" : "全部"}
          </button>
        </div>
        <span className="text-sm text-gray-400">{filtered.length} 个用户{keyword && ` (共${users.length})`}</span>
        <div className="flex-1" />
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600">
          {[20, 50, 100].map((n) => <option key={n} value={n}>{n}条/页</option>)}
        </select>
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
        </div>)}

      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">姓名</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">用户名</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">状态</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">
                  权限 <span className="cursor-help text-gray-400" title="0=访问，1=编辑，2=删除，3=管理">ⓘ</span>
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((u) => (
                <UserRow key={u.id} user={u} resources={resources} onToggleLogin={toggleLogin} onResetPassword={resetPassword} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > pageSize && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(0)} disabled={page === 0}
            className="rounded border px-2 py-1 text-xs disabled:opacity-30">首页</button>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="rounded border px-2 py-1 text-xs disabled:opacity-30">上一页</button>
          <span className="text-xs text-gray-500">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="rounded border px-2 py-1 text-xs disabled:opacity-30">下一页</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
            className="rounded border px-2 py-1 text-xs disabled:opacity-30">末页</button>
        </div>
      )}
    </div>
  );
}
