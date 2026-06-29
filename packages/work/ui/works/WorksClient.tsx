"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBlockSurfaceSection, createSectionsSection, createMessageSection, createPageBody, createPageTabsNavigation, createPanelSection, createSectionSection, PageSurface, useFeedback } from "@workspace/core/ui";
import type { SurfaceToolbarItems } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import type { SessionUser } from "@workspace/platform/types";
import {
  archiveWorkPlan,
  createWorkPlan,
  listTaskSpaces,
  listWorkPlans,
  updateWorkPlan,
} from "./api";
import {
  createEmptyWorkDraft,
  createEmptyWorkPlanDraft,
  createWorkPlanDraft,
  getWorkSpaceLabel,
  getWorkSpacePath,
  getWorkTargetFromPath,
  WORK_ITEM_TYPE_OPTIONS,
} from "./model";
import { useWorks } from "./useWorks";
import { nextSortOrder, normalizeInitialTarget, roleAllows, sameTarget, spaceMetricsBlock } from "./works-client-helpers";
import { useWorkPermissionsBlocks } from "./WorkPermissionsPanel";
import { buildWorkReportsPanelBlocks, useWorkReportsController } from "./WorkReportsPanel";
import { useWorkTaskTableBlock } from "./WorkTaskTable";
import { useWorkTaskFormSurface } from "./WorkTaskFields";
import { createWorkPlanHeaderSection, createWorkPlanSelectorSection } from "./WorkPlanBlocks";
import { useWorkPlanFormSurface } from "./WorkPlanFields";
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
  const [planEditing, setPlanEditing] = useState(false);
  const [planDraft, setPlanDraft] = useState<WorkPlanDraft>(() => createEmptyWorkPlanDraft());
  const [statusFilter, setStatusFilter] = useState<"active" | "done" | "archived">("active");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) || null,
    [activePlanId, plans],
  );
  const currentSpace = useMemo(() => {
    const target = activePlan ? { targetType: activePlan.targetType, targetId: activePlan.targetId } : activeTarget;
    return spaces.find((space) => sameTarget(space, target)) || null;
  }, [activePlan, activeTarget, spaces]);
  const currentSpacePlans = useMemo(
    () => currentSpace ? plans.filter((plan) => sameTarget(plan, currentSpace)) : [],
    [currentSpace, plans],
  );
  const spacesByKey = useMemo(
    () => new Map(spaces.map((space) => [`${space.targetType}:${space.targetId}`, space])),
    [spaces],
  );
  const canEdit = roleAllows(currentSpace?.role, "editor");
  const canManage = roleAllows(currentSpace?.role, "manager");
  const worksState = useWorks(currentSpace, activePlanId);
  const showToast = useCallback((message: string, type: "success" | "error") => feedback.notify(message, type), [feedback]);
  const showReportToast = useCallback(
    (toast: { message: string; type: "success" | "error" }) => showToast(toast.message, toast.type),
    [showToast],
  );
  const showPermissionToast = useCallback(
    (toast: { message: string; type: "success" | "error" }) => showToast(toast.message, toast.type),
    [showToast],
  );
  const reportsState = useWorkReportsController({
    target: currentSpace,
    canEdit,
    onToast: showReportToast,
    enabled: activeTab === "reports",
  });
  const permissionBlocks = useWorkPermissionsBlocks({
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
        const firstActivePlan = nextPlans.find((plan) => plan.status !== "archived");
        return preferredActivePlan?.id ?? preferredAnyPlan?.id ?? firstActivePlan?.id ?? nextPlans[0]?.id ?? null;
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载 OKR 计划失败", "error");
    } finally {
      setPlansLoading(false);
    }
  }, [activeTarget, showToast, spaces]);

  const taskTableBlock = useWorkTaskTableBlock({
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
    setActiveTab("tasks");
    setStatusFilter("active");
    setItemTypeFilter("all");
    setPlanCreating(false);
    setPlanEditing(false);
    worksState.setCreating(false);
    setDrawerOpen(false);
    window.history.pushState(null, "", workspacePath(getWorkSpacePath(plan.targetType, plan.targetId)));
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
      setPlanEditing(false);
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

  const tabs = canManage
    ? [{ key: "tasks", label: "OKR 计划" }, { key: "reports", label: "工作汇报" }, { key: "permissions", label: "权限设置" }]
    : [{ key: "tasks", label: "OKR 计划" }, { key: "reports", label: "工作汇报" }];
  const editing = worksState.editingId !== null;
  const toolbarItems: SurfaceToolbarItems = currentSpace ? [
    {
      kind: "panel-toggle",
      key: "mobile-side-toggle",
      icon: "panel-open",
      label: "显示工作计划",
      visibility: "mobile",
      onClick: () => setDrawerOpen(true),
    },
    {
      kind: "panel-toggle",
      key: "desktop-side-toggle",
      icon: sideOpen ? "panel-open" : "panel-close",
      label: `${sideOpen ? "隐藏" : "显示"}工作计划`,
      variant: sideOpen ? "primary" : "secondary",
      visibility: "desktop",
      onClick: () => setSideOpen(!sideOpen),
    },
    ...(activeTab === "tasks"
      ? [
          {
            kind: "option-group" as const,
            key: "status",
            section: "filter" as const,
            value: statusFilter,
            options: [
              { value: "active", label: "进行中" },
              { value: "done", label: "已完成" },
              { value: "archived", label: "已归档" },
            ],
            onChange: (value: string) => setStatusFilter(value as typeof statusFilter),
            ariaLabel: "子任务状态",
          },
          {
            kind: "option-group" as const,
            key: "type",
            section: "filter" as const,
            value: itemTypeFilter,
            options: [
              { value: "all", label: "全部节点" },
              ...WORK_ITEM_TYPE_OPTIONS,
            ],
            onChange: setItemTypeFilter,
            ariaLabel: "节点类型",
          },
        ]
      : []),
    ...(activeTab === "reports" ? reportsState.toolbarItems : []),
    ...(activeTab === "tasks" && canEdit
      ? [
          {
            kind: "create" as const,
            key: "create-plan",
            label: "新增 OKR 计划",
            active: planCreating,
            disabled: worksState.saving || planEditing,
            onClick: () => {
              setPlanCreating(true);
              setPlanEditing(false);
              setPlanDraft(createEmptyWorkPlanDraft(nextSortOrder(currentSpacePlans)));
            },
          },
          ...(activePlan ? [{
            kind: "action-group" as const,
            key: "plan-actions",
            section: "edit" as const,
            actions: [
              {
                key: "edit-plan",
                kind: "edit" as const,
                label: "编辑计划",
                disabled: planCreating,
                onClick: () => {
                  setPlanEditing(true);
                  setPlanCreating(false);
                  setPlanDraft(createWorkPlanDraft(activePlan));
                },
              },
              {
                key: "archive-plan",
                kind: "archive" as const,
                label: "归档计划",
                disabled: planCreating || planEditing,
                onClick: () => void handleArchivePlan(),
              },
            ],
          }] : []),
          ...(planCreating || planEditing
            ? [{
                kind: "action-group" as const,
                key: "plan-save-actions",
                section: "edit" as const,
                actions: [
                  {
                    key: "cancel-plan",
                    kind: "cancel" as const,
                    label: "取消计划编辑",
                    onClick: () => {
                      setPlanCreating(false);
                      setPlanEditing(false);
                    },
                  },
                  {
                    key: "save-plan",
                    kind: "check" as const,
                    label: planCreating ? "保存 OKR 计划" : "保存计划修改",
                    variant: "primary" as const,
                    disabled: !planDraft.title.trim(),
                    onClick: () => void (planCreating ? handleCreatePlan() : handleUpdatePlan()),
                  },
                ],
              }]
            : []),
          ...(activePlan && !planCreating && !planEditing
            ? [
                {
                  kind: "create" as const,
                  key: "create-node",
                  label: "新增节点",
                  active: worksState.creating,
                  disabled: worksState.saving || editing,
                  onClick: () => {
                    worksState.setCreating(true);
                    worksState.setCreateDraft(createEmptyWorkDraft(nextSortOrder(worksState.works), activePlan.id));
                  },
                },
                ...(worksState.creating
                  ? [{
                      kind: "action-group" as const,
                      key: "create-actions",
                      section: "edit" as const,
                      actions: [
                        {
                          key: "cancel",
                          kind: "cancel" as const,
                          label: "取消新增",
                          onClick: () => worksState.setCreating(false),
                        },
                        {
                          key: "save",
                          kind: "check" as const,
                          label: "保存节点",
                          variant: "primary" as const,
                          disabled: worksState.saving || !worksState.createDraft.content.trim(),
                          onClick: () => void worksState.handleCreate().then(() => Promise.all([loadSpaces(), loadPlans()])),
                        },
                      ],
                    }]
                  : []),
              ]
            : []),
        ]
      : []),
  ] : [];
  const planSelectorBlock = createWorkPlanSelectorSection({
    plans,
    activePlanId,
    plansLoading: spacesLoading || plansLoading,
    spacesByKey,
    onSelect: selectPlan,
  });

  return (
    <PageSurface kind="standard"
      navigation={currentSpace ? createPageTabsNavigation({
        items: tabs,
        active: activeTab,
        onChange: setActiveTab,
      }) : undefined}
      toolbar={toolbarItems.length > 0 ? { items: toolbarItems } : undefined}
      body={{
        kind: "split",
        left: {
          sections: createPageBody([planSelectorBlock]).sections,
          drawerSections: createPageBody([planSelectorBlock]).sections,
        },
        right: createPageBody(currentSpace ? [
          createPanelSection("space-header", {
            title: currentSpace.name,
            subtitle: [getWorkSpaceLabel(currentSpace.targetType), currentSpace.subtitle].filter(Boolean).join(" · "),
            sections: [spaceMetricsBlock(currentSpace)],
          }),
          activeTab === "permissions" ? createSectionsSection("permissions", {
            sections: permissionBlocks,
          }) : activeTab === "reports" ? createSectionSection("reports", {
            title: "工作汇报",
            sections: buildWorkReportsPanelBlocks(reportsState),
          }) : createSectionSection("tasks", {
            title: "OKR 计划",
            sections: [
              ...(planCreating || planEditing ? [{
                kind: "form" as const,
                key: "plan-form",
                surface: planFormSurface,
              }] : []),
              ...(planCreating ? [] : activePlan ? [
                createWorkPlanHeaderSection(activePlan),
                ...(worksState.creating ? [{
                  kind: "form" as const,
                  key: "create-task",
                  surface: createTaskSurface,
                }] : []),
                taskTableBlock,
              ] : [createMessageSection("no-plan", {
                content: plansLoading ? "加载 OKR 计划中..." : "请先新建 OKR 计划，再添加目标、关键结果和子任务。",
                tone: "muted" as const,
              })]),
            ],
          }),
        ] : [createBlockSurfaceSection("empty-space", { kind: "message", content: spacesLoading ? "加载工作空间中..." : "当前账号暂无可进入的工作计划空间", tone: "muted" })]),
        sideOpen,
        drawerOpen,
        onSideOpenChange: setSideOpen,
        onDrawerOpenChange: setDrawerOpen,
        sideLabel: "工作计划",
        splitRatio: [2, 8],
        showSideControls: false,
      }}
    />
  );
}
