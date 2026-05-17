"use client";

import { useState } from "react";
import { useByPermissionTab } from "./useByPermissionTab";
import type { ResourceItem } from "./types";

interface Props {
  user: { id: number; name: string; isWorkListAdmin: boolean; isAnyGroupAdmin: boolean };
  resources: ResourceItem[];
  showToast: (msg: string, type?: "success" | "error") => void;
}

function SystemAdminsSection({
  sysLoading,
  systemAdmins,
  sysConfirm,
  sysSearchQ,
  sysResults,
  onSearchChange,
  onAdd,
  onRemove,
}: {
  sysLoading: boolean;
  systemAdmins: Array<{ id: number; name: string; username: string }>;
  sysConfirm: number | null;
  sysSearchQ: string;
  sysResults: Array<{
    rowId: number;
    employeeId: string;
    name: string;
    dept1: string;
    userId: number | null;
  }>;
  onSearchChange: (q: string) => void;
  onAdd: (userId: number, name: string) => void;
  onRemove: (adminId: number) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-800">系统管理员</h2>
        <span className="text-sm text-gray-500">({systemAdmins.length} 人)</span>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {sysLoading ? (
          <p className="py-4 text-center text-sm text-gray-500">加载中...</p>
        ) : (
          <>
            {systemAdmins.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {systemAdmins.map((a) => {
                  const confirming = sysConfirm === a.id;
                  return (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800"
                    >
                      {a.name} <span className="text-xs text-gray-400">({a.username})</span>
                      <button
                        type="button"
                        onClick={() => onRemove(a.id)}
                        className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                          confirming
                            ? "bg-red-100 text-red-600"
                            : "text-gray-400 hover:bg-red-50 hover:text-red-500"
                        }`}
                      >
                        {confirming ? "?" : "×"}
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={sysSearchQ}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="搜索员工姓名/工号添加管理员..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              />
              {sysSearchQ.trim() && sysResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                  <div className="max-h-48 overflow-y-auto">
                    {sysResults.map((emp) => (
                      <div
                        key={`${emp.rowId}-${emp.employeeId}`}
                        onClick={() => onAdd(emp.userId!, emp.name)}
                        className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50"
                      >
                        <span className="font-medium text-gray-800">{emp.name}</span>
                        <span className="text-xs text-gray-400">
                          {emp.employeeId}
                          {emp.dept1 ? ` · ${emp.dept1}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function ByPermissionTab({ user, resources, showToast }: Props) {
  const {
    topResources,
    systemAdmins,
    sysLoading,
    sysSearchQ,
    setSysSearchQ,
    sysResults,
    sysConfirm,
    handleRemoveSystemAdmin,
    addSystemAdmin,
  } = useByPermissionTab({ user, resources, showToast });

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function getDirectChildren(parentKey: string): ResourceItem[] {
    return resources.filter(
      (r) => r.key.startsWith(parentKey + ".") && r.key.split(".").length === parentKey.split(".").length + 1
    );
  }

  function ResourceTree({ parentKey }: { parentKey: string }) {
    const children = getDirectChildren(parentKey);
    if (children.length === 0) return null;
    return (
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {children.map((r) => {
          const isExpanded = expandedKeys.has(r.key);
          const grandchildren = getDirectChildren(r.key);
          return (
            <div key={r.id}>
              <button
                onClick={() => grandchildren.length > 0 && toggleExpand(r.key)}
                className={`w-full rounded-lg border p-3 text-left shadow-sm transition-colors ${
                  grandchildren.length > 0
                    ? (isExpanded ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:border-emerald-300 cursor-pointer")
                    : "border-gray-200 bg-white cursor-default"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">{r.name}</h3>
                    <p className="mt-0.5 text-xs text-gray-400">{r.key}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    {r.userCount ?? 0} 人
                  </span>
                </div>
              </button>
              {isExpanded && <ResourceTree parentKey={r.key} />}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">权限资源树</h2>
        {topResources.map((r) => {
          const isExpanded = expandedKeys.has(r.key);
          const hasChildren = getDirectChildren(r.key).length > 0;
          return (
            <div key={r.id} className="mb-3">
              <button
                onClick={() => hasChildren && toggleExpand(r.key)}
                className={`w-full rounded-lg border p-4 text-left shadow-sm transition-colors ${
                  hasChildren
                    ? (isExpanded ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400" : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50 cursor-pointer")
                    : "border-gray-200 bg-white cursor-default"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">{r.name}</h3>
                    {r.description && <p className="mt-1 text-xs text-gray-500">{r.description}</p>}
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    {r.userCount ?? 0} 人
                  </span>
                </div>
              </button>
              {isExpanded && <ResourceTree parentKey={r.key} />}
            </div>
          );
        })}
      </section>

      {user.isWorkListAdmin && (
        <SystemAdminsSection
          sysLoading={sysLoading}
          systemAdmins={systemAdmins}
          sysConfirm={sysConfirm}
          sysSearchQ={sysSearchQ}
          sysResults={sysResults}
          onSearchChange={setSysSearchQ}
          onAdd={addSystemAdmin}
          onRemove={handleRemoveSystemAdmin}
        />
      )}
    </div>
  );
}
