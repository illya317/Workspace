"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useMemo, useState } from "react";
import { createBlockSurfaceSection, createSectionsSection, createPageBody, createPageTabsNavigation, PageSurface, useFeedback, type PageSurfaceSectionSpec, type PageSurfaceFooterSpec, type SurfaceToolbarItem } from "@workspace/core/ui";
import AdminUsersTab from "./tabs/AdminUsersTab";
import ModuleManagementTab from "./tabs/ModuleManagementTab";
import PermissionsTab from "./tabs/PermissionsTab";
import { usePermissionsTab } from "./hooks/usePermissionsTab";

import type { ResourceItem, SubjectType } from "./types";
import type { SessionUser } from "@workspace/platform/types";

export default function AdminClient({ user }: { user: SessionUser }) {
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = user.isSuperAdmin ?? false;
  const [activeTab, setActiveTab] = useState<"users" | "permissions" | "modules">(isSuperAdmin ? "users" : "permissions");

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [fullResourceTree, setFullResourceTree] = useState<ResourceItem[]>([]);
  const [capabilitiesByOwner, setCapabilitiesByOwner] = useState<Record<string, ResourceItem[]>>({});
  const [conflictStrategy, setConflictStrategy] = useState("union");
  const [childToolbarItems, setChildToolbarItems] = useState<SurfaceToolbarItem[]>([]);
  const [childFooter, setChildFooter] = useState<PageSurfaceFooterSpec | undefined>();

  const feedback = useFeedback();
  const showToast = feedback.notify;
  const capabilities = useMemo(
    () => Object.values(capabilitiesByOwner).flat(),
    [capabilitiesByOwner],
  );
  const resourceLookup = useMemo(
    () => [...resources, ...capabilities],
    [resources, capabilities],
  );
  const permissionState = usePermissionsTab(resources, resourceLookup, showToast);

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

  useEffect(() => {
    setChildToolbarItems([]);
    setChildFooter(undefined);
  }, [activeTab]);

  const subjectSearchPlaceholder =
    permissionState.subjectType === "user"
      ? "搜索姓名..."
      : permissionState.subjectType === "position"
        ? "搜索岗位..."
        : "搜索部门...";

  const permissionToolbarItems: SurfaceToolbarItem[] = [
    ...(permissionState.subjectType !== "department"
      ? [{
          kind: "autocomplete" as const,
          key: "department-filter",
          section: "filter" as const,
          value: permissionState.selectedDepartmentFilter ?? "",
          options: permissionState.departmentFilterOptions ?? [],
          onChange: (value: string) => permissionState.setDepartmentFilter(String(value ?? "")),
          placeholder: "搜索部门",
          ariaLabel: "搜索部门",
          visibleCount: 8,
        }]
      : []),
    {
      kind: "search",
      key: "subject-search",
      section: "search",
      value: permissionState.nameSearch,
      onChange: (value) => permissionState.setNameSearch(String(value ?? "")),
      placeholder: subjectSearchPlaceholder,
      ariaLabel: "搜索授权对象",
    },
    ...(permissionState.selectedResource && permissionState.isSystemAdmin
      ? [{
          kind: "option-group" as const,
          key: "max-role",
          section: "filter" as const,
          label: "最高业务权限",
          value: permissionState.maxRoleKey === "admin" ? "delete" : permissionState.maxRoleKey,
          options: [
            { value: "access", label: "访问" },
            { value: "write", label: "编辑" },
            { value: "delete", label: "删除" },
          ],
          onChange: permissionState.updateMaxRole,
          ariaLabel: "最高业务权限",
        }]
      : []),
    ...(isSuperAdmin
      ? [{
          kind: "option-group" as const,
          key: "conflict-strategy",
          section: "filter" as const,
          label: "权限冲突策略",
          value: conflictStrategy,
          options: [
            { value: "union", label: "并集" },
            { value: "deny_override", label: "拒绝优先" },
          ],
          onChange: saveConflictStrategy,
          ariaLabel: "权限冲突策略",
        }]
      : []),
  ];

  const subjectTabs = [
    { key: "user", label: "员工" },
    { key: "position", label: "岗位" },
    { key: "department", label: "部门" },
  ];

  const tabs = [
    ...(isSuperAdmin ? [{ key: "users" as const, label: "用户账号" }] : []),
    { key: "permissions" as const, label: "权限管理", children: subjectTabs },
    ...(isSuperAdmin ? [{ key: "modules" as const, label: "模块管理" }] : []),
  ];

  const sections: PageSurfaceSectionSpec[] = [
    createSectionsSection("active-admin-tab", {
      sections: [createBlockSurfaceSection(activeTab, {
        kind: "message",

        content: (
          <div className="space-y-4">
            {activeTab === "users" && (
              <AdminUsersTab
                showToast={showToast}
                resources={fullResourceTree}
                onToolbarItemsChange={setChildToolbarItems}
                onFooterChange={setChildFooter}
              />
            )}
            {activeTab === "modules" && <ModuleManagementTab showToast={showToast} />}
            {activeTab === "permissions" && (
              <PermissionsTab
                resources={resources}
                capabilitiesByOwner={capabilitiesByOwner}
                s={permissionState}
              />
            )}
          </div>
        )
      })],
    }),
  ];

  return (
    <PageSurface kind="standard"
	      navigation={loading ? undefined : createPageTabsNavigation({
	        items: tabs,
	        active: activeTab,
	        activeChild: activeTab === "permissions" ? permissionState.subjectType : undefined,
	        onChange: (k: string) => setActiveTab(k as typeof activeTab),
	        onChildChange: activeTab === "permissions" ? (key: string) => permissionState.setSubjectType(key as SubjectType) : undefined,
	      })}
      toolbar={loading
        ? undefined
        : activeTab === "permissions"
          ? { items: permissionToolbarItems }
          : childToolbarItems.length > 0
            ? { items: childToolbarItems }
            : undefined}
      footer={loading ? undefined : activeTab === "users" ? childFooter : undefined}
		      body={loading ? { kind: "complete", empty: { content: "加载中..." } } : createPageBody(sections)}
	    />
  );
}
