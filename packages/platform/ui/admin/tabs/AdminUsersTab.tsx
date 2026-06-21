"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useRef } from "react";
import { getInitials } from "@workspace/platform/search";
import {
  ActionButton,
  DataTable,
  Pagination,
  PanelCard,
  SearchInput,
  SelectField,
  StatusBadge,
  TextField,
  type DataTableColumn,
} from "@workspace/core/ui";
import type { ResourceItem } from "../types";
import {
  formatSummaryTooltip,
  ROLE_COLORS,
  summarizeResourcePermissions,
  type PermissionGrantLike,
} from "../lib/permission-summary";

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

const ROLE_VARIANTS: Record<string, "gray" | "green" | "blue" | "red" | "yellow"> = {
  purple: "blue",
  red: "red",
  emerald: "green",
  gray: "gray",
};

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
      const res = await fetch(workspacePath("/api/system/admin/users"));
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
      const res = await fetch(workspacePath("/api/system/admin/users"), {
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
      const res = await fetch(workspacePath("/api/system/admin/users/") + user.id, { method: "POST" });
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
      const res = await fetch(workspacePath("/api/system/admin/users/") + id, {
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

  const columns: DataTableColumn<UserItem>[] = [
    {
      key: "name",
      label: "姓名",
      required: true,
      render: (u) => (
        <span className="font-medium text-slate-800">
          {u.name}
          {u.employeeId && <span className="ml-1 text-xs font-normal text-slate-400">/ {u.employeeId}</span>}
        </span>
      ),
    },
    {
      key: "username",
      label: "用户名",
      required: true,
      render: (u) => <span className="font-mono text-slate-500">{u.username || "-"}</span>,
    },
    {
      key: "status",
      label: "状态",
      required: true,
      cellClassName: "w-20",
      render: (u) => (
        <ActionButton
          variant={u.canLogin ? "secondary" : "danger"}
          className="px-2 py-1 text-xs"
          onClick={() => toggleLogin(u.id, u.canLogin)}
        >
          {u.canLogin ? "启用" : "停用"}
        </ActionButton>
      ),
    },
    {
      key: "permissions",
      label: (
        <>
          权限 <span className="cursor-help text-slate-400" title="0=访问，1=编辑，2=删除，3=管理">ⓘ</span>
        </>
      ),
      required: true,
      render: (u) => {
        const summaries = summarizeResourcePermissions(resources, u.resourceRoles as PermissionGrantLike[]);
        return (
          <div className="flex flex-wrap gap-1">
            {u.isWorkListAdmin && <StatusBadge label="管理员" variant="blue" />}
            {summaries.map((s) => (
              <span key={s.key} title={formatSummaryTooltip(s)}>
                <StatusBadge
                  label={`${s.label}${s.totalChildren > 0 && s.coveredChildren < s.totalChildren ? ` ${s.coveredChildren}/${s.totalChildren}` : ""}`}
                  variant={ROLE_VARIANTS[ROLE_COLORS[s.roleKey] || "gray"] ?? "gray"}
                />
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "操作",
      required: true,
      cellClassName: "w-32",
      render: (u) => (
        <ActionButton className="px-2 py-1 text-xs" onClick={() => resetPassword(u)}>
          重置密码
        </ActionButton>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center">
          <SearchInput
            value={keyword}
            onChange={onKeywordChange}
            placeholder={searchMode === "name" ? "搜索姓名..." : "搜索全部..."}
            size="toolbar"
            className="w-64"
          />
          <ActionButton
            variant={searchMode === "name" ? "secondary" : "primary"}
            onClick={() => setSearchMode((m) => (m === "name" ? "all" : "name"))}
          >
            {searchMode === "name" ? "姓名" : "全部"}
          </ActionButton>
        </div>
        <span className="text-sm text-gray-400">{filtered.length} 个用户{keyword && ` (共${users.length})`}</span>
        <div className="flex-1" />
        <SelectField
          value={String(pageSize)}
          onChange={(nextValue) => onPageSizeChange(Number(nextValue))}
          options={[20, 50, 100].map((n) => ({ value: String(n), label: `${n}条/页` }))}
          size="toolbar"
          selectClassName="min-w-32"
        />
        <ActionButton variant="primary" onClick={() => { setCreating(true); setTimeout(() => nameRef.current?.focus(), 50); }}>
          新建
        </ActionButton>
      </div>

      {creating && (
        <PanelCard bodyClassName="flex flex-wrap items-center gap-3 p-3">
          <TextField
            ref={nameRef}
            value={newName}
            onChange={setNewName}
            placeholder="姓名 *"
            className="w-40"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <TextField
            value={newUsername}
            onChange={setNewUsername}
            placeholder="用户名（可选）"
            className="w-52"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <ActionButton variant="primary" onClick={handleCreate}>保存</ActionButton>
          <ActionButton onClick={() => { setCreating(false); setNewName(""); setNewUsername(""); }}>
            取消
          </ActionButton>
        </PanelCard>)}

      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : (
        <PanelCard>
          <DataTable
            rows={paged}
            columns={columns}
            visibleColumns={columns.map((column) => column.key)}
            rowKey={(u) => u.id}
            emptyText="暂无用户"
          />
        </PanelCard>
      )}
      {filtered.length > pageSize && (
        <Pagination
          page={page + 1}
          totalPages={totalPages}
          total={filtered.length}
          onPageChange={(nextPage) => setPage(nextPage - 1)}
          className="flex items-center justify-center gap-3"
        />
      )}
    </div>
  );
}
