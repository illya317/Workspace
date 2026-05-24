"use client";

import { isTopLevelResource } from "./lib";
import { useByUserTab } from "./useByUserTab";

interface Props {
  s: ReturnType<typeof useByUserTab>;
}

export default function UserPermCard({ s }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">权限卡片</h3>

      <SearchBox s={s} />

      {s.selectedUser ? (
        <>
          <SelectedUserInfo s={s} />
          <GlobalSwitches s={s} />
          <ScopedRoles s={s} />
        </>
      ) : (
        <p className="text-sm text-gray-400">请搜索并选择员工来查看权限卡片</p>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function SearchBox({ s }: { s: ReturnType<typeof useByUserTab> }) {
  return (
    <div className="relative mb-4">
      <input
        type="text" placeholder="搜索员工姓名/工号…"
        value={s.searchQuery}
        onChange={(e) => s.handleSearchChange(e.target.value)}
        onFocus={() => { if (s.searchResults.length > 0) s.setShowDropdown(true); }}
        onBlur={() => setTimeout(() => s.setShowDropdown(false), 200)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
      />
      {s.searchLoading && <span className="absolute right-3 top-2.5 text-xs text-gray-400">搜索中…</span>}
      {s.showDropdown && s.searchResults.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          {s.searchResults.map((item, idx) => (
            <button
              key={`${item.employeeId}-${item.rowId}-${idx}`}
              onMouseDown={(e) => { e.preventDefault(); s.handleSelectUser(item); }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50"
            >
              <span className="font-medium text-gray-800">{item.name}</span>
              <span className="text-xs text-gray-400">{item.employeeId}</span>
              {item.dept1 && <span className="text-xs text-gray-500">{item.dept1}</span>}
              {item.position && <span className="text-xs text-gray-400">{item.position}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectedUserInfo({ s }: { s: ReturnType<typeof useByUserTab> }) {
  const perms = s.getSelectedUserPerms();
  const user = s.selectedUser!;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-gray-50 p-3">
      <span className="font-medium text-gray-800">{user.name}</span>
      <span className="text-xs text-gray-400">{user.employeeId}</span>
      {perms?.username && (
        <span className="text-xs text-gray-500">账号: {perms.username}</span>
      )}
      {(user.dept1 || user.position) && (
        <span className="text-xs text-gray-500">
          {[user.dept1, user.position].filter(Boolean).join(" / ")}
        </span>
      )}
      {perms && !perms.canLogin && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">已停用</span>
      )}
    </div>
  );
}

function GlobalSwitches({ s }: { s: ReturnType<typeof useByUserTab> }) {
  return (
    <>
      <h4 className="mb-2 text-xs font-medium text-gray-500">全局开关</h4>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {s.topLevelResources.map((r) => {
          const perms = s.getSelectedUserPerms();
          const hasAccess = perms ? s.userHasAccess(perms, r.key) : false;
          return (
            <button key={r.key} title={r.description || r.name}
              onClick={() => s.togglePermission(s.selectedUser!.userId, r.key, hasAccess)}
              disabled={!s.selectedUser!.userId}
              className={`rounded-lg border p-3 text-center text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                hasAccess
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-gray-50 text-gray-500 hover:border-emerald-200 hover:bg-emerald-50/50"
              }`}
            >
              <div className="font-medium">{r.name}</div>
              <div className={`mt-1 text-xs ${hasAccess ? "text-emerald-600" : "text-gray-400"}`}>
                {hasAccess ? "已授权" : "未授权"}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function ScopedRoles({ s }: { s: ReturnType<typeof useByUserTab> }) {
  const perms = s.getSelectedUserPerms();
  if (!perms) return <p className="text-sm text-gray-400">未找到权限数据</p>;
  const scoped = perms.resourceRoles.filter(
    (rr) => rr.resource && !isTopLevelResource(rr.resource.key)
  );
  if (scoped.length === 0) return <p className="text-sm text-gray-400">无范围分配</p>;
  return (
    <>
      <h4 className="mb-2 text-xs font-medium text-gray-500">范围分配（只读）</h4>
      <div className="space-y-1.5">
        {scoped.map((rr, idx) => (
          <div key={`${rr.resource!.key}-${idx}`}
            className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1.5 text-sm">
            <span className="text-gray-600">{rr.resource!.name}</span>
            <span className="text-xs text-gray-400">({rr.resource!.key})</span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
              {rr.role!.name}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
