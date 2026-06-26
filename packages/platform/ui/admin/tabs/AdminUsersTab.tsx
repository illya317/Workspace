"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useRef } from "react";
import { matchSearchFields, matchText } from "@workspace/platform/search";
import { DataSurface, FormSurface, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { ResourceItem } from "../types";
import { formatSummaryTooltip, ROLE_COLORS, summarizeResourcePermissions, type PermissionGrantLike } from "../lib/permission-summary";
function copyFallback(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}
interface UserItem {
  id: number;
  name: string;
  nickname: string;
  username: string | null;
  employeeId: string | null;
  canLogin: boolean;
  isWorkListAdmin: boolean;
  resourceRoles: Array<{
    resourceKey: string;
    roleKey: string;
    scopeId?: string | null;
  }>;
}
interface Props {
  showToast: (msg: string, type?: "success" | "error") => void;
  resources: ResourceItem[];
}
const ROLE_VARIANTS: Record<string, "gray" | "green" | "blue" | "red" | "yellow"> = {
  purple: "blue",
  red: "red",
  emerald: "green",
  gray: "gray"
};
const BADGE_TONE_CLASS: Record<"gray" | "green" | "blue" | "red" | "yellow", string> = {
  gray: "bg-gray-100 text-gray-600",
  green: "bg-emerald-50 text-emerald-600",
  blue: "bg-sky-50 text-sky-600",
  red: "bg-red-50 text-red-700",
  yellow: "bg-yellow-50 text-yellow-700",
};
function PermissionBadge({ label, tone }: { label: string; tone: "gray" | "green" | "blue" | "red" | "yellow" }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${BADGE_TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}
export default function AdminUsersTab({
  showToast,
  resources
}: Props) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "all">("name");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  async function load() {
    setLoading(true);
    try {
      const res = await fetch(workspacePath("/api/settings/admin/users"));
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function handleCreate() {
    if (!newNickname.trim()) {
      showToast("请输入昵称", "error");
      return;
    }
    try {
      const res = await fetch(workspacePath("/api/settings/admin/users"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nickname: newNickname.trim(),
          username: newUsername.trim() || null
        })
      });
      if (res.ok) {
        showToast("已创建", "success");
        setNewNickname("");
        setNewUsername("");
        setCreating(false);
        load();
      } else {
        showToast((await res.json().catch(() => ({}))).error || "创建失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  }
  async function resetPassword(user: UserItem) {
    try {
      const res = await fetch(workspacePath("/api/settings/admin/users/") + user.id, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        const msg = `${user.name}您好，用户:${user.username || "(未设置)"}，密码:${data.password}`;
        try {
          await navigator.clipboard.writeText(msg);
        } catch {
          copyFallback(msg);
        }
        showToast("已复制到剪贴板", "success");
      } else {
        showToast("重置失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  }
  async function toggleLogin(id: number, current: boolean) {
    try {
      const res = await fetch(workspacePath("/api/settings/admin/users/") + id, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          field: "canLogin",
          value: !current
        })
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === id ? {
          ...u,
          canLogin: !current
        } : u));
        showToast(current ? "已停用" : "已启用", "success");
      }
    } catch {
      showToast("操作失败", "error");
    }
  }
  const filtered = keyword ? users.filter(u => {
    if (searchMode === "name") return matchText(u.name, keyword);
    return matchSearchFields(u as unknown as Record<string, unknown>, keyword, ["name", "username", "employeeId"]);
  }) : users;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  function onKeywordChange(k: string) {
    setKeyword(k);
    setPage(0);
  }
  function onPageSizeChange(size: number) {
    setPageSize(size);
    setPage(0);
  }
  const columns: DataSurfaceColumnSpec<UserItem>[] = [{
    key: "name",
    label: "姓名",
    required: true,
    cell: u => <div>
          <span className="font-medium text-slate-800">
            {u.name}
            {u.employeeId && <span className="ml-1 text-xs font-normal text-slate-400">/ {u.employeeId}</span>}
          </span>
          {u.nickname !== u.name && <div className="text-xs text-slate-400">昵称：{u.nickname}</div>}
        </div>
  }, {
    key: "username",
    label: "用户名",
    required: true,
    cell: u => <span className="font-mono text-slate-500">{u.username || "-"}</span>
  }, {
    key: "status",
    label: "状态",
    required: true,
    cellClassName: "w-20",
    cell: u => ({
      kind: "action",
      action: {
        key: `login-${u.id}`,
        label: u.canLogin ? "启用" : "停用",
        variant: u.canLogin ? "secondary" : "danger",
        onClick: () => toggleLogin(u.id, u.canLogin),
        className: "px-2 py-1 text-xs",
      },
    })
  }, {
    key: "permissions",
    label: <>
          权限 <span className="cursor-help text-slate-400" title="0=访问，1=编辑，2=删除，3=管理">ⓘ</span>
        </>,
    required: true,
    cell: u => {
      const summaries = summarizeResourcePermissions(resources, u.resourceRoles as PermissionGrantLike[]);
      return <div className="flex flex-wrap gap-1">
            {u.isWorkListAdmin && <PermissionBadge label="管理员" tone="blue" />}
            {summaries.map(s => <span key={s.key} title={formatSummaryTooltip(s)}>
                <PermissionBadge label={`${s.label}${s.totalChildren > 0 && s.coveredChildren < s.totalChildren ? ` ${s.coveredChildren}/${s.totalChildren}` : ""}`} tone={ROLE_VARIANTS[ROLE_COLORS[s.roleKey] || "gray"] ?? "gray"} />
              </span>)}
          </div>;
    }
  }, {
    key: "actions",
    label: "操作",
    required: true,
    cellClassName: "w-32",
    cell: u => ({
      kind: "action",
      action: {
        key: `reset-${u.id}`,
        label: "重置密码",
        onClick: () => resetPassword(u),
        className: "px-2 py-1 text-xs",
      },
    })
  }];
  return <div className="space-y-4">
      <FormSurface
        kind="inline"
        fields={[
          {
            key: "keyword",
            label: "搜索",
            spec: { valueType: "string", editor: "input" },
            value: keyword,
            onChange: (value) => onKeywordChange(String(value ?? "")),
            placeholder: searchMode === "name" ? "搜索姓名..." : "搜索全部...",
            className: "w-64",
          },
          {
            kind: "note" as const,
            key: "count",
            content: `${filtered.length} 个用户${keyword ? ` (共${users.length})` : ""}`,
            className: "text-sm text-gray-400",
          },
          {
            key: "page-size",
            label: "分页",
            spec: { valueType: "number", editor: "select", options: { source: "static", mode: "dropdown", items: [20, 50, 100].map(n => ({ value: String(n), label: `${n}条/页` })) } },
            value: String(pageSize),
            onChange: (nextValue) => onPageSizeChange(Number(nextValue)),
          },
        ]}
        actions={[
          {
            key: "search-mode",
            label: searchMode === "name" ? "姓名" : "全部",
            variant: searchMode === "name" ? "secondary" : "primary",
            onClick: () => setSearchMode(m => m === "name" ? "all" : "name"),
          },
          {
            key: "create",
            label: "新建",
            variant: "primary",
            onClick: () => {
              setCreating(true);
              setTimeout(() => nameRef.current?.focus(), 50);
            },
          },
        ]}
      />

      {creating && (
        <FormSurface
          kind="inline"
          className="rounded-md border border-slate-200 p-3"
          fields={[
            {
              key: "nickname",
              label: "昵称",
              inputRef: nameRef,
              spec: { valueType: "string", editor: "input" },
              value: newNickname,
              onChange: (value) => setNewNickname(String(value ?? "")),
              placeholder: "昵称 *",
              onKeyDown: e => e.key === "Enter" && handleCreate(),
            },
            {
              key: "username",
              label: "用户名",
              spec: { valueType: "string", editor: "input" },
              value: newUsername,
              onChange: (value) => setNewUsername(String(value ?? "")),
              placeholder: "用户名（可选）",
              onKeyDown: e => e.key === "Enter" && handleCreate(),
            },
          ]}
          actions={[
            { key: "save", label: "保存", variant: "primary", onClick: handleCreate },
            {
              key: "cancel",
              label: "取消",
              onClick: () => {
                setCreating(false);
                setNewNickname("");
                setNewUsername("");
              },
            },
          ]}
        />
      )}

      {loading ? <p className="text-gray-500">加载中...</p> : (
        <DataSurface
          kind="table"
          framed
          rows={paged}
          columns={columns}
          visibleColumns={columns.map(column => column.key)}
          rowKey={u => u.id}
          emptyText="暂无用户"
          pagination={filtered.length > pageSize ? {
            page: page + 1,
            totalPages,
            total: filtered.length,
            onPageChange: nextPage => setPage(nextPage - 1),
            className: "flex items-center justify-center gap-3",
          } : undefined}
        />
      )}
    </div>;
}
