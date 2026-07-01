"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSectionsSection, createMessageSection, createPageBody, createPanelSection, createSectionSection, PageSurface, useFeedback } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { createSpaceKindNavigation, createSpaceWorkbenchBody, type SpaceWorkbenchKindOption } from "@workspace/platform/ui";
import type { SessionUser } from "@workspace/platform/types";
import {
  archiveWorkPlan,
  createWorkPlan,
  deleteWorkPlan,
  listTaskSpaces,
  listWorkPlans,
  updateWorkPlan,
} from "./api";
import {
  createEmptyWorkDraft,
  createEmptyWorkPlanDraft,
  createWorkPlanDraft,
  getWorkSpacePath,
  getWorkTargetFromPath,
  isWorkPlanDraftDirty,
} from "./model";
import { useWorks } from "./useWorks";
import { createSpaceMetricsSection, nextSortOrder, normalizeInitialTarget, roleAllows, sameTarget } from "./works-client-helpers";
import { useWorkPermissionsSections } from "./WorkPermissionsPanel";
import { createWorkReportsPanelSections, useWorkReportsController } from "./WorkReportsPanel";
import { useWorkTaskTableSection } from "./WorkTaskTable";
import { useWorkTaskFormSurface } from "./WorkTaskFields";
import { createWorkPlanContentSection } from "./WorkPlanSections";
import { applyDefaultExpandedWorkSpaces, createWorkSpaceNavigationBody, workSpaceKey } from "./WorkSpaceSidebar";
import { useWorkPlanFormSurface } from "./WorkPlanFields";
import { useWorkPlanPagination } from "./useWorkPlanPagination";
import { createWorkToolbarItems, type WorkSpaceTypeFilter } from "./WorkToolbar";
import type { WorkItem, WorkItemType, WorkPlan, WorkPlanDraft, WorkTarget, WorkTaskSpace } from "./types";

