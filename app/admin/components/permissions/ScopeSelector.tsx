"use client";

import { useState, useEffect, useCallback } from "react";
import type { PermissionScopeState } from "../../hooks/usePermissionScope";

interface Props {
  scope: PermissionScopeState;
  resourceName: string;
}

interface DeptOption {
  id: number;
  name: string;
  path: string;
}

export default function ScopeSelector({ scope, resourceName }: Props) {
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<Array<{ id: number; name: string; dept: string }>>([]);
  const [searching, setSearching] = useState(false);

  // Load departments on mount
  useEffect(() => {
    fetch("/api/admin/departments")
      .then((r) => r.json())
      .then((data) => {
        const depts = (data.departments || []).map((d: { id: number; name: string; path?: string[] }) => ({
          id: d.id,
          name: d.name,
          path: d.path?.join(" > ") || d.name,
        }));
        setDepartments(depts);
      })
      .catch(() => {});
  }, []);

  // Search users
  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 1) { setUserResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setUserResults((data.users || []).slice(0, 10));
    } catch { setUserResults([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(userQuery), 300);
    return () => clearTimeout(timer);
  }, [userQuery, searchUsers]);

  const modeLabel =
    scope.scopeMode === "global" ? "全部" :
    scope.scopeMode === "department" ? `部门：${scope.scopeTargetName || "—"}` :
    `个人：${scope.scopeTargetName || "—"}`;

  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">权限范围</span>
        <span className="text-xs text-gray-400">
          控制当前授权作用到哪些工作汇报数据
        </span>
      </div>

      {/* Mode selector */}
      <div className="mb-2 flex gap-1 rounded-md bg-white p-0.5 shadow-sm w-fit">
        {(["global", "department", "user"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => scope.setScopeMode(mode)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              scope.scopeMode === mode
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {mode === "global" ? "全部" : mode === "department" ? "按部门" : "按个人"}
          </button>
        ))}
      </div>

      {/* Department picker */}
      {scope.scopeMode === "department" && (
        <select
          value={scope.scopeDepartmentId ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            scope.setScopeDepartmentId(id);
            const dept = departments.find((d) => d.id === id);
            scope.setScopeTargetName(dept?.name || "");
          }}
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">选择部门…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.path}</option>
          ))}
        </select>
      )}

      {/* User picker */}
      {scope.scopeMode === "user" && (
        <div className="relative w-full max-w-xs">
          <input
            type="text"
            placeholder="搜索员工姓名…"
            value={scope.scopeUserId && scope.scopeTargetName ? scope.scopeTargetName : userQuery}
            onChange={(e) => {
              setUserQuery(e.target.value);
              if (scope.scopeUserId) {
                scope.setScopeUserId(null);
                scope.setScopeTargetName("");
              }
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
          />
          {searching && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>}
          {userResults.length > 0 && !scope.scopeUserId && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
              {userResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    scope.setScopeUserId(u.id);
                    scope.setScopeTargetName(u.name);
                    setUserQuery("");
                    setUserResults([]);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                >
                  <span className="font-medium">{u.name}</span>
                  {u.dept && <span className="ml-2 text-xs text-gray-400">{u.dept}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Current scope summary */}
      <p className="mt-2 text-xs text-gray-500">
        正在授权：{resourceName}{scope.scopeMode !== "global" ? ` / ${modeLabel}` : "（全部）"}
      </p>
    </div>
  );
}
