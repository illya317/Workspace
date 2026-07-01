"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPageBody, createPageTabsNavigation, PageSurface, useFeedback, type InputOption, type PageSurfaceFooterSpec, type SurfaceToolbarItem } from "@workspace/core/ui";
import { useModuleManagementSection } from "./tabs/ModuleManagementTab";
import { usePermissionsTabBody } from "./tabs/PermissionsTab";
import { useSpacePermissionsTabBody } from "./tabs/SpacePermissionsTab";
import { usePermissionsTab } from "./hooks/usePermissionsTab";

import type { ResourceItem, SubjectType } from "./types";
import type { SessionUser } from "@workspace/platform/types";

export default function AdminClient({ user }: { user: SessionUser }) {
  const isSuperAdmin = user.isSuperAdmin ?? false;
  const canUseResourcePermissions = isSuperAdmin || (user.manageableResourceKeys?.length ?? 0) > 0;
  const [activeTab, setActiveTab] = useState<"permissions" | "modules">("permissions");
  const [permissionMode, setPermissionMode] = useState<SubjectType | "space">(
    () => canUseResourcePermissions ? "user" : "space",
  );
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const [spaceNameSearch, setSpaceNameSearch] = useState("");
  const [spacePage, setSpacePage] = useState(0);
  const [spacePageSize, setSpacePageSize] = useState(50);
  const [spaceTotalSubjects, setSpaceTotalSubjects] = useState(0);
  const [spaceTotalPages, setSpaceTotalPages] = useState(1);
  const [spaceNameSearchOptions, setSpaceNameSearchOptions] = useState<InputOption[]>([]);

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [capabilitiesByOwner, setCapabilitiesByOwner] = useState<Record<string, ResourceItem[]>>({});
  const [conflictStrategy, setConflictStrategy] = useState("union");

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
  const permissionState = usePermissionsTab(
    resources,
    resourceLookup,
    showToast,
    activeTab === "permissions" && permissionMode !== "space",
  );

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      if (activeTab !== "permissions" || permissionMode === "space" || resourcesLoaded) return;
      setResourcesLoading(true);
      try {
        const resRes = await fetch(workspacePath("/api/settings/admin/permissions"));
        if (!cancelled) {
          if (!resRes.ok) showToast("加载权限资源失败: " + resRes.status, "error");
          const resData = await resRes.json();
          // API already filters by manageableKeys — no client-side second filter needed
          setResources((resData.resources || []) as ResourceItem[]);
          setCapabilitiesByOwner((resData.capabilitiesByOwner || {}) as Record<string, ResourceItem[]>);
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
        if (!cancelled) {
          setResourcesLoading(false);
          setResourcesLoaded(true);
        }
      }
    }
    loadInitial();
    return () => { cancelled = true; };
  }, [activeTab, permissionMode, resourcesLoaded, showToast, isSuperAdmin]);

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

  const subjectSearchPlaceholder =
    permissionState.subjectType === "user"
      ? "筛选姓名"
      : permissionState.subjectType === "position"
        ? "筛选岗位"
        : "筛选部门";

  const permissionToolbarItems: SurfaceToolbarItem[] = [
    ...(permissionState.selectedResource && permissionState.isSystemAdmin
      ? [{
          kind: "option-group" as const,
          key: "max-role",
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
    ...(permissionState.subjectType !== "department"
      ? [{
          kind: "autocomplete" as const,
          key: "department-filter",
          value: permissionState.selectedDepartmentFilter ?? "",
          options: permissionState.departmentFilterOptions ?? [],
          onChange: (value: string) => permissionState.setDepartmentFilter(String(value ?? "")),
          placeholder: "搜索部门",
          ariaLabel: "搜索部门",
          visibleCount: 5,
        }]
      : []),
    {
      kind: "autocomplete",
      key: "subject-search",
      value: permissionState.nameSearch,
      options: permissionState.nameSearchOptions ?? [],
      onChange: (value) => permissionState.setNameSearch(String(value ?? "")),
      placeholder: subjectSearchPlaceholder,
      ariaLabel: "搜索授权对象",
      visibleCount: 5,
    },
    {
      kind: "page-size",
      key: "page-size",
      label: "分页",
      value: String(permissionState.pageSize),
      options: [20, 50, 100].map((value) => ({ value: String(value), label: `${value}条/页` })),
      onChange: (value) => permissionState.setPageSize(Number(value)),
    },
  ];

  const permissionFooter: PageSurfaceFooterSpec | undefined = permissionState.totalSubjects > permissionState.pageSize
    ? {
        pagination: {
          page: permissionState.page,
          totalPages: permissionState.totalPages,
          total: permissionState.totalSubjects,
          onPageChange: permissionState.setPage,
        },
      }
    : undefined;
  const handleSpacePageMetaChange = useCallback(({ total, totalPages }: { total: number; totalPages: number }) => {
    setSpaceTotalSubjects(total);
    setSpaceTotalPages(totalPages);
    setSpacePage((current) => Math.min(current, totalPages - 1));
  }, []);
  const spaceToolbarItems: SurfaceToolbarItem[] = [
    {
      kind: "autocomplete",
      key: "space-subject-search",
      value: spaceNameSearch,
      options: spaceNameSearchOptions,
      onChange: (value) => {
        setSpaceNameSearch(String(value ?? ""));
        setSpacePage(0);
      },
      placeholder: "筛选姓名",
      ariaLabel: "筛选姓名",
      visibleCount: 5,
    },
    {
      kind: "page-size",
      key: "space-page-size",
      label: "分页",
      value: String(spacePageSize),
      options: [20, 50, 100].map((value) => ({ value: String(value), label: `${value}条/页` })),
      onChange: (value) => {
        setSpacePageSize(Number(value));
        setSpacePage(0);
      },
    },
  ];
  const spaceFooter: PageSurfaceFooterSpec | undefined = spaceTotalSubjects > spacePageSize
    ? {
        pagination: {
          page: spacePage,
          totalPages: spaceTotalPages,
          total: spaceTotalSubjects,
          onPageChange: setSpacePage,
        },
      }
    : undefined;

  const subjectTabs = [
    { key: "user", label: "员工" },
    { key: "position", label: "岗位" },
    { key: "department", label: "部门" },
    { key: "space", label: "空间" },
  ];

  const tabs = [
    { key: "permissions" as const, label: "权限管理", children: subjectTabs },
    ...(isSuperAdmin ? [{ key: "modules" as const, label: "模块管理" }] : []),
  ];

  const permissionsBody = usePermissionsTabBody({
    resources,
    capabilitiesByOwner,
    s: permissionState,
  });
  const spacePermissionsBody = useSpacePermissionsTabBody({
    enabled: activeTab === "permissions" && permissionMode === "space",
    onToast: showToast,
    nameSearch: spaceNameSearch,
    page: spacePage,
    pageSize: spacePageSize,
    onPageMetaChange: handleSpacePageMetaChange,
    onNameSearchOptionsChange: setSpaceNameSearchOptions,
  });
  const modulesSection = useModuleManagementSection({
    showToast,
    enabled: activeTab === "modules",
  });

  return (
    <PageSurface kind="standard"
	      navigation={createPageTabsNavigation({
	        items: tabs,
	        active: activeTab,
	        activeChild: activeTab === "permissions" ? permissionMode : undefined,
	        onChange: (k: string) => setActiveTab(k as typeof activeTab),
	        onChildChange: activeTab === "permissions" ? (key: string) => {
            if (key === "space") {
              setPermissionMode("space");
              return;
            }
            setPermissionMode(key as SubjectType);
            permissionState.setSubjectType(key as SubjectType);
          } : undefined,
	      })}
      toolbar={activeTab === "permissions" && permissionMode !== "space"
          ? { items: permissionToolbarItems }
          : activeTab === "permissions" && permissionMode === "space"
            ? { items: spaceToolbarItems }
          : undefined}
      footer={activeTab === "permissions" && permissionMode !== "space" ? permissionFooter : activeTab === "permissions" && permissionMode === "space" ? spaceFooter : undefined}
		      body={resourcesLoading && activeTab === "permissions" && permissionMode !== "space"
            ? { kind: "section", empty: { content: "加载中..." } }
            : activeTab === "permissions"
              ? permissionMode === "space" ? spacePermissionsBody : permissionsBody
              : createPageBody([modulesSection])}
	    />
  );
}
