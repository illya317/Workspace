"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import NavLink from "@/app/components/NavLink";
import UserMenu from "@/app/components/UserMenu";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import AdminUsersTab from "./tabs/AdminUsersTab";
import PermissionsTab from "./tabs/PermissionsTab";

import type { ResourceItem } from "./types";
import { flattenTree } from "./lib";
import { SessionUser } from "@/lib/types";

export default function AdminClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = user.isSuperAdmin ?? false;
  const [activeTab, setActiveTab] = useState<"users" | "permissions">(isSuperAdmin ? "users" : "permissions");

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [conflictStrategy, setConflictStrategy] = useState("union");

  const { toast, showToast, closeToast } = useToast();

  const manageableKeys = useMemo(
    () => new Set(user.manageableResourceKeys || []),
    [user.manageableResourceKeys]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const resRes = await fetch("/api/admin/permissions");
        if (!cancelled) {
          if (!resRes.ok) showToast("加载权限资源失败: " + resRes.status, "error");
          const resData = await resRes.json();
          const all = flattenTree(resData.resources || []);
          // Filter to only manageable resources (defense in depth; API already filters)
          const filtered = isSuperAdmin
            ? all
            : all.filter((r) => manageableKeys.has(r.key));
          setResources(filtered);
          try {
            const cfgRes = await fetch("/api/admin/system-config");
            if (cfgRes.ok) {
              const cfgData = await cfgRes.json();
              setConflictStrategy(cfgData.conflictStrategy || "union");
            }
          } catch { /* config endpoint optional */ }
        }
      } catch {
        if (!cancelled) showToast("加载后台数据失败，请刷新重试", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitial();
    return () => { cancelled = true; };
  }, [showToast, isSuperAdmin, manageableKeys]);

  async function saveConflictStrategy(strategy: string) {
    const res = await fetch("/api/admin/system-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conflictStrategy: strategy }),
    });
    if (res.ok) {
      setConflictStrategy(strategy);
      showToast("已更新冲突策略", "success");
    } else {
      showToast("更新失败", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  const tabs = [
    ...(isSuperAdmin ? [{ key: "users" as const, label: "用户账号" }] : []),
    { key: "permissions" as const, label: "权限管理" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt="logo" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
            <NavLink href="/hr">人事行政</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-800">管理后台</h1>

        <div className="mb-6 flex gap-4 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-2 text-sm font-medium ${activeTab === t.key ? "border-b-2 border-emerald-500 text-emerald-600" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === "users" && <AdminUsersTab showToast={showToast} />}
          {activeTab === "permissions" && <PermissionsTab resources={resources} showToast={showToast} />}
        </div>

        {/* System Config */}
        {isSuperAdmin && (
          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">系统配置</h3>
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-600">权限冲突策略：</label>
              <select
                value={conflictStrategy}
                onChange={(e) => saveConflictStrategy(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              >
                <option value="union">并集（任一有权限即可）</option>
                <option value="deny_override">拒绝优先</option>
              </select>
              <span className="text-xs text-gray-400">
                {conflictStrategy === "union" ? "用户、岗位、部门任一授权即通过" : "任一来源拒绝则拒绝"}
              </span>
            </div>
          </div>
        )}
      </main>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
