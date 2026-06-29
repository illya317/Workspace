"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect, useMemo } from "react";
import { matchSearchFields, matchText } from "@workspace/platform/search";
import { createFieldsSection, createMessageSection, createPageBody, type DataSurfaceColumnSpec, PageSurface, type BodySurfaceSectionSpec, type PageSurfaceFooterSpec, type SurfaceToolbarItem } from "@workspace/core/ui";
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
  onToolbarItemsChange: (items: SurfaceToolbarItem[]) => void;
  onFooterChange: (footer: PageSurfaceFooterSpec | undefined) => void;
  enabled?: boolean;
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
export function useAdminUsersSection({
  showToast,
  resources,
  onToolbarItemsChange,
  onFooterChange,
  enabled = true,
}: Props): BodySurfaceSectionSpec {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "all">("name");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newUsername, setNewUsername] = useState("");
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
    if (!enabled) return;
    void load();
  }, [enabled]);
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
    width: "xs",
    cell: u => ({
      kind: "action",
      action: {
        key: `login-${u.id}`,
        label: u.canLogin ? "启用" : "停用",
        variant: u.canLogin ? "secondary" : "danger",
        onClick: () => toggleLogin(u.id, u.canLogin),

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
    width: "sm",
    cell: u => ({
      kind: "action",
      action: {
        key: `reset-${u.id}`,
        label: "重置密码",
        onClick: () => resetPassword(u),

      },
    })
  }];
  const toolbarItems = useMemo<SurfaceToolbarItem[]>(() => [
      {
        kind: "search",
        key: "keyword",
        section: "search",
        value: keyword,
        onChange: (value) => {
          setKeyword(String(value ?? ""));
          setPage(0);
        },
        placeholder: searchMode === "name" ? "搜索姓名..." : "搜索全部...",
        ariaLabel: "搜索用户",
        width: "wide",
      },
      {
        kind: "text",
        key: "count",
        section: "meta",
        content: `${filtered.length} 个用户${keyword ? ` (共${users.length})` : ""}`,
      },
      {
        kind: "page-size",
        key: "page-size",
        section: "filter",
        label: "分页",
        value: String(pageSize),
        options: [20, 50, 100].map(n => ({ value: String(n), label: `${n}条/页` })),
        onChange: (nextValue) => {
          setPageSize(Number(nextValue));
          setPage(0);
        },
      },
      {
        kind: "option-group",
        key: "search-mode",
        section: "filter",
        value: searchMode,
        options: [
          { value: "name", label: "姓名" },
          { value: "all", label: "全部" },
        ],
        onChange: (value) => setSearchMode(value as typeof searchMode),
        ariaLabel: "搜索范围",
      },
      {
        kind: "create",
        key: "create",
        section: "action",
        label: "新建",
        active: creating,
        onClick: () => {
          setCreating(true);
        },
      },
    ], [creating, filtered.length, keyword, pageSize, searchMode, users.length]);

  const footer = useMemo<PageSurfaceFooterSpec | undefined>(() => filtered.length > pageSize ? {
    pagination: {
      page: page + 1,
      totalPages,
      total: filtered.length,
      onPageChange: nextPage => setPage(nextPage - 1),

    },
  } : undefined, [filtered.length, page, pageSize, totalPages]);

  useEffect(() => {
    if (!enabled) {
      onToolbarItemsChange([]);
      return undefined;
    }
    onToolbarItemsChange(toolbarItems);
    return () => onToolbarItemsChange([]);
  }, [enabled, onToolbarItemsChange, toolbarItems]);

  useEffect(() => {
    if (!enabled) {
      onFooterChange(undefined);
      return undefined;
    }
    onFooterChange(footer);
    return () => onFooterChange(undefined);
  }, [enabled, footer, onFooterChange]);

  const sections: BodySurfaceSectionSpec[] = [
    ...(creating
      ? [createFieldsSection("create-user", [
            {
              key: "nickname",
              label: "昵称",
              autoFocus: true,
              spec: { valueType: "string", control: "text" },
              value: newNickname,
              onChange: (value) => setNewNickname(String(value ?? "")),
              placeholder: "昵称 *",
              onKeyDown: e => e.key === "Enter" && handleCreate(),
            },
            {
              key: "username",
              label: "用户名",
              spec: { valueType: "string", control: "text" },
              value: newUsername,
              onChange: (value) => setNewUsername(String(value ?? "")),
              placeholder: "用户名（可选）",
              onKeyDown: e => e.key === "Enter" && handleCreate(),
            },
          ], {
            layout: { columns: 2 },

            commands: [
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
            ],
          })]
      : []),
    loading ? createMessageSection("loading", {
      tone: "muted",
      content: "加载中..."
    }) : {
      key: "admin-users",
      body: { kind: "data", data: {
        kind: "table",
        rows: paged,
        columns,
        visibleColumns: columns.map(column => column.key),
        rowKey: u => u.id,
        emptyText: "暂无用户",
      } },
    },
  ];

  return {
    key: "admin-users",
    framed: false,
    body: { kind: "section", sections: createPageBody(sections).sections },
  };
}

export default function AdminUsersTab(props: Props) {
  const section = useAdminUsersSection(props);
  return <PageSurface kind="standard" embedded body={createPageBody([section])} />;
}
