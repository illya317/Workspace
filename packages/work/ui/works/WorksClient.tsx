/* eslint-disable max-lines */
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFieldsSection, createMessageSection, createPageBody, createPageTabBar, PageSurface, useFeedback, type BodySurfaceSectionCreateSpec, type CreateSurfaceFormSpec, type FormSurfaceProps, type PageSurfaceCreateSpec } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { actionRuntimeCommands, actionRuntimeCreateSubmission, createStandardBusinessSpaceNavigationSelector, createSpaceWorkbenchBody, workflowActionSurfaceActions } from "@workspace/platform/ui";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import type { SessionUser } from "@workspace/platform/types";
import { WORK_OKR_CONTROL_CAPABILITY_KEY } from "@workspace/platform/work-reporting-policy";
import { fetchWorkPeriodCollection, listTaskSpaces, listWorkTaskSubmissions, postWorkPeriodScheduleItem, type WorkPeriodScheduleCreateResult } from "./api";
import { createEmptyWorkPlanDraft, createWorkPlanDraft, isPlanDraftComplete, isWorkDraftDirty, isWorkPlanDraftDirty } from "./model";
import { getWorkSpaceHomePath, getWorkSpaceWorkbenchPath, getWorkTargetFromPath } from "./space-paths";
import { useWorks } from "./useWorks";
import { canMaintainWorkByType, createDefaultNodeDraft, createSpaceMetricsSection, listReadableWorkPlans, nextSortOrder, normalizeInitialTarget, prependActiveTargetId, sameTarget } from "./works-client-helpers";
import { createWorkReportPeriodNavigationBody, useWorkReportsController } from "./WorkReportsPanel";
import { workReportingSection } from "./WorkReportingSections";
import { useWorkOkrSettingsController, workOkrSettingsBody } from "./WorkOkrSettingsPanel";
import { useWorkKpiDefinitionController, useWorkKpiScorecardController } from "./WorkKpiPanel";
import { useWorkTaskFormSurface } from "./WorkTaskFields";
import { createWorkPlanContentSection } from "./WorkPlanSections";
import { useWorkPlanCommands } from "./WorkPlanCommands";
import { useWorkOkrPlanSurface } from "./WorkOkrPlanSurface";
import { applyDefaultExpandedWorkSpaces, createWorkSpaceNavigationBody, workSpaceKey } from "./WorkSpaceSidebar";
import { activeWorkSpaceNavigationKey, createWorkSpaceTopNavigationItems, filterWorkSpacesByNavigation, targetNavigationKey, workViewNavigationItemsForSpace, WORK_GANTT_NAVIGATION_KEY, WORK_KPI_NAVIGATION_KEY, WORK_OKR_SETTINGS_VIEW_NAVIGATION_ITEM, WORK_REPORTING_NAVIGATION_KEY, WORK_TASK_VIEW_NAVIGATION_ITEMS, WORK_TASKS_COLLABORATION_VIEW_KEY, WORK_TASKS_OWNED_VIEW_KEY, type WorkTasksChildView } from "./WorkSpaceTopNavigation";
import { useWorkPlanPagination } from "./useWorkPlanPagination";
import { createWorkToolbarItems } from "./WorkToolbar";
import { planMatchesFutureFilter, type WorkPlanFutureFilter } from "./work-plan-future-filter";
import { ownedPeriodTypeForFilter, planMatchesPeriodFilter, type WorkPlanPeriodFilter } from "./work-plan-period-filter";
import { matchesWorkPlanStatusFilter, matchesWorkStatusFilter, type WorkStatusFilter } from "./work-status-filter";
import { useWorkPlanGanttView } from "./useWorkPlanGanttView";
import { useInitialGoalPreview } from "./InitialGoalPreview";
import type { WorkReportStage } from "./WorkReportPayload";
import type { WorkItem, WorkOkrPeriodType, WorkPlan, WorkPlanDraft, WorkTarget, WorkTaskApprovalRequest, WorkTaskSpace } from "./types";
import { useOkrStageControls } from "./useOkrStageControls";
import { useAssignedWorkNavigation } from "./useAssignedWorkNavigation";
import { periodScheduleMatrixSectionSpec, workPeriodScheduleCreateKey, type WorkPeriodScheduleCreateContext, type WorkPeriodScheduleCreateDraft, type WorkPeriodScheduleCreateInput } from "./WorkPeriodScheduleMatrix";
import { createScheduleCreateDraft } from "./work-period-schedule-create-modal";
import type { WorkPeriodCollectionResponse } from "./period-collection-types";
import { useDepartmentCollaborationController } from "./DepartmentCollaborationPanel";

// 临时隐藏目标考核内容：期初目标和考核结果表格待重新梳理。
const WORK_GOAL_REPORTS_CONTENT_EMPTY = true;

