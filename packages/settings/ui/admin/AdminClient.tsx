"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPageBody, createPageTabBar, PageSurface, useFeedback, type PageSurfaceFooterSpec, type SurfaceToolbarItem } from "@workspace/core/ui";
import { useModuleManagementSection } from "./tabs/ModuleManagementTab";
import { usePermissionsTabBody } from "./tabs/PermissionsTab";
import { useSpacePermissionsTabBody, type SpaceFilter } from "./tabs/SpacePermissionsTab";
import { usePermissionLedgerTab } from "./tabs/PermissionLedgerTab";
import { useWorkflowLedgerTab } from "./tabs/WorkflowLedgerTab";
import { useWorkflowPoliciesTab } from "./tabs/WorkflowPoliciesTab";
import { useAgentPermissionPolicyTab } from "./tabs/AgentPermissionPolicyTab";
import { useBusinessCodeConfigTab } from "./tabs/BusinessCodeConfigTab";
import { useDatabaseRelationsTab } from "./tabs/DatabaseRelationsTab";
import { usePermissionsTab } from "./hooks/usePermissionsTab";
import { flattenTree } from "./lib";

import type { ResourceItem, SubjectType } from "./types";
import type { SessionUser } from "@workspace/platform/types";
import { isWorkflowManagementResourceKey } from "@workspace/platform/workflow-management-resource-keys";

