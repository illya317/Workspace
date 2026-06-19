"use client";

import { useEffect, useState } from "react";
import { PageContent, SectionCard, SelectField, TabBar, Toast } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import AdminUsersTab from "./tabs/AdminUsersTab";
import PermissionsTab from "./tabs/PermissionsTab";

import type { ResourceItem } from "./types";
import { SessionUser } from "@workspace/platform/types";

export default function AdminClient({ user }: { user: SessionUser }) {
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = user.isSuperAdmin ?? false;
  const [activeTab, setActiveTab] = useState<"users" | "permissions">(isSuperAdmin ? "users" : "permissions");

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [fullResourceTree, setFullResourceTree] = useState<ResourceItem[]>([]);
  const [conflictStrategy, setConflictStrategy] = useState("union");

  const { toast, showToast, closeToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const resRes = await fetch("/workspace/api/admin/permissions");
        if (!cancelled) {
          if (!resRes.ok) showToast("加载权限资源失败: " + resRes.status, "error");
          const resData = await resRes.json();
          // API already filters by manageableKeys — no client-side second filter needed
          setResources((resData.resources || []) as ResourceItem[]);
          // Full tree for badge computation (unscoped)
          setFullResourceTree((resData.resourceTree || resData.resources || []) as ResourceItem[]);
          try {
            const cfgRes = await fetch("/workspace/api/admin/system-config");
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
  }, [showToast, isSuperAdmin]);

  async function saveConflictStrategy(strategy: string) {
    const res = await fetch("/workspace/api/admin/system-config", {
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
    <>
      <PageContent className="py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-800">管理后台</h1>

        <TabBar tabs={tabs} active={activeTab} onChange={(k) => setActiveTab(k as typeof activeTab)} />

        <div className="space-y-4">
          {activeTab === "users" && <AdminUsersTab showToast={showToast} resources={fullResourceTree} />}
          {activeTab === "permissions" && <PermissionsTab resources={resources} showToast={showToast} />}
        </div>

        {/* System Config */}
        {isSuperAdmin && (
          <SectionCard title="系统配置" className="mt-8">
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-600">权限冲突策略：</label>
              <SelectField
                value={conflictStrategy}
                onChange={saveConflictStrategy}
                options={[
                  { value: "union", label: "并集（任一有权限即可）" },
                  { value: "deny_override", label: "拒绝优先" },
                ]}
                selectClassName="min-w-56 px-3 py-2 text-sm"
              />
              <span className="text-xs text-gray-400">
                {conflictStrategy === "union" ? "用户、岗位、部门任一授权即通过" : "任一来源拒绝则拒绝"}
              </span>
            </div>
          </SectionCard>
        )}
      </PageContent>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </>
  );
}
