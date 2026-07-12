"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPageBody, createPageTabBar, PageSurface, useFeedback, type PageSurfaceFooterSpec, type SurfaceAutocompleteOptionSpec, type SurfaceToolbarItem } from "@workspace/core/ui";
import { useModuleManagementSection } from "./tabs/ModuleManagementTab";
import { usePermissionsTabBody } from "./tabs/PermissionsTab";
import { useSpacePermissionsTabBody } from "./tabs/SpacePermissionsTab";
import { usePermissionLedgerTab } from "./tabs/PermissionLedgerTab";
import { useWorkflowLedgerTab } from "./tabs/WorkflowLedgerTab";
import { useWorkflowPoliciesTab } from "./tabs/WorkflowPoliciesTab";
import { useAgentPermissionPolicyTab } from "./tabs/AgentPermissionPolicyTab";
import { usePermissionsTab } from "./hooks/usePermissionsTab";
import { flattenTree } from "./lib";

import type { ResourceItem, SubjectType } from "./types";
import type { SessionUser } from "@workspace/platform/types";
import { isWorkflowManagementResourceKey } from "../../workflow-management-resource-keys";

export default function AdminClient({ user }: { user: SessionUser }) {
  const isSuperAdmin = user.isSuperAdmin ?? false;
  const canUseResourcePermissions = isSuperAdmin || (user.manageableResourceKeys?.length ?? 0) > 0;
  const canUseWorkflowAdmin = isSuperAdmin || (user.adminResourceKeys ?? []).some(isWorkflowManagementResourceKey);
  const [activeTab, setActiveTab] = useState<"permissions" | "ledger" | "workflowPolicies" | "workflowLedger" | "agentPolicy" | "modules">(
    () => canUseWorkflowAdmin ? "workflowPolicies" : "permissions",
  );
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
  const [spaceNameSearchOptions, setSpaceNameSearchOptions] = useState<SurfaceAutocompleteOptionSpec[]>([]);

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [capabilitiesByOwner, setCapabilitiesByOwner] = useState<Record<string, ResourceItem[]>>({});
  const [conflictStrategy, setConflictStrategy] = useState("union");

  const feedback = useFeedback();
  const showToast = feedback.notify;
  const capabilities = useMemo(
    () => Object.values(capabilitiesByOwner).flatMap(flattenTree),
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
    canUseResourcePermissions && activeTab === "permissions" && permissionMode !== "space",
  );

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      if (!canUseResourcePermissions || activeTab !== "permissions" || permissionMode === "space" || resourcesLoaded) return;
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
  }, [activeTab, permissionMode, resourcesLoaded, showToast, isSuperAdmin, canUseResourcePermissions]);

  useEffect(() => {
    if (!canUseResourcePermissions && permissionMode !== "space") setPermissionMode("space");
  }, [canUseResourcePermissions, permissionMode]);

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

  const subjectTabs = canUseResourcePermissions
    ? [
        { key: "user", label: "员工" },
        { key: "position", label: "岗位" },
        { key: "department", label: "部门" },
        { key: "space", label: "空间" },
      ]
    : [{ key: "space", label: "空间" }];

  const tabs = [
    ...(canUseWorkflowAdmin ? [{
      key: "workflowPolicies" as const,
      label: "流程设置",
    }] : []),
    ...(canUseWorkflowAdmin ? [{
      key: "workflowLedger" as const,
      label: "流程台账",
    }] : []),
    ...(canUseResourcePermissions ? [{ key: "permissions" as const, label: "权限管理", children: subjectTabs }] : []),
    ...(canUseResourcePermissions ? [{ key: "ledger" as const, label: "权限台账" }] : []),
    ...(isSuperAdmin ? [{ key: "agentPolicy" as const, label: "智能体" }] : []),
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
  const ledgerTab = usePermissionLedgerTab({
    enabled: activeTab === "ledger",
    showToast,
  });
  const workflowPoliciesTab = useWorkflowPoliciesTab({
    enabled: activeTab === "workflowPolicies" && canUseWorkflowAdmin,
    showToast,
  });
  const workflowLedgerTab = useWorkflowLedgerTab({
    enabled: activeTab === "workflowLedger" && canUseWorkflowAdmin,
    showToast,
  });
  const agentPolicyTab = useAgentPermissionPolicyTab({
    enabled: activeTab === "agentPolicy" && isSuperAdmin,
    showToast,
  });
  const modulesSection = useModuleManagementSection({
    showToast,
    enabled: activeTab === "modules",
  });

  return (
	    <PageSurface kind="standard"
	      tabbar={createPageTabBar({
	        items: tabs,
	        active: activeTab,
	        activeChild: activeTab === "permissions" ? permissionMode : undefined,
	        onChange: (k: string) => setActiveTab(k as typeof activeTab),
	        onChildChange: activeTab === "permissions" ? (key: string) => {
            if (key === "space") {
              setPermissionMode("space");
              return;
            }
            if (!canUseResourcePermissions) return;
            setPermissionMode(key as SubjectType);
            permissionState.setSubjectType(key as SubjectType);
          } : undefined,
	      })}
      toolbar={canUseResourcePermissions && activeTab === "permissions" && permissionMode !== "space"
          ? { items: permissionToolbarItems }
          : activeTab === "permissions" && permissionMode === "space"
            ? { items: spaceToolbarItems }
          : activeTab === "ledger"
            ? { items: ledgerTab.toolbarItems }
          : activeTab === "workflowPolicies"
            ? { items: workflowPoliciesTab.toolbarItems }
          : activeTab === "workflowLedger"
            ? { items: workflowLedgerTab.toolbarItems }
          : undefined}
      footer={canUseResourcePermissions && activeTab === "permissions" && permissionMode !== "space" ? permissionFooter : activeTab === "permissions" && permissionMode === "space" ? spaceFooter : activeTab === "ledger" ? ledgerTab.footer : activeTab === "workflowLedger" ? workflowLedgerTab.footer : undefined}
		      body={resourcesLoading && canUseResourcePermissions && activeTab === "permissions" && permissionMode !== "space"
            ? { kind: "section", empty: { content: "加载中..." } }
            : activeTab === "permissions"
              ? permissionMode === "space" ? spacePermissionsBody : permissionsBody
              : activeTab === "ledger"
                ? ledgerTab.body
              : activeTab === "workflowPolicies"
                ? workflowPoliciesTab.body
              : activeTab === "workflowLedger"
                ? workflowLedgerTab.body
              : activeTab === "agentPolicy"
                ? agentPolicyTab.body
              : createPageBody([modulesSection])}
	    />
  );
}