export default function AdminClient({ user }: { user: SessionUser }) {
  const isSuperAdmin = user.isSuperAdmin ?? false;
  const canUseResourcePermissions = isSuperAdmin || (user.manageableResourceKeys?.length ?? 0) > 0;
  const canUseWorkflowAdmin = isSuperAdmin || (user.adminResourceKeys ?? []).some(isWorkflowManagementResourceKey);
  const [activeTab, setActiveTab] = useState<"permissions" | "ledger" | "workflowPolicies" | "workflowLedger" | "codes" | "dataRelations" | "agentPolicy" | "modules">(
    () => canUseWorkflowAdmin ? "workflowPolicies" : "permissions",
  );
  const [permissionSubjectType, setPermissionSubjectType] = useState<SubjectType>("user");
  const [permissionResourceMode, setPermissionResourceMode] = useState<"normal" | "space">("normal");
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>("all");

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [capabilitiesByOwner, setCapabilitiesByOwner] = useState<Record<string, ResourceItem[]>>({});
  const [conflictStrategy, setConflictStrategy] = useState("union");

  const feedback = useFeedback();
  const showToast = feedback.notify;

  const selectPrimaryTab = useCallback((key: string) => {
    if (key === "workflow") {
      setActiveTab("workflowPolicies");
      return;
    }
    if (key === "permissions") {
      setActiveTab("permissions");
      return;
    }
    if (key === "codes" || key === "dataRelations" || key === "agentPolicy" || key === "modules") setActiveTab(key);
  }, []);
  const capabilities = useMemo(
    () => Object.values(capabilitiesByOwner).flatMap(flattenTree),
    [capabilitiesByOwner],
  );
  const resourceLookup = useMemo(
    () => [...resources, ...capabilities],
    [resources, capabilities],
  );
  const normalPermissionState = usePermissionsTab(
    resources,
    resourceLookup,
    showToast,
    canUseResourcePermissions && activeTab === "permissions" && permissionResourceMode === "normal",
    isSuperAdmin,
    permissionSubjectType,
  );
  const spacePermissionState = usePermissionsTab(
    [],
    [],
    showToast,
    canUseResourcePermissions && activeTab === "permissions" && permissionResourceMode === "space",
    isSuperAdmin,
    permissionSubjectType,
  );
  const permissionState = permissionResourceMode === "space" ? spacePermissionState : normalPermissionState;

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      if (!canUseResourcePermissions || activeTab !== "permissions" || permissionResourceMode !== "normal" || resourcesLoaded) return;
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
  }, [activeTab, permissionResourceMode, resourcesLoaded, showToast, isSuperAdmin, canUseResourcePermissions]);

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
    {
      kind: "option-group",
      key: "permission-resource-mode",
      label: "资源范围",
      value: permissionResourceMode,
      options: [
        { value: "normal", label: "普通" },
        { value: "space", label: "空间" },
      ],
      presentation: "segmented",
      onChange: (value) => setPermissionResourceMode(value as "normal" | "space"),
      ariaLabel: "普通或空间权限",
    },
    ...(permissionResourceMode === "normal" && isSuperAdmin
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
    ...(permissionResourceMode === "space"
      ? [{
          kind: "option-group" as const,
          key: "space-filter",
          label: "空间类型",
          value: spaceFilter,
          options: [
            { value: "all", label: "全部空间" },
            { value: "department", label: "部门空间" },
            { value: "project", label: "项目空间" },
          ],
          presentation: "segmented" as const,
          onChange: (value: string) => setSpaceFilter(value as SpaceFilter),
          ariaLabel: "空间类型筛选",
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

  const permissionFooter: PageSurfaceFooterSpec | undefined = (
    permissionResourceMode === "normal" || Boolean(permissionState.selectedResource)
  ) && permissionState.totalSubjects > permissionState.pageSize
    ? {
        pagination: {
          page: permissionState.page,
          totalPages: permissionState.totalPages,
          total: permissionState.totalSubjects,
          onPageChange: permissionState.setPage,
        },
      }
    : undefined;

  const subjectTabs = [
    { key: "user", label: isSuperAdmin ? "员工" : "员工（只读）" },
    { key: "position", label: "岗位" },
    { key: "department", label: "部门" },
  ];

  const activePrimaryTab = activeTab === "workflowPolicies" || activeTab === "workflowLedger"
    ? "workflow"
    : activeTab === "permissions" || activeTab === "ledger"
      ? "permissions"
      : activeTab;
  const activeChildTab = activePrimaryTab === "workflow"
    ? activeTab
    : activePrimaryTab === "permissions"
      ? activeTab === "ledger" ? "ledger" : permissionSubjectType
      : undefined;

  const tabs = [
    ...(canUseWorkflowAdmin ? [{
      key: "workflow" as const,
      label: "流程管理",
      children: [
        { key: "workflowPolicies", label: "设置" },
        { key: "workflowLedger", label: "台账" },
      ],
    }] : []),
    ...(canUseResourcePermissions ? [{
      key: "permissions" as const,
      label: "权限管理",
      children: [...subjectTabs, { key: "ledger", label: "台账" }],
    }] : []),
    ...(isSuperAdmin ? [{ key: "codes" as const, label: "编码管理" }] : []),
    ...(isSuperAdmin ? [{ key: "dataRelations" as const, label: "数据关系" }] : []),
    ...(isSuperAdmin ? [{ key: "agentPolicy" as const, label: "智能体" }] : []),
    ...(isSuperAdmin ? [{ key: "modules" as const, label: "模块管理" }] : []),
  ];

  const permissionsBody = usePermissionsTabBody({
    resources,
    capabilitiesByOwner,
    s: normalPermissionState,
  });
  const spacePermissionsBody = useSpacePermissionsTabBody({
    enabled: activeTab === "permissions" && permissionResourceMode === "space",
    onToast: showToast,
    spaceFilter,
    s: spacePermissionState,
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
  const businessCodeConfigTab = useBusinessCodeConfigTab({
    enabled: activeTab === "codes" && isSuperAdmin,
    showToast,
  });
  const databaseRelationsTab = useDatabaseRelationsTab({
    enabled: activeTab === "dataRelations" && isSuperAdmin,
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
	        active: activePrimaryTab,
	        activeChild: activeChildTab,
	        onChange: selectPrimaryTab,
	        onChildChange: (key: string) => {
            if (key === "workflowPolicies" || key === "workflowLedger") {
              setActiveTab(key);
              return;
            }
            if (key === "ledger") {
              setActiveTab("ledger");
              return;
            }
            if (!canUseResourcePermissions || (key !== "user" && key !== "position" && key !== "department")) return;
            setActiveTab("permissions");
            setPermissionSubjectType(key);
	        },
	      })}
      toolbar={canUseResourcePermissions && activeTab === "permissions"
          ? { items: permissionToolbarItems }
          : activeTab === "ledger"
            ? { items: ledgerTab.toolbarItems }
          : activeTab === "workflowPolicies"
            ? { items: workflowPoliciesTab.toolbarItems }
          : activeTab === "workflowLedger"
            ? { items: workflowLedgerTab.toolbarItems }
          : activeTab === "codes"
            ? { items: businessCodeConfigTab.toolbarItems }
          : activeTab === "dataRelations"
            ? { items: databaseRelationsTab.toolbarItems }
          : undefined}
      footer={canUseResourcePermissions && activeTab === "permissions" ? permissionFooter : activeTab === "ledger" ? ledgerTab.footer : activeTab === "workflowLedger" ? workflowLedgerTab.footer : undefined}
		      body={resourcesLoading && canUseResourcePermissions && activeTab === "permissions" && permissionResourceMode === "normal"
            ? { kind: "section", empty: { content: "加载中..." } }
            : activeTab === "permissions"
              ? permissionResourceMode === "space" ? spacePermissionsBody : permissionsBody
              : activeTab === "ledger"
                ? ledgerTab.body
              : activeTab === "workflowPolicies"
                ? workflowPoliciesTab.body
              : activeTab === "workflowLedger"
                ? workflowLedgerTab.body
              : activeTab === "codes"
                ? businessCodeConfigTab.body
              : activeTab === "dataRelations"
                ? databaseRelationsTab.body
              : activeTab === "agentPolicy"
                ? agentPolicyTab.body
              : createPageBody([modulesSection])}
	    />
  );
}