export default function WorksClient({ initialTarget }: {
  user: SessionUser;
  hideShell?: boolean;
  initialTarget?: WorkTarget;
}) {
  const feedback = useFeedback();
  const [spaces, setSpaces] = useState<WorkTaskSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [activeTarget, setActiveTarget] = useState<WorkTarget | null>(null);
  const [activeTab, setActiveTab] = useState("tasks");
  const [plans, setPlans] = useState<WorkPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [planCreating, setPlanCreating] = useState(false);
  const [planDraft, setPlanDraft] = useState<WorkPlanDraft>(() => createEmptyWorkPlanDraft());
  const [spaceTypeFilter, setSpaceTypeFilter] = useState<WorkSpaceTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "done" | "archived">("active");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedSpaceKeys, setExpandedSpaceKeys] = useState<Set<string>>(() => new Set());

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) || null,
    [activePlanId, plans],
  );
  const activePlanDraft = useMemo(
    () => activePlan ? createWorkPlanDraft(activePlan) : null,
    [activePlan],
  );
  const planDirty = useMemo(
    () => isWorkPlanDraftDirty(activePlanDraft, planDraft),
    [activePlanDraft, planDraft],
  );
  const filteredSpaces = useMemo(
    () => spaceTypeFilter === "all" ? spaces : spaces.filter((space) => space.targetType === spaceTypeFilter),
    [spaceTypeFilter, spaces],
  );
  const filteredPlans = useMemo(
    () => spaceTypeFilter === "all" ? plans : plans.filter((plan) => plan.targetType === spaceTypeFilter),
    [plans, spaceTypeFilter],
  );
  const planPagination = useWorkPlanPagination(activePlan, filteredPlans);
  const currentSpace = useMemo(() => {
    const target = activePlan ? { targetType: activePlan.targetType, targetId: activePlan.targetId } : activeTarget;
    return spaces.find((space) => sameTarget(space, target)) || null;
  }, [activePlan, activeTarget, spaces]);
  const currentSpacePlans = useMemo(
    () => currentSpace ? plans.filter((plan) => sameTarget(plan, currentSpace)) : [],
    [currentSpace, plans],
  );
  const canEdit = roleAllows(currentSpace?.role, "editor");
  const canDelete = roleAllows(currentSpace?.role, "delete");
  const canManage = roleAllows(currentSpace?.role, "manager");
  const worksState = useWorks(currentSpace, activePlanId);
  const setWorkCreating = worksState.setCreating;
  const showToast = useCallback((message: string, type: "success" | "error") => feedback.notify(message, type), [feedback]);
  const showReportToast = useCallback((toast: { message: string; type: "success" | "error" }) => showToast(toast.message, toast.type), [showToast]);
  const showPermissionToast = useCallback((toast: { message: string; type: "success" | "error" }) => showToast(toast.message, toast.type), [showToast]);
  const reportsState = useWorkReportsController({
    target: currentSpace,
    canEdit,
    onToast: showReportToast,
    enabled: activeTab === "reports",
  });
  const permissionSections = useWorkPermissionsSections({
    target: currentSpace,
    canManage,
    onToast: showPermissionToast,
    enabled: activeTab === "permissions",
  });
  const createTaskSurface = useWorkTaskFormSurface({
    draft: worksState.createDraft,
    works: worksState.works,
    disabled: worksState.saving,
    excludedWorkId: null,
    onChange: worksState.setCreateDraft,
  });
  const planFormSurface = useWorkPlanFormSurface({
    draft: planDraft,
    disabled: worksState.saving,
    onChange: setPlanDraft,
  });

  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true);
    try {
      const nextSpaces = await listTaskSpaces();
      setSpaces(nextSpaces);
      const requested = normalizeInitialTarget(initialTarget);
      const match = requested ? nextSpaces.find((space) => sameTarget(space, requested)) : null;
      const personal = nextSpaces.find((space) => space.targetType === "personal");
      const fallback = match || personal || nextSpaces[0] || null;
      setActiveTarget((current) => current && nextSpaces.some((space) => sameTarget(space, current)) ? current : fallback);
      if (!match && fallback && requested) {
        window.history.replaceState(null, "", workspacePath(getWorkSpacePath(fallback.targetType, fallback.targetId)));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载工作空间失败", "error");
    } finally {
      setSpacesLoading(false);
    }
  }, [initialTarget, showToast]);

  const loadPlans = useCallback(async () => {
    if (spaces.length === 0) {
      setPlans([]);
      setActivePlanId(null);
      return;
    }
    setPlansLoading(true);
    try {
      const nextPlans = (await Promise.all(spaces.map((space) => listWorkPlans(space)))).flat();
      setPlans(nextPlans);
      setActivePlanId((current) => {
        if (current && nextPlans.some((plan) => plan.id === current)) return current;
        const preferredActivePlan = nextPlans.find((plan) => sameTarget(plan, activeTarget) && plan.status !== "archived");
        const preferredAnyPlan = nextPlans.find((plan) => sameTarget(plan, activeTarget));
        return preferredActivePlan?.id ?? preferredAnyPlan?.id ?? null;
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载 OKR 计划失败", "error");
    } finally {
      setPlansLoading(false);
    }
  }, [activeTarget, showToast, spaces]);

  const taskTableSection = useWorkTaskTableSection({
    works: worksState.works,
    loading: worksState.loading,
    canEdit,
    saving: worksState.saving,
    detailId: worksState.detailId,
    editingId: worksState.editingId,
    editDraft: worksState.editDraft,
    statusFilter,
    itemTypeFilter: itemTypeFilter as "all" | WorkItemType,
    onEditDraftChange: worksState.setEditDraft,
    onDetail: (work) => {
      if (worksState.editingId === work.id) return;
      worksState.setDetailId(worksState.detailId === work.id ? null : work.id);
    },
    onEdit: worksState.startEdit,
    onSave: () => void worksState.handleUpdate().then(() => Promise.all([loadSpaces(), loadPlans()])),
    onCancelEdit: worksState.cancelEdit,
    onDelete: (work) => void deleteWork(work),
  });

  useEffect(() => { void loadSpaces(); }, [loadSpaces]);
  useEffect(() => { void loadPlans(); }, [loadPlans]);
  useEffect(() => {
    if (!activePlan || planCreating) return;
    setPlanDraft(createWorkPlanDraft(activePlan));
  }, [activePlan, activePlan?.id, planCreating]);
  useEffect(() => { setExpandedSpaceKeys((current) => applyDefaultExpandedWorkSpaces(current, spaces, activeTarget)); }, [activeTarget, spaces]);
  useEffect(() => {
    if (spaceTypeFilter === "all") return;
    if (activeTarget?.targetType === spaceTypeFilter) return;
    const fallback = filteredSpaces[0] ?? null;
    setActiveTarget(fallback);
    setActivePlanId(null);
    setPlanCreating(false);
    setWorkCreating(false);
    if (fallback) window.history.pushState(null, "", workspacePath(getWorkSpacePath(fallback.targetType, fallback.targetId)));
  }, [activeTarget, filteredSpaces, setWorkCreating, spaceTypeFilter]);

  useEffect(() => {
    if (spaces.length === 0) return;
    function handlePopState() {
      const target = getWorkTargetFromPath(window.location.pathname, spaces);
      if (!target) return;
      setActiveTarget({ targetType: target.targetType, targetId: target.targetId });
      setActivePlanId((current) => {
        const currentPlan = plans.find((plan) => plan.id === current);
        if (currentPlan && sameTarget(currentPlan, target)) return current;
        const firstActivePlan = plans.find((plan) => sameTarget(plan, target) && plan.status !== "archived");
        const firstPlan = plans.find((plan) => sameTarget(plan, target));
        return firstActivePlan?.id ?? firstPlan?.id ?? null;
      });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [plans, spaces]);

  useEffect(() => {
    if (activeTab === "permissions" && !canManage) setActiveTab("tasks");
  }, [activeTab, canManage]);

  useEffect(() => {
    if (!activePlan) return;
    const nextTarget = { targetType: activePlan.targetType, targetId: activePlan.targetId };
    if (sameTarget(activeTarget, nextTarget)) return;
    setActiveTarget(nextTarget);
  }, [activePlan, activeTarget]);

  function selectPlan(plan: WorkPlan) {
    const nextTarget = { targetType: plan.targetType, targetId: plan.targetId };
    setActiveTarget(nextTarget);
    setActivePlanId(plan.id);
    resetTaskView();
    window.history.pushState(null, "", workspacePath(getWorkSpacePath(plan.targetType, plan.targetId)));
  }

  function resetTaskView() {
    setActiveTab("tasks");
    setStatusFilter("active");
    setItemTypeFilter("all");
    setPlanCreating(false);
    worksState.setCreating(false);
    setDrawerOpen(false);
  }

  function selectSpace(space: WorkTaskSpace) {
    const nextTarget = { targetType: space.targetType, targetId: space.targetId };
    setActiveTarget(nextTarget);
    setActivePlanId(null);
    setExpandedSpaceKeys((current) => new Set(current).add(workSpaceKey(space)));
    resetTaskView();
    window.history.pushState(null, "", workspacePath(getWorkSpacePath(space.targetType, space.targetId)));
  }

  function changeSpaceTypeFilter(value: WorkSpaceTypeFilter) {
    setSpaceTypeFilter(value);
    if (value === "all" || activeTarget?.targetType === value) return;
    const fallback = spaces.find((space) => space.targetType === value) ?? null;
    if (fallback) selectSpace(fallback);
    else {
      setActiveTarget(null);
      setActivePlanId(null);
      setPlanCreating(false);
      setWorkCreating(false);
    }
  }

  function toggleSpace(space: WorkTaskSpace) {
    setExpandedSpaceKeys((current) => {
      const next = new Set(current);
      const key = workSpaceKey(space);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleCreatePlan() {
    if (!currentSpace || !planDraft.title.trim()) return;
    try {
      const data = await createWorkPlan(currentSpace, planDraft);
      setPlanCreating(false);
      setPlanDraft(createEmptyWorkPlanDraft());
      await loadPlans();
      setActivePlanId(data.plan.id);
      showToast("OKR 计划已新建", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "新建 OKR 计划失败", "error");
    }
  }

  async function handleUpdatePlan() {
    if (!activePlan || !planDraft.title.trim()) return;
    try {
      const data = await updateWorkPlan(activePlan.id, planDraft);
      await loadPlans();
      setActivePlanId(data.plan.id);
      showToast("OKR 计划已保存", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存 OKR 计划失败", "error");
    }
  }

  async function handleArchivePlan() {
    if (!activePlan) return;
    const ok = await feedback.confirmDelete({
      title: "归档 OKR 计划",
      message: `确定归档「${activePlan.title}」吗？计划内节点会保留但默认不再显示。`,
      confirmLabel: "归档计划",
    });
    if (!ok) return;
    try {
      await archiveWorkPlan(activePlan.id);
      await loadPlans();
      showToast("OKR 计划已归档", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "归档 OKR 计划失败", "error");
    }
  }

  async function handleDeletePlan() {
    if (!activePlan) return;
    const ok = await feedback.confirmDelete({
      title: "删除 OKR 计划",
      message: `确定删除「${activePlan.title}」吗？计划内节点会一并删除，此操作不可恢复。`,
      confirmLabel: "删除计划",
    });
    if (!ok) return;
    try {
      await deleteWorkPlan(activePlan.id);
      await Promise.all([loadSpaces(), loadPlans()]);
      showToast("OKR 计划已删除", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "删除 OKR 计划失败", "error");
    }
  }

  async function deleteWork(work: WorkItem) {
    const ok = await feedback.confirmDelete({
      title: "删除节点",
      message: `确定删除「${work.content}」吗？`,
      confirmLabel: "删除节点",
    });
    if (!ok) return;
    await worksState.handleDelete(work);
    await Promise.all([loadSpaces(), loadPlans()]);
  }

  const editing = worksState.editingId !== null;
  const toolbarItems = createWorkToolbarItems({
    hasSpace: spaces.length > 0,
    sideOpen,
    activeTab,
    canManage,
    canEdit,
    planCreating,
    saving: worksState.saving,
    planDraftTitle: planDraft.title,
    statusFilter,
    itemTypeFilter,
    planPageToolbarItem: planPagination.toolbarItem,
    reportToolbarItems: reportsState.toolbarItems,
    onOpenDrawer: () => setDrawerOpen(true),
    onToggleSide: () => setSideOpen(!sideOpen),
    onStatusFilterChange: setStatusFilter,
    onItemTypeFilterChange: setItemTypeFilter,
    onActiveTabChange: setActiveTab,
    onCreatePlan: () => {
      if (planCreating) {
        setPlanCreating(false);
        setPlanDraft(activePlan ? createWorkPlanDraft(activePlan) : createEmptyWorkPlanDraft());
        return;
      }
      setActivePlanId(null);
      setPlanCreating(true);
      setPlanDraft(createEmptyWorkPlanDraft(nextSortOrder(currentSpacePlans)));
    },
    onSavePlan: () => void (planCreating ? handleCreatePlan() : handleUpdatePlan()),
  });
  const spaceNavigationBody = createWorkSpaceNavigationBody({
    spaces: filteredSpaces,
    active: activeTarget,
    activePlanId,
    plans: filteredPlans,
    loading: spacesLoading || plansLoading,
    expandedSpaceKeys,
    planPageSize: planPagination.planPageSize,
    planPageBySpace: planPagination.planPageBySpace,
    onSelect: selectSpace,
    onSelectPlan: selectPlan,
    onToggleSpace: toggleSpace,
    onPlanPageChange: planPagination.setPlanPage,
  });
  const availableSpaceKindOptions = spaceKindOptions(spaces);
  const activeSpaceKind = spaceTypeFilter === "all"
    ? activeTarget?.targetType ?? availableSpaceKindOptions[0]?.key ?? "personal"
    : spaceTypeFilter;
  const rightBody = createPageBody(currentSpace ? [
    createPanelSection("space-header", {
      title: currentSpace.name,
      sections: [createSpaceMetricsSection(currentSpace)],
    }),
    activeTab === "permissions" ? createSectionsSection("permissions", {
      sections: permissionSections,
    }) : activeTab === "reports" ? createSectionSection("reports", {
      title: "工作汇报",
      sections: createWorkReportsPanelSections(reportsState),
    }) : createWorkPlanContentSection({
      planCreating,
      activePlan,
      canEditPlan: canEdit,
      canDeletePlan: canDelete,
      nodeCreating: worksState.creating,
      createNodeDisabled: worksState.saving || editing,
      nodeSaveDisabled: worksState.saving || !worksState.createDraft.content.trim(),
      planSaveDisabled: worksState.saving || !planDraft.title.trim() || !planDirty,
      planFormSurface,
      createTaskSurface,
      taskTableSection,
      plansLoading,
      hasCurrentSpacePlans: currentSpacePlans.length > 0,
      onCreateNode: () => {
        if (!activePlan) return;
        worksState.setCreating(true);
        worksState.setCreateDraft(createEmptyWorkDraft(nextSortOrder(worksState.works), activePlan.id));
      },
      onArchivePlan: () => void handleArchivePlan(),
      onDeletePlan: () => void handleDeletePlan(),
      onSavePlan: () => void handleUpdatePlan(),
      onSaveNode: () => void worksState.handleCreate().then(() => Promise.all([loadSpaces(), loadPlans()])),
      onCancelNodeCreate: () => worksState.setCreating(false),
    }),
  ] : [createMessageSection("empty-space", { content: spacesLoading ? "加载工作空间中..." : "当前账号暂无可进入的工作计划空间", tone: "muted" })]);

  return (
    <PageSurface kind="standard"
      navigation={availableSpaceKindOptions.length > 0 ? createSpaceKindNavigation({
        items: availableSpaceKindOptions,
        active: activeSpaceKind,
        onChange: (key) => changeSpaceTypeFilter(key as WorkSpaceTypeFilter),
      }) : undefined}
      toolbar={toolbarItems.length > 0 ? { items: toolbarItems } : undefined}
      body={createSpaceWorkbenchBody({
        left: spaceNavigationBody,
        right: rightBody,
        label: "工作空间",
        open: sideOpen,
        drawerOpen,
        onOpenChange: setSideOpen,
        onDrawerOpenChange: setDrawerOpen,
        ratio: [0.3, 0.7],
      })}
    />
  );
}

function spaceKindOptions(spaces: WorkTaskSpace[]): SpaceWorkbenchKindOption[] {
  const byType = new Set(spaces.map((space) => space.targetType));
  return [
    { key: "personal", label: "个人" },
    { key: "company", label: "运营委员会" },
    { key: "department", label: "部门" },
    { key: "project", label: "项目" },
  ].filter((option) => byType.has(option.key as WorkTarget["targetType"]));
}
