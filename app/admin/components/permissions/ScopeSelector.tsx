"use client";

import { useState, useEffect } from "react";
import type { PermissionScopeState } from "../../hooks/usePermissionScope";

interface Props {
  scope: PermissionScopeState;
  resourceName: string;
}

interface DeptOption { id: number; name: string; path: string; }
interface ProjectOption { id: number; name: string; type?: string; }

export default function ScopeSelector({ scope, resourceName }: Props) {
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  // Load departments and projects on mount
  useEffect(() => {
    fetch("/api/admin/departments")
      .then((r) => r.json())
      .then((data) => {
        setDepartments((data.departments || []).map((d: { id: number; name: string; path?: string[] }) => ({
          id: d.id, name: d.name, path: d.path?.join(" > ") || d.name,
        })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects((data.projects || []).map((p: { id: number; name: string; type?: string }) => ({
          id: p.id, name: p.name, type: p.type,
        })));
      })
      .catch(() => {});
  }, []);

  const modeLabel =
    scope.scopeMode === "global" ? "全部" :
    scope.scopeMode === "department" ? `部门：${scope.scopeTargetName || "—"}` :
    `项目：${scope.scopeTargetName || "—"}`;

  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">权限范围</span>
        <span className="text-xs text-gray-400">
          控制当前授权作用到哪些工作汇报数据
        </span>
      </div>

      {/* Mode selector — dynamic from scopeTypeList */}
      <div className="mb-2 flex gap-1 rounded-md bg-white p-0.5 shadow-sm w-fit">
        <button
          onClick={() => scope.setScopeMode("global")}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            scope.scopeMode === "global"
              ? "bg-emerald-500 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          全部
        </button>
        {scope.scopeTypeList.map((t) => (
          <button
            key={t}
            onClick={() => scope.setScopeMode(t as "department" | "project")}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              scope.scopeMode === t
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "department" ? "按部门" : t === "project" ? "按项目" : `按${t}`}
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
            scope.setScopeTargetName(id ? departments.find((d) => d.id === id)?.name || "" : "");
          }}
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">选择部门…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.path}</option>
          ))}
        </select>
      )}

      {/* Project picker */}
      {scope.scopeMode === "project" && (
        <select
          value={scope.scopeProjectId ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            scope.setScopeProjectId(id);
            scope.setScopeTargetName(id ? projects.find((p) => p.id === id)?.name || "" : "");
          }}
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
        >
          <option value="">选择项目…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.type ? ` (${p.type})` : ""}
            </option>
          ))}
        </select>
      )}

      {/* Status line */}
      <p className="mt-2 text-xs text-gray-500">
        正在授权：{resourceName}
        {scope.scopeMode !== "global" ? ` / ${modeLabel}` : "（全部）"}
        {!scope.isScopeValid && (
          <span className="ml-2 text-amber-600 font-medium">← 请先选择具体{scope.scopeMode === "department" ? "部门" : "项目"}</span>
        )}
      </p>
    </div>
  );
}
