"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createMessageSection, createPageBody, PageSurface, useFeedback, type BodySurfaceSectionCreateSpec } from "@workspace/core/ui";
import { actionRuntimeCommands, actionRuntimeCreateSubmission, createStandardBusinessSpaceNavigationSelector, workflowActionSurfaceActions } from "@workspace/platform/ui";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import type { SessionUser } from "@workspace/platform/types";
import { WORK_OKR_CONTROL_CAPABILITY_KEY } from "@workspace/platform/work-reporting-policy";
import { isWorkDraftDirty } from "./model";
import { getWorkSpaceHomePath } from "./space-paths";
import { useWorkTaskWorkspace } from "./useWorkTaskWorkspace";
import { canMaintainWorkByType, createDefaultNodeDraft, createSpaceMetricsSection, sameTarget } from "./works-client-helpers";
import { useWorkReportsController } from "./WorkReportsPanel";
import { useWorkOkrSettingsController, workOkrSettingsBody } from "./WorkOkrSettingsPanel";
import { useWorkKpiDefinitionController, useWorkKpiScorecardController } from "./WorkKpiPanel";
import { useWorkTaskFormSurface } from "./WorkTaskFields";
import { useWorkOkrPlanSurface } from "./WorkOkrPlanSurface";
import { workViewNavigationItemsForSpace, WORK_KPI_NAVIGATION_KEY, WORK_OKR_SETTINGS_VIEW_NAVIGATION_ITEM, WORK_REPORTING_NAVIGATION_KEY, WORK_TASK_VIEW_NAVIGATION_ITEMS, WORK_TASKS_COLLABORATION_VIEW_KEY, WORK_TASKS_OWNED_VIEW_KEY, type WorkTasksChildView } from "./WorkSpaceTopNavigation";
import { createWorkToolbarItems } from "./WorkToolbar";
import { planMatchesFutureFilter } from "./work-plan-future-filter";
import { ownedPeriodTypeForFilter, planMatchesPeriodFilter } from "./work-plan-period-filter";
import { matchesWorkStatusFilter, type WorkStatusFilter } from "./work-status-filter";
import { useWorkPlanGanttView } from "./useWorkPlanGanttView";
import { useInitialGoalPreview } from "./InitialGoalPreview";
import type { WorkReportStage } from "./WorkReportPayload";
import type { WorkPlan, WorkTarget, WorkTaskSpace } from "./types";
import { useOkrStageControls } from "./useOkrStageControls";
import { useAssignedWorkNavigation } from "./useAssignedWorkNavigation";
import { useDepartmentCollaborationController } from "./DepartmentCollaborationPanel";
import { useWorkSpaceSession } from "./useWorkSpaceSession";
import { useWorkPlanWorkspace } from "./WorkPlanCommands";
import { useWorkPeriodScheduleWorkspace } from "./useWorkPeriodScheduleWorkspace";
import { createSurfaceForm, createWorkCreateChoiceController, createWorksNavigationBodies, createWorksPageView, createWorksPlanViewModel, responsiveWorkNavigationItems } from "./works-page-composition";
// 临时隐藏目标考核内容：期初目标和考核结果表格待重新梳理。
const WORK_GOAL_REPORTS_CONTENT_EMPTY = true;
export default function WorksClient({ user, initialTarget, shellTitle }: {
  user: SessionUser;
  initialTarget?: WorkTarget;
  shellTitle?: string;
}) {
  const { notify, confirmDelete } = useFeedback();
  const showToast = useCallback((message: string, type: "success" | "error") => notify(message, type), [notify]);
  const showSpaceError = useCallback((message: string) => showToast(message, "error"), [showToast]);
  const spaceSession = useWorkSpaceSession({ initialTarget, onError: showSpaceError });
  const { spaces, filteredSpaces, planLoadSpaces, preferredDepartmentIds: navigationPreferredDepartmentIds, preferredProjectIds: navigationPreferredProjectIds } = spaceSession.data;
  const { activeTarget, currentSpace, expandedSpaceKeys } = spaceSession.selection;
  const { openTarget, synchronizeTarget, toggleSpace, refreshSummary } = spaceSession.commands;
  const spacesLoading = spaceSession.status.loading;
  const [activeTab, setActiveTab] = useState("tasks");
  const [workTasksChildView, setWorkTasksChildView] = useState<WorkTasksChildView>(WORK_TASKS_OWNED_VIEW_KEY);
  const [goalReportStage, setGoalReportStage] = useState<WorkReportStage>("kr");
  const [compactNavigation, setCompactNavigation] = useState(false);
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false);
  const [pendingRoutineTaskCreatePlanId, setPendingRoutineTaskCreatePlanId] = useState<number | null>(null);
  const planWorkspace = useWorkPlanWorkspace({
    activeTarget,
    currentSpace,
    filteredSpaces,
    planLoadSpaces,
    activeTab,
    onSummaryChange: refreshSummary,
    onToast: showToast,
    confirmDelete,
  });
  const { plans, navigationPlans, kpiPlans, currentSpacePlans, pagination: planPagination } = planWorkspace.catalog;
  const { activePlan, activePlanId, activeRoutineTaskId } = planWorkspace.selection;
  const { draft: planDraft, creating: planCreating } = planWorkspace.editor;
  const { periodFilter: planPeriodFilter, futureFilter: planFutureFilter, statusFilter } = planWorkspace.filters;
  const plansLoading = planWorkspace.status.loading;
  const planCommands = planWorkspace.commands;
  const canManageOkrSettings = Boolean(
    user.visibleConfigureResourceKeys?.includes(WORK_OKR_CONTROL_CAPABILITY_KEY),
  );
  const scopedWorkTasksChildView = currentSpace?.targetType === "personal"
    ? workTasksChildView
    : currentSpace?.targetType === "department" && workTasksChildView === WORK_TASKS_COLLABORATION_VIEW_KEY
      ? WORK_TASKS_COLLABORATION_VIEW_KEY
      : WORK_TASKS_OWNED_VIEW_KEY;
  const isDepartmentCollaborationView = activeTab === "tasks"
    && currentSpace?.targetType === "department"
    && scopedWorkTasksChildView === WORK_TASKS_COLLABORATION_VIEW_KEY;
  const currentActionPermissions = currentSpace?.actionPermissions;
  const canEdit = Boolean(currentActionPermissions?.canUpdate);
  const canArchive = Boolean(currentActionPermissions?.canArchive);
  const canDelete = Boolean(currentActionPermissions?.canDelete);
  const itemCreateRuntime = currentSpace?.actionRuntimes.itemCreate;
  const itemUpdateRuntime = currentSpace?.actionRuntimes.itemUpdate;
  const planCreateRuntime = currentSpace?.actionRuntimes.planCreate;
  const selectedTargetActionKind = activePlan?.governance?.facets.target.action?.kind;
  const selectedTargetRuntime = selectedTargetActionKind === "objective_revise"
    ? activePlan?.actionRuntimes?.objectiveRevise ?? currentSpace?.actionRuntimes.objectiveRevise
    : activePlan?.actionRuntimes?.objectiveSubmit ?? currentSpace?.actionRuntimes.objectiveSubmit;
  const usesObjectiveRevision = activePlan?.governance
    ? selectedTargetActionKind === "objective_revise"
    : Boolean(activePlan?.objectiveApprovedAt || activePlan?.status === "done");
  const planSaveRuntime = usesObjectiveRevision
    ? activePlan?.actionRuntimes?.planRevision ?? currentSpace?.actionRuntimes.planRevision
    : currentSpace?.actionRuntimes.planSave;
  const canCreateItem = Boolean(itemCreateRuntime?.actions.some((action) => action === "record.save" || action === "workflow.request.submit"));
  const canUpdateItem = Boolean(itemUpdateRuntime?.actions.some((action) => action === "record.save" || action === "workflow.request.submit"));
  const canUpdatePlan = Boolean(planSaveRuntime?.actions.some((action) => action === "record.save" || action === "workflow.request.submit"));
  const canSubmitObjective = selectedTargetRuntime?.actions.includes("workflow.request.submit") === true;
  const handleWorkChanged = useCallback(async () => {
    await Promise.all([refreshSummary("work-item.changed"), planCommands.reconcile("work-item.changed")]);
  }, [planCommands, refreshSummary]);
  const taskWorkspace = useWorkTaskWorkspace({ target: currentSpace, planId: activePlanId, onChanged: handleWorkChanged });
  const worksState = useMemo(
    () => ({ ...taskWorkspace.data, ...taskWorkspace.selection, ...taskWorkspace.editor, ...taskWorkspace.status, ...taskWorkspace.commands }),
    [taskWorkspace.commands, taskWorkspace.data, taskWorkspace.editor, taskWorkspace.selection, taskWorkspace.status],
  );
  const activeRoutineTask = useMemo(() => activeRoutineTaskId
    ? worksState.works.find((work) => work.id === activeRoutineTaskId && work.routineTaskType === "task") ?? null
    : null, [activeRoutineTaskId, worksState.works]);
  const visibleWorks = useMemo(() => activePlan?.kind === "routine"
    ? activeRoutineTask ? [activeRoutineTask] : worksState.works.filter((work) => work.routineTaskType === "standing")
    : worksState.works, [activePlan?.kind, activeRoutineTask, worksState.works]);
  const navigationRoutineWorks = useMemo(
    () => worksState.works.filter((work) => matchesWorkStatusFilter(work, statusFilter)),
    [statusFilter, worksState.works],
  );
  useEffect(() => {
    if (activePlan?.kind !== "routine" || worksState.loading || !activeRoutineTaskId) return;
    if (!activeRoutineTask) planCommands.setActiveRoutineTaskId(null);
  }, [activePlan?.kind, activeRoutineTask, activeRoutineTaskId, planCommands, worksState.loading]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setCompactNavigation(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const setWorkCreating = worksState.setCreating;
  const stageControls = useOkrStageControls({
    activePlan,
    works: worksState.works,
    canCreate: canCreateItem,
    canEditPlan: canUpdatePlan,
    canEditWork: canUpdateItem,
    canSubmitObjective,
  });
  const {
    rootObjectives,
    createAllowedItemTypes,
    defaultCreateItemType,
    canEditObjectives,
    canEditTasks,
    canEditKrs,
    canCreateNode,
    createNodeLabel,
    nodeSaveLabel,
  } = stageControls;
  const createDraftNeedsParent = activePlan?.kind !== "routine" && worksState.createDraft.itemType !== "objective";
  const createNodeMissingParent = createDraftNeedsParent && !worksState.createDraft.parentWorkItemId;
  const showReportToast = useCallback((toast: { message: string; type: "success" | "error" }) => showToast(toast.message, toast.type), [showToast]);
  const workReportingState = useWorkReportsController({
    target: currentSpace,
    onToast: showReportToast,
    enabled: Boolean(currentSpace) && activeTab === WORK_REPORTING_NAVIGATION_KEY,
  });
  const initialGoalPreview = useInitialGoalPreview({
    active: activeTab === "reports" && goalReportStage === "kr",
    target: currentSpace,
    plans: currentSpacePlans,
    plansLoading,
    onToast: showToast,
  });
  const settingsState = useWorkOkrSettingsController({
    enabled: activeTab === "settings" && canManageOkrSettings,
    onToast: showReportToast,
  });
  const navigationItems = useMemo(
    () => {
      const baseItems = canManageOkrSettings ? [...WORK_TASK_VIEW_NAVIGATION_ITEMS, WORK_OKR_SETTINGS_VIEW_NAVIGATION_ITEM] : WORK_TASK_VIEW_NAVIGATION_ITEMS;
      const reportingSettings = settingsState.reportingSettings ?? workReportingState.reportingSettings;
      const scopedItems = workViewNavigationItemsForSpace(baseItems, currentSpace?.targetType, reportingSettings);
      return responsiveWorkNavigationItems(scopedItems);
    },
    [canManageOkrSettings, currentSpace?.targetType, settingsState.reportingSettings, workReportingState.reportingSettings],
  );
  const collaborationState = useDepartmentCollaborationController({
    enabled: isDepartmentCollaborationView,
    space: currentSpace,
    actionRuntime: currentSpace?.actionRuntimes.collaboration,
    canRespond: canEdit,
    onToast: showToast,
  });
  const ganttView = useWorkPlanGanttView({ active: activeTab === "gantt", currentSpace, plans: currentSpacePlans, plansLoading, onToast: showToast });
  const createTaskSurface = useWorkTaskFormSurface({
    draft: worksState.createDraft,
    works: worksState.works,
    disabled: worksState.saving,
    resultDisabled: worksState.saving || activePlan?.governance?.facets.result.editable === false,
    excludedWorkId: null,
    allowedItemTypes: createAllowedItemTypes,
    target: currentSpace,
    enabled: worksState.creating,
    onChange: worksState.setCreateDraft,
  });
  const assignedNavigation = useAssignedWorkNavigation({
    enabled: currentSpace?.targetType === "personal" && activeTab === "tasks" && scopedWorkTasksChildView !== WORK_TASKS_OWNED_VIEW_KEY,
    onToast: showToast,
    activeView: scopedWorkTasksChildView,
  });
  useEffect(() => {
    if (currentSpace?.targetType === "personal") return;
    if (workTasksChildView === WORK_TASKS_OWNED_VIEW_KEY) return;
    if (currentSpace?.targetType === "department" && workTasksChildView === WORK_TASKS_COLLABORATION_VIEW_KEY) return;
    setWorkTasksChildView(WORK_TASKS_OWNED_VIEW_KEY);
  }, [currentSpace?.targetType, workTasksChildView]);
  useEffect(() => {
    if (activeTab !== "department-collaboration") return;
    setActiveTab("tasks");
    setWorkTasksChildView(WORK_TASKS_COLLABORATION_VIEW_KEY);
  }, [activeTab]);
  const kpiScorecardState = useWorkKpiScorecardController({
    enabled: activeTab === WORK_KPI_NAVIGATION_KEY,
    space: currentSpace,
    plan: activePlan,
    onToast: showReportToast,
    onRefreshPlans: () => planCommands.reconcile("plan.changed"),
  });
  const kpiDefinitionState = useWorkKpiDefinitionController({
    enabled: activeTab === WORK_KPI_NAVIGATION_KEY,
    space: currentSpace,
    onToast: showReportToast,
    onDefinitionsChanged: kpiScorecardState.reload,
  });
  const nodeSaveDisabled = worksState.saving || !worksState.createDraft.content.trim() || createNodeMissingParent;
  const activeNodeSaveLabel = activePlan?.kind === "routine"
    ? worksState.createDraft.routineTaskType === "standing" ? "保存常设职责" : "保存任务"
    : nodeSaveLabel;
  const runCreateNodeMutation = (options?: { feedback?: boolean; rethrow?: boolean }) => worksState.create(options);
  const runUpdateNodeMutation = () => void worksState.save();
  const editNodeDisabled = worksState.saving
    || !worksState.editDraft?.content.trim()
    || !worksState.activeWork
    || !isWorkDraftDirty(worksState.activeWork, worksState.editDraft);
  const editNodeActions = workflowActionSurfaceActions(actionRuntimeCommands(itemUpdateRuntime, {
    "record.save": { label: "保存节点", disabled: editNodeDisabled, onClick: runUpdateNodeMutation },
    "workflow.request.submit": { disabled: editNodeDisabled, onClick: runUpdateNodeMutation },
    "form.cancel": { label: "取消编辑", onClick: worksState.cancelEdit },
  }));
  const contextualNodeCreating = Boolean(
    worksState.creating
    && !(activePlan?.kind === "routine" && worksState.createDraft.routineTaskType === "task"),
  );
  const nodeCreateSubmission = actionRuntimeCreateSubmission(itemCreateRuntime, {
    disabled: nodeSaveDisabled,
    execute: () => runCreateNodeMutation({ feedback: false, rethrow: true }),
  });
  const nodeCreateSurface: BodySurfaceSectionCreateSpec | undefined = nodeCreateSubmission ? {
    id: "work-node-create",
    trigger: "surface",
    presentation: "block",
    title: activePlan?.kind === "routine" ? "新增常设职责" : createNodeLabel,
    open: contextualNodeCreating,
    canCreate: canCreateNode,
    disabled: worksState.saving
      || worksState.editingId !== null
      || (activePlan?.kind !== "routine" && defaultCreateItemType !== "objective" && rootObjectives.length === 0),
    content: { kind: "form", form: createSurfaceForm(createTaskSurface, { columns: 2 }) },
    submission: nodeCreateSubmission,
    feedback: {
      saved: activeNodeSaveLabel.replace(/^保存/, "") + "已新建",
      submitted: activePlan?.kind === "routine" ? "常设职责已提交审核" : "节点已提交审核",
    },
    onOpenChange: (open) => {
      if (!open) {
        worksState.setCreating(false);
        return;
      }
      if (!activePlan) return;
      worksState.cancelEdit();
      worksState.startCreate(createDefaultNodeDraft(
        activePlan,
        activePlan.kind === "routine" ? "task" : defaultCreateItemType,
        rootObjectives,
        worksState.works,
        activePlan.kind === "routine" ? "standing" : "task",
      ));
    },
  } : undefined;
  const openPeriodSchedulePlan = useCallback((planId: number, resolvedPlan: WorkPlan | null) => {
    const plan = plans.find((item) => item.id === planId) ?? resolvedPlan;
    if (!plan) {
      planCommands.openPlanId(planId);
      return;
    }
    planCommands.changePeriodFilter(plan.periodType === "half_year" ? "yearly" : ownedPeriodTypeForFilter(plan.periodType) ?? "routine");
    planCommands.registerAndOpenPlan(plan);
    openTarget(plan);
    setActiveTab("tasks");
    setWorkTasksChildView(WORK_TASKS_OWNED_VIEW_KEY);
    planCommands.changeStatusFilter("active");
    planCommands.cancelCreate();
    setWorkCreating(false);
  }, [openTarget, planCommands, plans, setWorkCreating]);
  const periodScheduleWorkspace = useWorkPeriodScheduleWorkspace({
    plan: activePlan,
    target: currentSpace,
    works: worksState.works,
    canCreate: canCreateNode && !planCreating,
    compact: compactNavigation,
    createRuntime: itemCreateRuntime ?? null,
    onOpenPlan: openPeriodSchedulePlan,
    onToast: showToast,
  });
  const periodScheduleSections = periodScheduleWorkspace.viewModel.sections;
  const okrPlanSurface = useWorkOkrPlanSurface({
    planDraft,
    works: visibleWorks,
    target: currentSpace,
    persistenceMode: (planCreating ? planCreateRuntime : planSaveRuntime)?.persistenceMode ?? "active",
    editability: (planCreating ? planCreateRuntime : planSaveRuntime)?.editability ?? "readonly",
    formDisabled: worksState.saving,
    autoFocusPlanTitle: planCreating,
    onPlanDraftChange: planCommands.updateDraft,
    extraSections: activePlan?.kind === "okr" ? periodScheduleSections : [],
    table: {
      loading: worksState.loading,
      saving: worksState.saving,
      detailId: worksState.detailId,
      editingId: worksState.editingId,
      editDraft: worksState.editDraft,
      formWorks: worksState.works,
      statusFilter,
      itemTypeFilter: "all",
      groupByObjective: activePlan?.kind !== "routine",
      target: currentSpace,
      showOwnerColumn: currentSpace?.targetType !== "personal",
      sectionTitle: activePlan?.kind === "routine" ? activeRoutineTask ? "任务" : "常设职责" : "目标分解",
      sectionCreate: canCreateNode && (activePlan?.kind !== "routine" || activeRoutineTaskId === null) ? nodeCreateSurface : undefined,
      tableLabel: activePlan?.kind === "routine" ? activeRoutineTask ? "任务" : "常设职责" : "目标 / 执行任务 / 考核结果",
      canEdit: canEditObjectives || canEditTasks || canEditKrs,
      canDelete,
      canArchive,
      emptyText: activePlan?.kind === "routine" ? activeRoutineTaskId ? "该任务不存在或已删除。" : "暂无常设职责。" : "暂无目标。周期初先添加根级目标。",
      canEditWork: (work) => !work.isArchived && canUpdateItem && canMaintainWorkByType(work, activePlan),
      canDeleteWork: (work) => !work.isArchived && canMaintainWorkByType(work, activePlan),
      canArchiveWork: (work) => work.itemType === "task",
      onEditDraftChange: worksState.setEditDraft,
      editFormActions: editNodeActions,
      resultDisabled: activePlan?.governance?.facets.result.editable === false,
      onDetail: (work) => {
        if (worksState.editingId === work.id) return;
        worksState.setDetailId(worksState.detailId === work.id ? null : work.id);
      },
      onEdit: worksState.startEdit,
      onSave: runUpdateNodeMutation,
      onCancelEdit: worksState.cancelEdit,
      onArchive: worksState.archive,
      onRestore: worksState.restore,
      onDelete: worksState.remove,
    },
  });
  useEffect(() => {
    if (pendingRoutineTaskCreatePlanId === null || activePlan?.id !== pendingRoutineTaskCreatePlanId || activePlan.kind !== "routine") return;
    worksState.cancelEdit();
    worksState.startCreate({ ...createDefaultNodeDraft(activePlan, "task", [], [], "task"), sortOrder: 0 });
    setPendingRoutineTaskCreatePlanId(null);
  }, [activePlan, pendingRoutineTaskCreatePlanId, worksState]);
  useEffect(() => {
    if (activeTab === "settings" && !canManageOkrSettings) setActiveTab("tasks");
  }, [activeTab, canManageOkrSettings]);
  useEffect(() => {
    if (!activePlan) return;
    const nextTarget = { targetType: activePlan.targetType, targetId: activePlan.targetId };
    if (sameTarget(activeTarget, nextTarget)) return;
    synchronizeTarget(nextTarget);
  }, [activePlan, activeTarget, synchronizeTarget]);
  function selectPlan(plan: WorkPlan, routineTaskId?: number | null) {
    openTarget(plan);
    planCommands.openPlan(plan, routineTaskId);
    worksState.cancelEdit();
    resetTaskView();
    if (plan.kind === "routine" && routineTaskId) {
      const task = worksState.works.find((work) => work.id === routineTaskId);
      planCommands.changeStatusFilter(task?.isArchived ? "archived" : task?.status === "done" ? "done" : "active");
    }
  }
  function selectKpiPlan(plan: WorkPlan) { selectPlan(plan); setActiveTab(WORK_KPI_NAVIGATION_KEY); }
  function selectKpiSpace(space: WorkTaskSpace) { selectSpace(space); setActiveTab(WORK_KPI_NAVIGATION_KEY); }
  function resetTaskView(nextStatus?: WorkStatusFilter) { setActiveTab("tasks"); setWorkTasksChildView(WORK_TASKS_OWNED_VIEW_KEY); if (nextStatus) planCommands.changeStatusFilter(nextStatus); setCreateChoiceOpen(false); setPendingRoutineTaskCreatePlanId(null); planCommands.cancelCreate(); worksState.setCreating(false); }
  function selectSpace(space: WorkTaskSpace) { changeActiveSpace(space, true); }
  function selectNavigationSpace(space: WorkTaskSpace) { changeActiveSpace(space, false); }
  function changeActiveSpace(space: WorkTaskSpace, resetView: boolean) {
    openTarget(space);
    planCommands.clearSelection();
    if (resetView) resetTaskView("active");
    else {
      setCreateChoiceOpen(false);
      setPendingRoutineTaskCreatePlanId(null);
      planCommands.cancelCreate();
      setWorkCreating(false);
    }
  }
  const spaceSelector = createStandardBusinessSpaceNavigationSelector({
    spaces,
    preferredDepartmentIds: navigationPreferredDepartmentIds,
    preferredProjectIds: navigationPreferredProjectIds,
    active: activeTarget,
    label: "工作空间",
    order: ["personal", "departments", "projects"],
    onChange: selectNavigationSpace,
  });
  const workToolbarItems = createWorkToolbarItems({
    hasSpace: spaces.length > 0,
    activeTab,
    planPeriodFilter,
    planFutureFilter,
    statusFilter,
    planPageToolbarItem: planPagination.toolbarItem,
    reportToolbarItems: WORK_GOAL_REPORTS_CONTENT_EMPTY ? [] : workReportingState.toolbarItems,
    settingsToolbarItems: settingsState.toolbarItems,
    onPlanPeriodFilterChange: (filter) => {
      planCommands.changePeriodFilter(filter);
      if (!planCreating && !worksState.creating && activePlan && !planMatchesPeriodFilter(activePlan, filter)) planCommands.clearSelection();
    },
    onPlanFutureFilterChange: (filter) => {
      planCommands.changeFutureFilter(filter);
      if (!planCreating && !worksState.creating && activePlan && !planMatchesFutureFilter(activePlan, filter)) planCommands.clearSelection();
    },
    onStatusFilterChange: planCommands.changeStatusFilter,
  });
  const toolbarItems = activeTab === "gantt"
    ? ganttView.toolbarItems
    : activeTab === WORK_KPI_NAVIGATION_KEY
      ? kpiScorecardState.toolbarItems
    : isDepartmentCollaborationView
      ? collaborationState.toolbarItems
    : activeTab === "tasks" && scopedWorkTasksChildView !== WORK_TASKS_OWNED_VIEW_KEY
      ? workToolbarItems.filter((item) => item.kind === "panel-toggle")
      : workToolbarItems;
  const createChoiceSurface = createWorkCreateChoiceController({
    plans: currentSpacePlans, planWorkspace, taskWorkspace, setOpen: setCreateChoiceOpen,
    setPendingRoutinePlanId: setPendingRoutineTaskCreatePlanId,
    onUnavailable: () => showToast("日常工作入口尚未加载，请稍后重试", "error"),
  });
  const navigationBodies = createWorksNavigationBodies({
    spaces: filteredSpaces,
    active: activeTarget,
    activePlanId,
    activeRoutineTaskId,
    statusFilter,
    routineWorks: navigationRoutineWorks,
    navigationPlans,
    kpiPlans,
    loading: spacesLoading || plansLoading,
    expandedSpaceKeys,
    planPageSize: planPagination.planPageSize,
    planPageBySpace: planPagination.planPageBySpace,
    onSelect: selectSpace,
    onSelectPlan: selectPlan,
    onSelectKpiSpace: selectKpiSpace,
    onSelectKpiPlan: selectKpiPlan,
    onToggleSpace: toggleSpace,
    onPlanPageChange: planPagination.setPlanPage,
  });
  const settingsBody = workOkrSettingsBody(settingsState.sections);
  const kpiBody = createPageBody([
    ...kpiDefinitionState.body.sections,
    ...kpiScorecardState.body.sections,
  ]);
  const planView = createWorksPlanViewModel({
    planWorkspace, taskWorkspace, stageControls, createChoiceSurface, createTaskSurface,
    okrPlanSurface, nodeCreateSubmission, planCreateRuntime, planSaveRuntime,
    createChoiceOpen, setCreateChoiceOpen, pendingRoutineTaskCreatePlanId,
    setPendingRoutineTaskCreatePlanId, canDelete, canArchive, plansLoading,
    currentSpacePlanCount: currentSpacePlans.length,
  });
  const ganttBody = createPageBody(currentSpace ? [ganttView.section] : [createMessageSection("empty-space", { content: spacesLoading ? "加载工作空间中..." : "当前账号暂无可进入的工作计划空间", tone: "muted" })]);
  const pageView = createWorksPageView({
    activeTab, setActiveTab, goalReportStage, setGoalReportStage, compactNavigation,
    navigationItems, currentSpace, activePlan, spacesLoading, scopedWorkTasksChildView,
    setWorkTasksChildView, settingsBody, kpiBody,
    kpiNavigationBody: navigationBodies.kpiNavigationBody,
    spaceNavigationBody: navigationBodies.spaceNavigationBody,
    spaceMetricsSection: currentSpace ? createSpaceMetricsSection(currentSpace) : null,
    workPlanSection: planView.workPlanSection, ganttBody, initialGoalPreview, workReportingState, assignedNavigation,
    collaborationState,
  });
  return renderAppShellPage({
    title: shellTitle ?? "工作空间",
    backHref: activeTarget ? getWorkSpaceHomePath(activeTarget.targetType, activeTarget.targetId) : "/work",
    user,
    headerSelector: spaceSelector,
    children: <PageSurface kind="standard"
      create={activeTab === "tasks" && !assignedNavigation.assignedBodySection ? planView.globalCreate : undefined}
      tabbar={pageView.pageNavigation}
      toolbar={toolbarItems.length > 0 ? { items: toolbarItems } : undefined}
      body={pageView.body}
    />,
  });
}
