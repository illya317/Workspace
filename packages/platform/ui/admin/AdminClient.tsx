"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { EmptyStateCard, FormField, SectionCard, SelectField, Toast } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import { DatabasePageFrame } from "@workspace/core/ui";
import AdminUsersTab from "./tabs/AdminUsersTab";
import ModuleManagementTab from "./tabs/ModuleManagementTab";
import PermissionsTab from "./tabs/PermissionsTab";

import type { ResourceItem } from "./types";
import { SessionUser } from "@workspace/platform/types";

export default function AdminClient({ user }: { user: SessionUser }) {
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = user.isSuperAdmin ?? false;
  const [activeTab, setActiveTab] = useState<"users" | "permissions" | "modules">(isSuperAdmin ? "users" : "permissions");

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [fullResourceTree, setFullResourceTree] = useState<ResourceItem[]>([]);
  const [capabilitiesByOwner, setCapabilitiesByOwner] = useState<Record<string, ResourceItem[]>>({});
  const [conflictStrategy, setConflictStrategy] = useState("union");

  const { toast, showToast, closeToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const resRes = await fetch(workspacePath("/api/settings/admin/permissions"));
        if (!cancelled) {
          if (!resRes.ok) showToast("加载权限资源失败: " + resRes.status, "error");
          const resData = await resRes.json();
          // API already filters by manageableKeys — no client-side second filter needed
          setResources((resData.resources || []) as ResourceItem[]);
          setCapabilitiesByOwner((resData.capabilitiesByOwner || {}) as Record<string, ResourceItem[]>);
          // Full tree for badge computation (unscoped)
          setFullResourceTree((resData.resourceTree || resData.resources || []) as ResourceItem[]);
          try {
            const cfgRes = await fetch(workspacePath("/api/settings/admin/system-config"));
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
    const res = await fetch(workspacePath("/api/settings/admin/system-config"), {
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
      <DatabasePageFrame contentClassName="py-8">
        <EmptyStateCard>加载中...</EmptyStateCard>
      </DatabasePageFrame>
    );
  }

  const tabs = [
    ...(isSuperAdmin ? [{ key: "users" as const, label: "用户账号" }] : []),
    { key: "permissions" as const, label: "权限管理" },
    ...(isSuperAdmin ? [{ key: "modules" as const, label: "模块管理" }] : []),
  ];

  return (
    <>
      <DatabasePageFrame
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(k) => setActiveTab(k as typeof activeTab)}
        contentClassName="py-8"
      >
        <div className="space-y-4">
          {activeTab === "users" && <AdminUsersTab showToast={showToast} resources={fullResourceTree} />}
          {activeTab === "modules" && <ModuleManagementTab showToast={showToast} />}
          {activeTab === "permissions" && (
            <PermissionsTab
              resources={resources}
              capabilitiesByOwner={capabilitiesByOwner}
              showToast={showToast}
            />
          )}
        </div>

        {/* System Config */}
        {isSuperAdmin && (
          <SectionCard title="系统配置" className="mt-8">
            <div className="flex items-center gap-4">
              <FormField label="权限冲突策略" layout="inline">
                <SelectField
                  value={conflictStrategy}
                  onChange={saveConflictStrategy}
                  options={[
                    { value: "union", label: "并集（任一有权限即可）" },
                    { value: "deny_override", label: "拒绝优先" },
                  ]}

                />
              </FormField>
              <span className="text-xs text-gray-400">
                {conflictStrategy === "union" ? "用户、岗位、部门任一授权即通过" : "任一来源拒绝则拒绝"}
              </span>
            </div>
          </SectionCard>
        )}
      </DatabasePageFrame>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </>
  );
}