export default function WorksClient({ user, initialTarget, shellTitle }: {
  user: SessionUser;
  initialTarget?: WorkTarget;
  shellTitle?: string;
}) {
  const { notify, confirmDelete } = useFeedback();
  const [spaces, setSpaces] = useState<WorkTaskSpace[]>([]);
  const [preferredDepartmentIds, setPreferredDepartmentIds] = useState<number[]>([]);
  const [preferredProjectIds, setPreferredProjectIds] = useState<number[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [activeTarget, setActiveTarget] = useState<WorkTarget | null>(() => normalizeInitialTarget(initialTarget));
  const [activeTab, setActiveTab] = useState("tasks");
  const [workTasksChildView, setWorkTasksChildView] = useState<WorkTasksChildView>(WORK_TASKS_OWNED_VIEW_KEY);
  const [goalReportStage, setGoalReportStage] = useState<WorkReportStage>("kr");
  const [compactNavigation, setCompactNavigation] = useState(false);
  const [plans, setPlans] = useState<WorkPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [activeRoutineTaskId, setActiveRoutineTaskId] = useState<number | null>(null);
  const [planCreating, setPlanCreating] = useState(false);
  const [planEditing, setPlanEditing] = useState(false);
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false);
  const [pendingRoutineTaskCreatePlanId, setPendingRoutineTaskCreatePlanId] = useState<number | null>(null);
  const [planDraft, setPlanDraft] = useState<WorkPlanDraft>(() => createEmptyWorkPlanDraft());
  const [approvalRequests, setApprovalRequests] = useState<WorkTaskApprovalRequest[]>([]);
  const [periodCollection, setPeriodCollection] = useState<WorkPeriodCollectionResponse | null>(null);
  const [periodCollectionLoading, setPeriodCollectionLoading] = useState(false);
  const [periodScheduleSavingKey, setPeriodScheduleSavingKey] = useState<string | null>(null);
  const [periodScheduleCreateContext, setPeriodScheduleCreateContext] = useState<WorkPeriodScheduleCreateContext | null>(null);
  const [periodScheduleCreateDraft, setPeriodScheduleCreateDraft] = useState<WorkPeriodScheduleCreateDraft | null>(null);
  const [periodScheduleCollapsedSourceIds, setPeriodScheduleCollapsedSourceIds] = useState<Set<number>>(() => new Set());
  const [planPeriodFilter, setPlanPeriodFilter] = useState<WorkPlanPeriodFilter>("all");
  const [planFutureFilter, setPlanFutureFilter] = useState<WorkPlanFutureFilter>("3m");
  const [statusFilter, setStatusFilter] = useState<WorkStatusFilter>("active");
  const [expandedSpaceKeys, setExpandedSpaceKeys] = useState<Set<string>>(() => new Set());
  const activePlan = useMemo(() => plans.find((plan) => plan.id === activePlanId) || null, [activePlanId, plans]);
  const activePlanDraft = useMemo(() => activePlan ? createWorkPlanDraft(activePlan) : null, [activePlan]);
  const planDirty = useMemo(() => isWorkPlanDraftDirty(activePlanDraft, planDraft), [activePlanDraft, planDraft]);
  const canManageOkrSettings = Boolean(
    user.visibleConfigureResourceKeys?.includes(WORK_OKR_CONTROL_CAPABILITY_KEY),
  );
  const navigationPreferredDepartmentIds = useMemo(
    () => prependActiveTargetId(preferredDepartmentIds, activeTarget, "department"),
    [activeTarget, preferredDepartmentIds],
  );
  const navigationPreferredProjectIds = useMemo(
    () => prependActiveTargetId(preferredProjectIds, activeTarget, "project"),
    [activeTarget, preferredProjectIds],
  );
  const spaceNavigationItems = useMemo(
    () => createWorkSpaceTopNavigationItems(spaces, navigationPreferredDepartmentIds, navigationPreferredProjectIds),
    [navigationPreferredDepartmentIds, navigationPreferredProjectIds, spaces],
  );
  const activeSpaceNavigationKey = useMemo(
    () => activeWorkSpaceNavigationKey(activeTarget, spaceNavigationItems),
    [activeTarget, spaceNavigationItems],
  );
  useEffect(() => {
    setPeriodScheduleCollapsedSourceIds(new Set());
  }, [activePlanId]);
  const filteredSpaces = useMemo(
    () => filterWorkSpacesByNavigation(spaces, activeSpaceNavigationKey),
    [activeSpaceNavigationKey, spaces],
  );
  const planLoadSpaces = useMemo(
    () => filteredSpaces.length > 0 ? filteredSpaces : activeTarget ? spaces.filter((space) => sameTarget(space, activeTarget)) : spaces,
    [activeTarget, filteredSpaces, spaces],
  );
  const filteredPlans = useMemo(() => {
    const keys = new Set(filteredSpaces.map((space) => targetNavigationKey(space)));
    return plans.filter((plan) => keys.has(targetNavigationKey(plan)));
  }, [filteredSpaces, plans]);
  const futureFilteredPlans = useMemo(() => filteredPlans.filter((plan) => planMatchesFutureFilter(plan, planFutureFilter)), [filteredPlans, planFutureFilter]);
  const periodFilteredPlans = useMemo(() => futureFilteredPlans.filter((plan) => planMatchesPeriodFilter(plan, planPeriodFilter)), [futureFilteredPlans, planPeriodFilter]);
  const navigationPlans = useMemo(() => periodFilteredPlans.filter((plan) => plan.kind === "routine"
    ? statusFilter === "active" || plan.id === activePlanId
    : matchesWorkPlanStatusFilter(plan, statusFilter)), [activePlanId, periodFilteredPlans, statusFilter]);
  const kpiPlans = useMemo(
    () => filteredPlans.filter((plan) => plan.kind === "okr" && matchesWorkPlanStatusFilter(plan, statusFilter)),
    [filteredPlans, statusFilter],
  );
  const planPagination = useWorkPlanPagination(activePlan, navigationPlans);
  const currentSpace = useMemo(() => {
    const target = activePlan ? { targetType: activePlan.targetType, targetId: activePlan.targetId } : activeTarget;
    return spaces.find((space) => sameTarget(space, target)) || null;
  }, [activePlan, activeTarget, spaces]);
  const scopedWorkTasksChildView = currentSpace?.targetType === "personal"
    ? workTasksChildView
    : currentSpace?.targetType === "department" && workTasksChildView === WORK_TASKS_COLLABORATION_VIEW_KEY
      ? WORK_TASKS_COLLABORATION_VIEW_KEY
      : WORK_TASKS_OWNED_VIEW_KEY;
  const isDepartmentCollaborationView = activeTab === "tasks"
    && currentSpace?.targetType === "department"
    && scopedWorkTasksChildView === WORK_TASKS_COLLABORATION_VIEW_KEY;
  const currentSpacePlans = useMemo(() => currentSpace ? plans.filter((plan) => sameTarget(plan, currentSpace)) : [], [currentSpace, plans]);
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
  const worksState = useWorks(currentSpace, activePlanId);
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
    if (!activeRoutineTask) setActiveRoutineTaskId(null);
  }, [activePlan?.kind, activeRoutineTask, activeRoutineTaskId, worksState.loading]);
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
    canEditPlan,
    canEditObjectives,
    canEditTasks,
    canEditKrs,
    canSubmitObjectiveReview,
    canSubmitKrReview,
    canCreateNode,
    createNodeLabel,
    nodeSaveLabel,
  } = stageControls;
  const createDraftNeedsParent = activePlan?.kind !== "routine" && worksState.createDraft.itemType !== "objective";
  const createNodeMissingParent = createDraftNeedsParent && !worksState.createDraft.parentWorkItemId;
  const showToast = useCallback((message: string, type: "success" | "error") => notify(message, type), [notify]);
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
  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true);
    try {
      const data = await listTaskSpaces();
      const nextSpaces = data.spaces;
      setSpaces(nextSpaces);
      setPreferredDepartmentIds(data.preferredDepartmentIds);
      setPreferredProjectIds(data.preferredProjectIds);
      const requested = normalizeInitialTarget(initialTarget);
      const match = requested ? nextSpaces.find((space) => sameTarget(space, requested)) : null;
      const personal = nextSpaces.find((space) => space.targetType === "personal");
      const fallback = match || personal || nextSpaces[0] || null;
      setActiveTarget((current) => match || (current && nextSpaces.some((space) => sameTarget(space, current)) ? current : fallback));
      if (!match && fallback && requested) {
        window.history.replaceState(null, "", workspacePath(getWorkSpaceWorkbenchPath(fallback.targetType, fallback.targetId)));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "加载工作空间失败", "error");
    } finally {
      setSpacesLoading(false);
    }
  }, [initialTarget, showToast]);
  const loadPlans = useCallback(async (options?: { isCancelled?: () => boolean }) => {
    if (planLoadSpaces.length === 0) {
      if (options?.isCancelled?.()) return;
      setPlans([]);
      setActivePlanId(null);
      setPlansLoading(false);
      return;
    }
    setPlansLoading(true);
    try {
      const { plans: nextPlans, error } = await listReadableWorkPlans(planLoadSpaces, activeTarget);
      if (options?.isCancelled?.()) return;
      if (error) throw error;
      setPlans(nextPlans);
      setActivePlanId((current) => {
        if (current && nextPlans.some((plan) => plan.id === current)) return current;
        const preferredActivePlan = nextPlans.find((plan) => sameTarget(plan, activeTarget) && !plan.isArchived);
        const preferredAnyPlan = nextPlans.find((plan) => sameTarget(plan, activeTarget));
        return preferredActivePlan?.id ?? preferredAnyPlan?.id ?? null;
      });
    } catch (err) {
      if (options?.isCancelled?.()) return;
      showToast(err instanceof Error ? err.message : "加载工作计划失败", "error");
    } finally {
      if (!options?.isCancelled?.()) setPlansLoading(false);
    }
  }, [activeTarget, planLoadSpaces, showToast]);
  const kpiScorecardState = useWorkKpiScorecardController({
    enabled: activeTab === WORK_KPI_NAVIGATION_KEY,
    space: currentSpace,
    plan: activePlan,
    onToast: showReportToast,
    onRefreshPlans: loadPlans,
  });
  const kpiDefinitionState = useWorkKpiDefinitionController({
    enabled: activeTab === WORK_KPI_NAVIGATION_KEY,
    space: currentSpace,
    onToast: showReportToast,
    onDefinitionsChanged: kpiScorecardState.reload,
  });
  const loadApprovalRequests = useCallback(async (options?: { isCancelled?: () => boolean }) => {
    if (!currentSpace || currentSpace.targetType === "personal") {
      if (options?.isCancelled?.()) return;
      setApprovalRequests([]);
      return;
    }
    try {
      const nextApprovalRequests = await listWorkTaskSubmissions(currentSpace);
      if (options?.isCancelled?.()) return;
      setApprovalRequests(nextApprovalRequests);
    } catch (err) {
      if (options?.isCancelled?.()) return;
      showToast(err instanceof Error ? err.message : "加载流程状态失败", "error");
    }
  }, [currentSpace, showToast]);
  const loadPeriodCollection = useCallback(async (options?: { isCancelled?: () => boolean; silent?: boolean }) => {
    if (!currentSpace || activePlan?.kind !== "okr" || !activePlan.okrCycleId) {
      if (options?.isCancelled?.()) return;
      setPeriodCollection(null);
      setPeriodCollectionLoading(false);
      return;
    }
    if (!options?.silent) setPeriodCollectionLoading(true);
    try {
      const collection = await fetchWorkPeriodCollection(currentSpace, activePlan.okrCycleId, {
        displayPeriodType: defaultScheduleDisplayPeriodType(activePlan.periodType),
        includeItems: true,
      });
      if (options?.isCancelled?.()) return;
      setPeriodCollection(collection);
    } catch (err) {
      if (options?.isCancelled?.()) return;
      if (!options?.silent) setPeriodCollection(null);
      showToast(err instanceof Error ? err.message : "加载时间安排失败", "error");
    } finally {
      if (!options?.isCancelled?.() && !options?.silent) setPeriodCollectionLoading(false);
    }
  }, [activePlan, currentSpace, showToast]);
  const handleCreatePeriodScheduleItem = useCallback(async (input: WorkPeriodScheduleCreateInput, options?: { surface?: boolean }) => {
    if (!activePlan || !currentSpace || periodScheduleSavingKey) return;
    const key = workPeriodScheduleCreateKey(input.sourceItem.id, input.cycle.id, input.itemType);
    setPeriodScheduleSavingKey(key);
    try {
      const created = await postWorkPeriodScheduleItem({
        rootPlanId: activePlan.id,
        cycleId: input.cycle.id,
        sourceItemId: input.sourceItem.id,
        itemType: input.itemType,
        content: input.content,
        description: input.description,
        status: input.status,
        importance: input.importance,
        urgency: input.urgency,
        ownerEmployeeId: input.ownerEmployeeId,
        actualStartDate: input.actualStartDate,
        actualEndDate: input.actualEndDate,
        plannedStartDate: input.plannedStartDate,
        plannedEndDate: input.plannedEndDate,
      });
      if (created.executionMode === "workflow") {
        await loadApprovalRequests();
        if (!options?.surface) showToast("时间安排已提交审核", "success");
      } else {
        setPeriodCollection((current) => mergeCreatedPeriodScheduleItem(current, created.schedule));
        if (!options?.surface) showToast("时间安排已新增", "success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "准备时间安排失败";
      if (!options?.surface) showToast(message, "error");
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setPeriodScheduleSavingKey(null);
    }
  }, [
    activePlan,
    currentSpace,
    loadApprovalRequests,
    periodScheduleSavingKey,
    showToast,
  ]);
  const handleStartPeriodScheduleCreate = useCallback((input: WorkPeriodScheduleCreateContext) => {
    if (periodScheduleSavingKey) return;
    setPeriodScheduleCreateContext(input);
    setPeriodScheduleCreateDraft(createScheduleCreateDraft(input, activePlan));
  }, [activePlan, periodScheduleSavingKey]);
  const handleCancelPeriodScheduleCreate = useCallback(() => {
    if (periodScheduleSavingKey) return;
    setPeriodScheduleCreateContext(null);
    setPeriodScheduleCreateDraft(null);
  }, [periodScheduleSavingKey]);
  const handleConfirmPeriodScheduleCreate = useCallback(async () => {
    const content = periodScheduleCreateDraft?.content.trim() ?? "";
    if (!periodScheduleCreateContext || !periodScheduleCreateDraft || !content) return;
    await handleCreatePeriodScheduleItem({ ...periodScheduleCreateContext, ...periodScheduleCreateDraft, content }, { surface: true });
    setPeriodScheduleCreateContext(null);
    setPeriodScheduleCreateDraft(null);
  }, [handleCreatePeriodScheduleItem, periodScheduleCreateDraft, periodScheduleCreateContext]);
  const handleTogglePeriodScheduleSource = useCallback((work: WorkItem) => {
    setPeriodScheduleCollapsedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(work.id)) next.delete(work.id);
      else next.add(work.id);
      return next;
    });
  }, []);
  const nodeSaveDisabled = worksState.saving || !worksState.createDraft.content.trim() || createNodeMissingParent;
  const activeNodeSaveLabel = activePlan?.kind === "routine"
    ? worksState.createDraft.routineTaskType === "standing" ? "保存常设职责" : "保存任务"
    : nodeSaveLabel;
  const runCreateNodeMutation = async (options?: { feedback?: boolean; rethrow?: boolean }) => {
    await worksState.handleCreate(options);
    await Promise.all([loadSpaces(), loadPlans(), loadApprovalRequests()]);
  };
  const runUpdateNodeMutation = () => void worksState.handleUpdate().then(() => Promise.all([loadSpaces(), loadPlans(), loadApprovalRequests()]));
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
  const openPeriodSchedulePlan = useCallback((planId: number) => {
    const plan = plans.find((item) => item.id === planId) || periodCollection?.plans.find((item) => item.plan.id === planId)?.plan || null;
    if (!plan) {
      setActivePlanId(planId);
      return;
    }
    setPlanPeriodFilter(plan.periodType === "half_year" ? "yearly" : ownedPeriodTypeForFilter(plan.periodType) ?? "routine");
    setPlans((current) => current.some((item) => item.id === plan.id) ? current : [...current, plan]);
    setActiveTarget({ targetType: plan.targetType, targetId: plan.targetId });
    setActivePlanId(plan.id);
    setActiveTab("tasks");
    setWorkTasksChildView(WORK_TASKS_OWNED_VIEW_KEY);
    setStatusFilter("active");
    setPlanCreating(false);
    setWorkCreating(false);
    window.history.pushState(null, "", workspacePath(getWorkSpaceWorkbenchPath(plan.targetType, plan.targetId)));
  }, [periodCollection, plans, setWorkCreating]);
  const periodScheduleSections = useMemo(() => activePlan?.kind === "okr" && activePlan.okrCycleId ? [
    periodScheduleMatrixSectionSpec({
      rootPlan: activePlan,
      works: worksState.works,
      collection: periodCollection,
      loading: periodCollectionLoading,
      canCreate: canCreateNode && !planCreating,
      compact: compactNavigation,
      savingKey: periodScheduleSavingKey,
      createRuntime: itemCreateRuntime ?? null,
      pendingCreate: periodScheduleCreateContext,
      createDraft: periodScheduleCreateDraft,
      onCreateDraftChange: setPeriodScheduleCreateDraft,
      onConfirmCreate: handleConfirmPeriodScheduleCreate,
      onCancelCreate: handleCancelPeriodScheduleCreate,
      onStartCreate: handleStartPeriodScheduleCreate,
      onOpenPlan: openPeriodSchedulePlan,
      collapsedSourceIds: periodScheduleCollapsedSourceIds,
      onToggleSource: handleTogglePeriodScheduleSource,
    }),
  ] : [], [
    activePlan,
    canCreateNode,
    compactNavigation,
    openPeriodSchedulePlan,
    periodCollection,
    periodCollectionLoading,
    periodScheduleCreateDraft,
    periodScheduleCreateContext,
    periodScheduleCollapsedSourceIds,
    periodScheduleSavingKey,
    planCreating,
    handleCancelPeriodScheduleCreate,
    handleConfirmPeriodScheduleCreate,
    handleStartPeriodScheduleCreate,
    handleTogglePeriodScheduleSource,
    itemCreateRuntime,
    worksState.works,
  ]);
  const okrPlanSurface = useWorkOkrPlanSurface({
    planDraft,
    works: visibleWorks,
    target: currentSpace,
    persistenceMode: (planCreating ? planCreateRuntime : planSaveRuntime)?.persistenceMode ?? "active",
    workflowRole: (planCreating ? planCreateRuntime : planSaveRuntime)?.workflowRole ?? "none",
    editability: (planCreating ? planCreateRuntime : planSaveRuntime)?.editability ?? "readonly",
    formDisabled: worksState.saving,
    autoFocusPlanTitle: planCreating,
    onPlanDraftChange: setPlanDraft,
    extraSections: activePlan?.kind === "okr" ? periodScheduleSections : [],
    table: {
      loading: worksState.loading,
      saving: worksState.saving,
      detailId: worksState.detailId,
      editingId: worksState.editingId,
      editDraft: worksState.editDraft,
      formWorks: worksState.works,
      workflowRequests: approvalRequests,
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
      onArchive: archiveWork,
      onRestore: restoreWork,
      onDelete: deleteWork,
    },
  });
  useEffect(() => { void loadSpaces(); }, [loadSpaces]);
  useEffect(() => { let cancelled = false; void loadPlans({ isCancelled: () => cancelled }); return () => { cancelled = true; }; }, [loadPlans]);
  useEffect(() => { let cancelled = false; void loadApprovalRequests({ isCancelled: () => cancelled }); return () => { cancelled = true; }; }, [loadApprovalRequests]);
  useEffect(() => { let cancelled = false; void loadPeriodCollection({ isCancelled: () => cancelled }); return () => { cancelled = true; }; }, [loadPeriodCollection]);
  useEffect(() => {
    if (!activePlan || planCreating) return;
    setPlanDraft(createWorkPlanDraft(activePlan));
  }, [activePlan, activePlan?.id, planCreating]);
  useEffect(() => { setPlanEditing(false); }, [activePlanId]);
  useEffect(() => {
    if (pendingRoutineTaskCreatePlanId === null || activePlan?.id !== pendingRoutineTaskCreatePlanId || activePlan.kind !== "routine") return;
    worksState.cancelEdit();
    worksState.startCreate({ ...createDefaultNodeDraft(activePlan, "task", [], [], "task"), sortOrder: 0 });
    setPendingRoutineTaskCreatePlanId(null);
  }, [activePlan, pendingRoutineTaskCreatePlanId, worksState]);
  useEffect(() => { setExpandedSpaceKeys((current) => applyDefaultExpandedWorkSpaces(current, spaces, activeTarget)); }, [activeTarget, spaces]);
  useEffect(() => {
    if (!spaces.length || !activeSpaceNavigationKey) return;
    if (activeTarget && filteredSpaces.some((space) => sameTarget(space, activeTarget))) return;
    const fallback = filteredSpaces[0] ?? null;
    setActiveTarget(fallback);
    setActivePlanId(null);
    setPlanCreating(false);
    setWorkCreating(false);
    if (fallback) window.history.replaceState(null, "", workspacePath(getWorkSpaceWorkbenchPath(fallback.targetType, fallback.targetId)));
  }, [activeSpaceNavigationKey, activeTarget, filteredSpaces, setWorkCreating, spaces.length]);
  useEffect(() => {
    if (spaces.length === 0) return;
    function handlePopState() {
      const target = getWorkTargetFromPath(window.location.pathname, spaces);
      if (!target) return;
      setActiveTarget({ targetType: target.targetType, targetId: target.targetId });
      setActivePlanId((current) => {
        const currentPlan = plans.find((plan) => plan.id === current);
        if (currentPlan && sameTarget(currentPlan, target)) return current;
        const firstActivePlan = plans.find((plan) => sameTarget(plan, target) && !plan.isArchived);
        const firstPlan = plans.find((plan) => sameTarget(plan, target));
        return firstActivePlan?.id ?? firstPlan?.id ?? null;
      });
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [plans, spaces]);
  useEffect(() => {
    if (activeTab === "settings" && !canManageOkrSettings) setActiveTab("tasks");
  }, [activeTab, canManageOkrSettings]);
  useEffect(() => {
    if (activeTab !== WORK_KPI_NAVIGATION_KEY || plansLoading) return;
    if (activePlan?.kind === "okr" && kpiPlans.some((plan) => plan.id === activePlan.id)) return;
    const preferred = kpiPlans.find((plan) => sameTarget(plan, activeTarget)) ?? kpiPlans[0] ?? null;
    setActivePlanId(preferred?.id ?? null);
  }, [activePlan, activeTab, activeTarget, kpiPlans, plansLoading]);
  useEffect(() => {
    if (!activePlan) return;
    const nextTarget = { targetType: activePlan.targetType, targetId: activePlan.targetId };
    if (sameTarget(activeTarget, nextTarget)) return;
    setActiveTarget(nextTarget);
  }, [activePlan, activeTarget]);
  function selectPlan(plan: WorkPlan, routineTaskId?: number | null) {
    const nextTarget = { targetType: plan.targetType, targetId: plan.targetId };
    setActiveTarget(nextTarget);
    setActivePlanId(plan.id);
    if (plan.kind === "routine") setActiveRoutineTaskId(routineTaskId ?? null);
    worksState.cancelEdit();
    resetTaskView();
    if (plan.kind === "routine" && routineTaskId) {
      const task = worksState.works.find((work) => work.id === routineTaskId);
      setStatusFilter(task?.isArchived ? "archived" : task?.status === "done" ? "done" : "active");
    }
    window.history.pushState(null, "", workspacePath(getWorkSpaceWorkbenchPath(plan.targetType, plan.targetId)));
  }
  function selectKpiPlan(plan: WorkPlan) { selectPlan(plan); setActiveTab(WORK_KPI_NAVIGATION_KEY); }
  function selectKpiSpace(space: WorkTaskSpace) { selectSpace(space); setActiveTab(WORK_KPI_NAVIGATION_KEY); }
  function resetTaskView(nextStatus?: WorkStatusFilter) { setActiveTab("tasks"); setWorkTasksChildView(WORK_TASKS_OWNED_VIEW_KEY); if (nextStatus) setStatusFilter(nextStatus); setCreateChoiceOpen(false); setPendingRoutineTaskCreatePlanId(null); setPlanCreating(false); worksState.setCreating(false); }
  function selectSpace(space: WorkTaskSpace) { changeActiveSpace(space, true); }
  function selectNavigationSpace(space: WorkTaskSpace) { changeActiveSpace(space, false); }
  function changeActiveSpace(space: WorkTaskSpace, resetView: boolean) {
    const nextTarget = { targetType: space.targetType, targetId: space.targetId };
    setActiveTarget(nextTarget);
    setActivePlanId(null);
    setExpandedSpaceKeys((current) => new Set(current).add(workSpaceKey(space)));
    if (resetView) resetTaskView("active");
    else {
      setCreateChoiceOpen(false);
      setPendingRoutineTaskCreatePlanId(null);
      setPlanCreating(false);
      setWorkCreating(false);
    }
    window.history.pushState(null, "", workspacePath(getWorkSpaceWorkbenchPath(space.targetType, space.targetId)));
  }

  function toggleSpace(space: WorkTaskSpace) { setExpandedSpaceKeys((current) => { const next = new Set(current); const key = workSpaceKey(space); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }

  const planCommands = useWorkPlanCommands({
    currentSpace,
    activePlan,
    planDraft,
    setPlanSaving,
    setPlanCreating,
    setPlanDraft,
    setActivePlanId,
    loadSpaces,
    loadPlans,
    showToast,
    confirmDelete,
  });

  async function deleteWork(work: WorkItem) {
    const ok = await confirmDelete({
      title: "删除节点",
      message: `确定删除「${work.content}」吗？`,
      confirmLabel: "删除节点",
    });
    if (!ok) return;
    await worksState.handleDelete(work);
    await Promise.all([loadSpaces(), loadPlans()]);
  }

  async function archiveWork(work: WorkItem) {
    const ok = await confirmDelete({
      title: "归档任务",
      message: `确定归档「${work.content}」吗？归档后可通过“已归档”筛选查看。`,
      confirmLabel: "归档任务",
    });
    if (!ok) return;
    await worksState.handleArchive(work);
    await Promise.all([loadSpaces(), loadPlans()]);
  }

  async function restoreWork(work: WorkItem) {
    const ok = await confirmDelete({
      title: "恢复任务",
      message: `确定恢复「${work.content}」吗？恢复后回到归档前的任务状态。`,
      confirmLabel: "恢复任务",
    });
    if (!ok) return;
    await worksState.handleRestore(work);
    await Promise.all([loadSpaces(), loadPlans()]);
  }

  function cancelPlanCreate() {
    setPlanCreating(false);
    setPlanDraft(activePlan ? createWorkPlanDraft(activePlan) : createEmptyWorkPlanDraft());
  }

  function cancelPlanEdit() {
    setPlanEditing(false);
    if (activePlan) setPlanDraft(createWorkPlanDraft(activePlan));
  }

  function startRoutineTaskCreate() {
    const routinePlan = currentSpacePlans.find((plan) => plan.kind === "routine" && !plan.isArchived);
    if (!routinePlan) {
      showToast("日常工作入口尚未加载，请稍后重试", "error");
      return;
    }
    setCreateChoiceOpen(false);
    setPlanCreating(false);
    setPlanPeriodFilter("routine");
    setActiveRoutineTaskId(null);
    setPendingRoutineTaskCreatePlanId(routinePlan.id);
    setActivePlanId(routinePlan.id);
  }

  function startPlanCreate() {
    setCreateChoiceOpen(false);
    setPendingRoutineTaskCreatePlanId(null);
    worksState.setCreating(false);
    worksState.cancelEdit();
    setPlanPeriodFilter("routine");
    setActivePlanId(null);
    setPlanCreating(true);
    setPlanDraft(createEmptyWorkPlanDraft(nextSortOrder(currentSpacePlans)));
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
      setPlanPeriodFilter(filter);
      if (!planCreating && !worksState.creating && activePlan && !planMatchesPeriodFilter(activePlan, filter)) setActivePlanId(null);
    },
    onPlanFutureFilterChange: (filter) => {
      setPlanFutureFilter(filter);
      if (!planCreating && !worksState.creating && activePlan && !planMatchesFutureFilter(activePlan, filter)) setActivePlanId(null);
    },
    onStatusFilterChange: setStatusFilter,
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
  const createChoiceSurface: FormSurfaceProps = {
    kind: "fields",
    content: {
      items: [{
        key: "createKind",
        label: "新建内容",
        required: true,
        span: "wide",
        spec: {
          valueType: "string",
          control: "choice",
          options: {
            source: "static",
            items: [{ value: "task", label: "新建任务" }, { value: "plan", label: "新建计划" }],
            visibleCount: 2,
          },
        },
        value: "",
        placeholder: "请选择",
        onChange: (value) => {
          if (value === "task") startRoutineTaskCreate();
          if (value === "plan") startPlanCreate();
        },
      }],
      layout: { columns: 3, density: "compact" },
    },
  };
  const spaceNavigationBody = createWorkSpaceNavigationBody({
    spaces: filteredSpaces,
    active: activeTarget,
    activePlanId,
    activeRoutineTaskId,
    statusFilter,
    routineWorks: navigationRoutineWorks,
    plans: navigationPlans,
    loading: spacesLoading || plansLoading,
    expandedSpaceKeys,
    planPageSize: planPagination.planPageSize,
    planPageBySpace: planPagination.planPageBySpace,
    onSelect: selectSpace,
    onSelectPlan: selectPlan,
    onToggleSpace: toggleSpace,
    onPlanPageChange: planPagination.setPlanPage,
  });
  const kpiNavigationBody = createWorkSpaceNavigationBody({
    spaces: filteredSpaces,
    active: activeTarget,
    activePlanId,
    activeRoutineTaskId: null,
    statusFilter,
    routineWorks: [],
    plans: kpiPlans,
    loading: spacesLoading || plansLoading,
    expandedSpaceKeys,
    planPageSize: planPagination.planPageSize,
    planPageBySpace: planPagination.planPageBySpace,
    onSelect: selectKpiSpace,
    onSelectPlan: selectKpiPlan,
    onToggleSpace: toggleSpace,
    onPlanPageChange: planPagination.setPlanPage,
  });
  const settingsBody = workOkrSettingsBody(settingsState.sections);
  const kpiBody = createPageBody([
    ...kpiDefinitionState.body.sections,
    ...kpiScorecardState.body.sections,
  ]);
  const isolatedRoutineTaskCreate = Boolean(
    pendingRoutineTaskCreatePlanId !== null
    || (worksState.creating
      && activePlan?.kind === "routine"
      && worksState.createDraft.routineTaskType === "task"),
  );
  const globalCreateFormSurface = planCreating ? okrPlanSurface.planFormSurface : createTaskSurface;
  const globalCreateForm = createSurfaceForm(globalCreateFormSurface);
  const globalCreateOpen = createChoiceOpen || planCreating || isolatedRoutineTaskCreate;
  const closeGlobalCreate = () => {
    setCreateChoiceOpen(false);
    setPendingRoutineTaskCreatePlanId(null);
    cancelPlanCreate();
    worksState.setCreating(false);
  };
  const planCreateSubmission = actionRuntimeCreateSubmission(planCreateRuntime, {
    disabled: planSaving || worksState.saving || !isPlanDraftComplete(planDraft),
    execute: () => planCommands.handleCreatePlan({ feedback: false, rethrow: true }),
  });
  const globalCreateSubmission = planCreating ? planCreateSubmission : nodeCreateSubmission;
  const globalCreate: PageSurfaceCreateSpec = {
    id: "work-create",
    presentation: "block",
    title: planCreating ? "新建计划" : isolatedRoutineTaskCreate ? "新建任务" : "新建",
    open: globalCreateOpen,
    canCreate: Boolean(planCreateSubmission || nodeCreateSubmission),
    disabled: worksState.saving || planSaving,
    content: {
      kind: "form",
      form: globalCreateForm,
      flow: {
        kind: "two-stage",
        stage: createChoiceOpen ? "first" : "second",
        first: { items: createSurfaceForm(createChoiceSurface).items },
      },
    },
    submission: globalCreateSubmission ?? { action: "save", disabled: true, execute: () => undefined },
    feedback: {
      saved: planCreating ? "工作计划已新建" : "任务已新建",
      submitted: planCreating ? "目标计划已提交审核" : "任务已提交审核",
    },
    onOpenChange: (open) => {
      if (!open) {
        closeGlobalCreate();
        return;
      }
      setPlanCreating(false);
      worksState.setCreating(false);
      worksState.cancelEdit();
      setCreateChoiceOpen(true);
    },
  };
  const planSaveDisabled = planSaving || worksState.saving || !isPlanDraftComplete(planDraft)
    || (!planCreating && !planDirty);
  const runPlanSave = () => {
    const reopening = activePlan?.status === "done" && planDraft.status === "active";
    void planCommands.handleSavePlan().then((outcome) => {
      if (!outcome) return;
      setPlanEditing(false);
      if (reopening && outcome === "committed") setStatusFilter("active");
    });
  };
  const planSaveActions = workflowActionSurfaceActions(actionRuntimeCommands(planSaveRuntime, {
    "record.save": { label: "保存计划修改", disabled: planSaveDisabled, onClick: runPlanSave },
    "workflow.request.submit": { label: "提交", disabled: planSaveDisabled, onClick: runPlanSave },
  }));
  const workPlanSection = createWorkPlanContentSection({
    planCreating,
    globalCreateOpen,
    sectionTitle: isolatedRoutineTaskCreate ? "新建任务" : "工作计划",
    hideWorkSections: isolatedRoutineTaskCreate,
    activePlan,
    canEditPlan,
    planEditing,
    planSaveActions,
    canDeletePlan: canDelete && activePlan?.kind !== "routine" && !activePlan?.okrCycleId,
    canSubmitObjectiveReview,
    canSubmitKrReview,
    canArchivePlan: canArchive && activePlan?.kind !== "routine",
    nodeCreating: worksState.creating,
    planSubmitDisabled: planSaving || worksState.saving || !activePlan || (activePlan.kind === "okr" && rootObjectives.length === 0),
    krSubmitDisabled: planSaving || worksState.saving || !activePlan,
    planFormSurface: okrPlanSurface.planFormSurface,
    workSections: okrPlanSurface.workSections,
    plansLoading,
    hasCurrentSpacePlans: currentSpacePlans.length > 0,
    onArchivePlan: () => void planCommands.handleArchivePlan(),
    onDeletePlan: () => void planCommands.handleDeletePlan(),
    onEditPlan: () => {
      if (!activePlan) return;
      setPlanDraft(createWorkPlanDraft(activePlan));
      setPlanEditing(true);
    },
    onCancelPlanEdit: cancelPlanEdit,
    onSubmitObjectiveReview: () => void planCommands.handleSubmitObjectiveReview(),
    onSubmitKrReview: () => void planCommands.handleSubmitKrReview(),
  });
  const reportsBody = goalReportStage === "kr"
    ? createSpaceWorkbenchBody({ left: initialGoalPreview.leftNavigationBody, right: initialGoalPreview.rightBody, label: "职责与目标", ratio: [0.24, 0.76] })
    : createPageBody([]);
  const workReportingSections = [workReportingSection({
    draft: workReportingState.draft,
    periodType: workReportingState.periodType,
    loading: workReportingState.loading,
    canEdit: workReportingState.canEditDraft,
    onUpdate: workReportingState.updateItem,
  })];
  if (workReportingState.formActions.length > 0) {
    workReportingSections.push(createFieldsSection("work-reporting-actions", [], { actions: workReportingState.formActions }));
  }
  const workReportingBody = createPageBody(currentSpace
    ? workReportingSections
    : [createMessageSection("empty-space", { content: spacesLoading ? "加载工作空间中..." : "当前账号暂无可进入的工作计划空间", tone: "muted" })]);
  const workReportingNavigationBody = createWorkReportPeriodNavigationBody(workReportingState);
  const leftNavigationBody = activeTab === WORK_REPORTING_NAVIGATION_KEY
    ? workReportingNavigationBody
    : activeTab === "tasks" ? assignedNavigation.assignedNavigationBody ?? spaceNavigationBody : spaceNavigationBody;
  const rightBody = createPageBody(currentSpace ? [
      createSpaceMetricsSection(currentSpace),
      activeTab === "tasks" ? assignedNavigation.assignedBodySection ?? workPlanSection : workPlanSection,
    ] : [createMessageSection("empty-space", { content: spacesLoading ? "加载工作空间中..." : "当前账号暂无可进入的工作计划空间", tone: "muted" })]);
  const ganttBody = createPageBody(currentSpace ? [ganttView.section] : [createMessageSection("empty-space", { content: spacesLoading ? "加载工作空间中..." : "当前账号暂无可进入的工作计划空间", tone: "muted" })]);
  const activeNavigationTab = activeTab === WORK_GANTT_NAVIGATION_KEY
    ? "tasks"
    : activeTab === WORK_KPI_NAVIGATION_KEY
      ? "reports"
      : activeTab === "reports" && goalReportStage === "final"
        ? WORK_REPORTING_NAVIGATION_KEY
      : activeTab;
  const pageNavigation = navigationItems.length > 0 ? createPageTabBar({
    label: workAgentNavigationLabel(currentSpace, activePlan),
    items: navigationItems,
    active: activeNavigationTab,
    activeChild: activeNavigationTab === WORK_REPORTING_NAVIGATION_KEY
      ? activeTab === "reports" ? "final" : workReportingState.periodType
      : activeNavigationTab === "reports"
        ? activeTab === WORK_KPI_NAVIGATION_KEY ? WORK_KPI_NAVIGATION_KEY : "kr"
        : activeNavigationTab === "tasks"
          ? activeTab === WORK_GANTT_NAVIGATION_KEY ? WORK_GANTT_NAVIGATION_KEY : scopedWorkTasksChildView
          : undefined,
    onChange: setActiveTab,
    onChildChange: (child) => {
      if (child === "weekly" || child === "monthly") {
        setActiveTab(WORK_REPORTING_NAVIGATION_KEY);
        workReportingState.updatePeriodType(child);
      } else if (child === "kr" || child === "final") {
        setActiveTab("reports");
        setGoalReportStage(child);
      } else if (child === WORK_KPI_NAVIGATION_KEY) {
        setActiveTab(WORK_KPI_NAVIGATION_KEY);
      } else if (child === WORK_GANTT_NAVIGATION_KEY) {
        setActiveTab(WORK_GANTT_NAVIGATION_KEY);
      } else if (child === "owned" || (currentSpace?.targetType === "personal" && (child === "assigned" || child === "collaboration")) || (currentSpace?.targetType === "department" && child === "collaboration")) {
        setActiveTab("tasks");
        setWorkTasksChildView(child);
      }
    },
    variant: compactNavigation ? "small" : "large",
    ariaLabel: "工作视图",
  }) : undefined;
  return renderAppShellPage({
    title: shellTitle ?? "工作空间",
    backHref: activeTarget ? getWorkSpaceHomePath(activeTarget.targetType, activeTarget.targetId) : "/work",
    user,
    headerSelector: spaceSelector,
    children: <PageSurface kind="standard"
      create={activeTab === "tasks" && !assignedNavigation.assignedBodySection ? globalCreate : undefined}
      tabbar={pageNavigation}
      toolbar={toolbarItems.length > 0 ? { items: toolbarItems } : undefined}
      body={activeTab === "settings" ? settingsBody : activeTab === WORK_KPI_NAVIGATION_KEY ? createSpaceWorkbenchBody({ left: kpiNavigationBody, right: kpiBody, label: "KPI 周期计划", ratio: [0.3, 0.7] }) : isDepartmentCollaborationView ? createSpaceWorkbenchBody({ left: collaborationState.leftNavigationBody, right: collaborationState.rightBody, label: "协作事项", ratio: [0.3, 0.7] }) : activeTab === "gantt" ? ganttBody : activeTab === "reports" ? reportsBody : activeTab === WORK_REPORTING_NAVIGATION_KEY ? createSpaceWorkbenchBody({ left: leftNavigationBody, right: workReportingBody, label: "汇报周期", ratio: [0.24, 0.76] }) : createSpaceWorkbenchBody({ left: leftNavigationBody, right: rightBody, label: "工作空间", ratio: [0.3, 0.7] })}
    />,
  });
}

function workAgentNavigationLabel(space: WorkTaskSpace | null, plan: WorkPlan | null) {
  const spaceContext = space ? `${space.name} [${space.targetType}:${space.targetId}]` : "未选择空间";
  const planContext = plan ? `${plan.title} [plan:${plan.id}]` : "未选择计划";
  return `Work 空间：${spaceContext} · 计划：${planContext}`.slice(0, 120);
}

function createSurfaceForm(
  surface: FormSurfaceProps,
  layout: CreateSurfaceFormSpec["layout"] = { columns: 3, density: "compact" },
): CreateSurfaceFormSpec {
  if (surface.kind !== "fields") throw new Error("Work 新建表单必须使用 fields FormSurface");
  return {
    items: surface.content.items,
    layout,
  };
}

function responsiveWorkNavigationItems(items: Array<{ key: string; label: string; children?: Array<{ key: string; label: string }> }>) {
  const compactLabels: Record<string, string> = {
    tasks: "计划",
    "work-reporting": "汇报",
    reports: "考核",
    gantt: "甘特",
    kpi: "KPI",
    settings: "设置",
    kr: "期初目标",
    final: "考核结果",
    governance: "管控",
    "kpi-definitions": "指标库",
  };
  return items.map((item) => ({
    ...item,
    compactLabel: compactLabels[item.key] ?? item.label,
    children: item.children?.map((child) => ({
      ...child,
      compactLabel: compactLabels[child.key] ?? child.label,
    })),
  }));
}

function defaultScheduleDisplayPeriodType(periodType: string | null | undefined): WorkOkrPeriodType | null {
  if (periodType === "yearly" || periodType === "half_year") return "quarterly";
  if (periodType === "quarterly") return "monthly";
  if (periodType === "monthly") return "weekly";
  return null;
}

function mergeCreatedPeriodScheduleItem(
  current: WorkPeriodCollectionResponse | null,
  created: WorkPeriodScheduleCreateResult,
): WorkPeriodCollectionResponse | null {
  if (!current) return current;
  const planEntry = {
    plan: created.plan,
    overlapCycleIds: created.planOverlapCycleIds,
  };
  const itemEntry = {
    item: created.item,
    planId: created.planId,
    planTitle: created.plan.title,
    planCycleId: created.planCycleId,
    planCycleLabel: created.planCycleLabel,
    overlapCycleIds: created.overlapCycleIds,
  };
  return {
    ...current,
    plans: current.plans.some((entry) => entry.plan.id === created.planId) ? current.plans : [...current.plans, planEntry],
    items: current.items.some((entry) => entry.item.id === created.workId)
      ? current.items.map((entry) => entry.item.id === created.workId ? itemEntry : entry)
      : [...current.items, itemEntry],
  };
}
