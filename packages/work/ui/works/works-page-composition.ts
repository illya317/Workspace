import { createFieldsSection, createMessageSection, createPageBody, createPageTabBar, type CreateSurfaceFormSpec, type FormSurfaceProps, type PageSurfaceCreateSpec } from "@workspace/core/ui";
import { actionRuntimeCommands, actionRuntimeCreateSubmission, createSpaceWorkbenchBody, workflowActionSurfaceActions } from "@workspace/platform/ui";
import type { useDepartmentCollaborationController } from "./DepartmentCollaborationPanel";
import type { useInitialGoalPreview } from "./InitialGoalPreview";
import type { useAssignedWorkNavigation } from "./useAssignedWorkNavigation";
import type { useWorkReportsController } from "./WorkReportsPanel";
import { createWorkReportPeriodNavigationBody } from "./WorkReportsPanel";
import { workReportingSection } from "./WorkReportingSections";
import type { WorkItem, WorkPlan, WorkTarget, WorkTaskSpace } from "./types";
import { isPlanDraftComplete } from "./model";
import type { useOkrStageControls } from "./useOkrStageControls";
import type { useWorkOkrPlanSurface } from "./WorkOkrPlanSurface";
import { createWorkPlanContentSection } from "./WorkPlanSections";
import { createWorkSpaceNavigationBody } from "./WorkSpaceSidebar";
import type { WorkStatusFilter } from "./work-status-filter";
import type { useWorkPlanWorkspace } from "./WorkPlanCommands";
import type { useWorkTaskWorkspace } from "./useWorkTaskWorkspace";
import type { WorkReportStage } from "./WorkReportPayload";
import { WORK_GANTT_NAVIGATION_KEY, WORK_KPI_NAVIGATION_KEY, WORK_REPORTING_NAVIGATION_KEY, type WorkTasksChildView } from "./WorkSpaceTopNavigation";
type PageBody = ReturnType<typeof createPageBody>;
type NavigationItem = { key: string; label: string; children?: Array<{ key: string; label: string }> };
type PlanWorkspace = ReturnType<typeof useWorkPlanWorkspace>;
type TaskWorkspace = ReturnType<typeof useWorkTaskWorkspace>;
type CreateChoiceControllerInput = {
  plans: WorkPlan[]; planWorkspace: PlanWorkspace; taskWorkspace: TaskWorkspace;
  setOpen: (value: boolean) => void; setPendingRoutinePlanId: (value: number | null) => void; onUnavailable: () => void;
};
type NavigationBodiesInput = {
  spaces: WorkTaskSpace[]; active: WorkTarget | null; activePlanId: number | null; activeRoutineTaskId: number | null;
  statusFilter: WorkStatusFilter; routineWorks: WorkItem[]; navigationPlans: WorkPlan[]; kpiPlans: WorkPlan[]; loading: boolean;
  expandedSpaceKeys: ReadonlySet<string>; planPageSize: number; planPageBySpace: ReadonlyMap<string, number>;
  onSelect: (space: WorkTaskSpace) => void; onSelectPlan: (plan: WorkPlan, routineTaskId?: number | null) => void;
  onSelectKpiSpace: (space: WorkTaskSpace) => void; onSelectKpiPlan: (plan: WorkPlan) => void;
  onToggleSpace: (space: WorkTaskSpace) => void; onPlanPageChange: (space: WorkTaskSpace, page: number) => void;
};
type PlanViewInput = {
  planWorkspace: PlanWorkspace; taskWorkspace: TaskWorkspace; stageControls: ReturnType<typeof useOkrStageControls>;
  createChoiceSurface: FormSurfaceProps; createTaskSurface: FormSurfaceProps; okrPlanSurface: ReturnType<typeof useWorkOkrPlanSurface>;
  nodeCreateSubmission: ReturnType<typeof actionRuntimeCreateSubmission>;
  planCreateRuntime: WorkTaskSpace["actionRuntimes"]["planCreate"] | undefined;
  planSaveRuntime: WorkTaskSpace["actionRuntimes"]["planSave"] | undefined;
  createChoiceOpen: boolean; setCreateChoiceOpen: (value: boolean) => void;
  pendingRoutineTaskCreatePlanId: number | null; setPendingRoutineTaskCreatePlanId: (value: number | null) => void;
  canDelete: boolean; canArchive: boolean; plansLoading: boolean; currentSpacePlanCount: number;
};
type PageViewInput = {
  activeTab: string; setActiveTab: (value: string) => void; goalReportStage: WorkReportStage;
  setGoalReportStage: (value: WorkReportStage) => void; compactNavigation: boolean; navigationItems: NavigationItem[];
  currentSpace: WorkTaskSpace | null; activePlan: WorkPlan | null; spacesLoading: boolean;
  scopedWorkTasksChildView: WorkTasksChildView; setWorkTasksChildView: (value: WorkTasksChildView) => void;
  settingsBody: PageBody; kpiBody: PageBody;
  kpiNavigationBody: Parameters<typeof createSpaceWorkbenchBody>[0]["left"];
  spaceNavigationBody: Parameters<typeof createSpaceWorkbenchBody>[0]["left"];
  spaceMetricsSection: PageBody["sections"][number] | null; workPlanSection: PageBody["sections"][number]; ganttBody: PageBody;
  initialGoalPreview: ReturnType<typeof useInitialGoalPreview>; workReportingState: ReturnType<typeof useWorkReportsController>;
  assignedNavigation: ReturnType<typeof useAssignedWorkNavigation>; collaborationState: ReturnType<typeof useDepartmentCollaborationController>;
};
export function createWorkCreateChoiceSurface(onTask: () => void, onPlan: () => void): FormSurfaceProps {
  return {
    kind: "fields",
    content: {
      items: [{
        key: "createKind", label: "新建内容", required: true, span: "wide",
        spec: {
          valueType: "string", control: "choice",
          options: {
            source: "static", visibleCount: 2,
            items: [{ value: "task", label: "新建任务" }, { value: "plan", label: "新建计划" }],
          },
        },
        value: "", placeholder: "请选择",
        onChange: (value) => {
          if (value === "task") onTask();
          if (value === "plan") onPlan();
        },
      }],
      layout: { columns: 3, density: "compact" },
    },
  };
}
export function createWorkCreateChoiceController({
  plans, planWorkspace, taskWorkspace, setOpen, setPendingRoutinePlanId, onUnavailable,
}: CreateChoiceControllerInput) {
  return createWorkCreateChoiceSurface(() => {
    const routinePlan = plans.find((plan) => plan.kind === "routine" && !plan.isArchived);
    if (!routinePlan) { onUnavailable(); return; }
    setOpen(false);
    planWorkspace.commands.cancelCreate(); planWorkspace.commands.changePeriodFilter("routine");
    planWorkspace.commands.setActiveRoutineTaskId(null);
    setPendingRoutinePlanId(routinePlan.id);
    planWorkspace.commands.openPlan(routinePlan);
  }, () => {
    setOpen(false); setPendingRoutinePlanId(null);
    taskWorkspace.commands.setCreating(false); taskWorkspace.commands.cancelEdit();
    planWorkspace.commands.changePeriodFilter("routine");
    planWorkspace.commands.beginCreate();
  });
}
export function createWorksNavigationBodies({
  spaces, active, activePlanId, activeRoutineTaskId, statusFilter, routineWorks, navigationPlans, kpiPlans,
  loading, expandedSpaceKeys, planPageSize, planPageBySpace, onSelect, onSelectPlan,
  onSelectKpiSpace, onSelectKpiPlan, onToggleSpace, onPlanPageChange,
}: NavigationBodiesInput) {
  const common = {
    spaces, active, activePlanId, statusFilter, loading, expandedSpaceKeys,
    planPageSize, planPageBySpace, onToggleSpace, onPlanPageChange,
  };
  return {
    spaceNavigationBody: createWorkSpaceNavigationBody({
      ...common, activeRoutineTaskId, routineWorks, plans: navigationPlans, onSelect, onSelectPlan,
    }),
    kpiNavigationBody: createWorkSpaceNavigationBody({
      ...common, activeRoutineTaskId: null, routineWorks: [], plans: kpiPlans,
      onSelect: onSelectKpiSpace, onSelectPlan: onSelectKpiPlan,
    }),
  };
}
/** @ui-structural-declaration Complete Work plan/create surface composition. */
export function createWorksPlanViewModel({
  planWorkspace, taskWorkspace, stageControls, createChoiceSurface, createTaskSurface, okrPlanSurface,
  nodeCreateSubmission, planCreateRuntime, planSaveRuntime, createChoiceOpen, setCreateChoiceOpen,
  pendingRoutineTaskCreatePlanId, setPendingRoutineTaskCreatePlanId, canDelete, canArchive,
  plansLoading, currentSpacePlanCount,
}: PlanViewInput) {
  const { activePlan } = planWorkspace.selection;
  const { draft, creating: planCreating, editing: planEditing, dirty, saving: planSaving } = planWorkspace.editor;
  const planCommands = planWorkspace.commands;
  const { editor: taskEditor, status: taskStatus, commands: taskCommands } = taskWorkspace;
  const isolatedRoutineTaskCreate = Boolean(
    pendingRoutineTaskCreatePlanId !== null
    || (taskEditor.creating && activePlan?.kind === "routine" && taskEditor.createDraft.routineTaskType === "task"),
  );
  const globalCreateOpen = createChoiceOpen || planCreating || isolatedRoutineTaskCreate;
  const planCreateSubmission = actionRuntimeCreateSubmission(planCreateRuntime, {
    disabled: planSaving || taskStatus.saving || !isPlanDraftComplete(draft),
    execute: () => planCommands.createPlan({ feedback: false, rethrow: true }),
  });
  const globalCreate: PageSurfaceCreateSpec = {
    id: "work-create", presentation: "block",
    title: planCreating ? "新建计划" : isolatedRoutineTaskCreate ? "新建任务" : "新建",
    open: globalCreateOpen, canCreate: Boolean(planCreateSubmission || nodeCreateSubmission),
    disabled: taskStatus.saving || planSaving,
    content: {
      kind: "form",
      form: createSurfaceForm(planCreating ? okrPlanSurface.planFormSurface : createTaskSurface),
      flow: {
        kind: "two-stage", stage: createChoiceOpen ? "first" : "second",
        first: { items: createSurfaceForm(createChoiceSurface).items },
      },
    },
    submission: (planCreating ? planCreateSubmission : nodeCreateSubmission)
      ?? { action: "save", disabled: true, execute: () => undefined },
    feedback: { saved: planCreating ? "工作计划已新建" : "任务已新建", submitted: planCreating ? "目标计划已提交审核" : "任务已提交审核" },
    onOpenChange: (open) => {
      if (!open) {
        setCreateChoiceOpen(false); setPendingRoutineTaskCreatePlanId(null); planCommands.cancelCreate();
        taskCommands.setCreating(false);
        return;
      }
      planCommands.cancelCreate(); taskCommands.setCreating(false); taskCommands.cancelEdit();
      setCreateChoiceOpen(true);
    },
  };
  const planSaveDisabled = planSaving || taskStatus.saving || !isPlanDraftComplete(draft)
    || (!planCreating && !dirty);
  const runPlanSave = () => {
    const reopening = activePlan?.status === "done" && draft.status === "active";
    void planCommands.savePlan().then((outcome) => {
      if (!outcome) return;
      planCommands.finishEdit();
      if (reopening && outcome === "committed") planCommands.changeStatusFilter("active");
    });
  };
  const planSaveActions = workflowActionSurfaceActions(actionRuntimeCommands(planSaveRuntime, {
    "record.save": { label: "保存计划修改", disabled: planSaveDisabled, onClick: runPlanSave },
    "workflow.request.submit": { label: "提交", disabled: planSaveDisabled, onClick: runPlanSave },
  }));
  const workPlanSection = createWorkPlanContentSection({
    planCreating, globalCreateOpen,
    sectionTitle: isolatedRoutineTaskCreate ? "新建任务" : "工作计划",
    hideWorkSections: isolatedRoutineTaskCreate,
    activePlan, canEditPlan: stageControls.canEditPlan, planEditing, planSaveActions,
    canDeletePlan: canDelete && activePlan?.kind !== "routine" && !activePlan?.okrCycleId,
    canSubmitObjectiveReview: stageControls.canSubmitObjectiveReview, canSubmitKrReview: stageControls.canSubmitKrReview,
    canArchivePlan: canArchive && activePlan?.kind !== "routine",
    nodeCreating: taskEditor.creating,
    planSubmitDisabled: planSaving || taskStatus.saving || !activePlan
      || (activePlan.kind === "okr" && stageControls.rootObjectives.length === 0),
    krSubmitDisabled: planSaving || taskStatus.saving || !activePlan,
    planFormSurface: okrPlanSurface.planFormSurface, workSections: okrPlanSurface.workSections, plansLoading,
    hasCurrentSpacePlans: currentSpacePlanCount > 0,
    onArchivePlan: () => void planCommands.archivePlan(), onDeletePlan: () => void planCommands.removePlan(),
    onEditPlan: planCommands.beginEdit, onCancelPlanEdit: planCommands.cancelEdit,
    onSubmitObjectiveReview: () => void planCommands.submitObjectiveReview(),
    onSubmitKrReview: () => void planCommands.submitKrReview(),
  });
  return { globalCreate, workPlanSection };
}
/** @ui-structural-declaration Complete Work page navigation and body composition. */
export function createWorksPageView({
  activeTab, setActiveTab, goalReportStage, setGoalReportStage, compactNavigation, navigationItems,
  currentSpace, activePlan, spacesLoading, scopedWorkTasksChildView, setWorkTasksChildView,
  settingsBody, kpiBody, kpiNavigationBody, spaceNavigationBody, spaceMetricsSection,
  workPlanSection, ganttBody, initialGoalPreview, workReportingState, assignedNavigation, collaborationState,
}: PageViewInput) {
  const reportsBody = goalReportStage === "kr"
    ? createSpaceWorkbenchBody({ left: initialGoalPreview.leftNavigationBody, right: initialGoalPreview.rightBody, label: "职责与目标", ratio: [0.24, 0.76] })
    : createPageBody([]);
  const reportingSections = [workReportingSection({ draft: workReportingState.draft, periodType: workReportingState.periodType,
    loading: workReportingState.loading, canEdit: workReportingState.canEditDraft, onUpdate: workReportingState.updateItem })];
  if (workReportingState.formActions.length > 0) {
    reportingSections.push(createFieldsSection("work-reporting-actions", [], { actions: workReportingState.formActions }));
  }
  const emptyBody = () => createPageBody([createMessageSection("empty-space", {
    content: spacesLoading ? "加载工作空间中..." : "当前账号暂无可进入的工作计划空间", tone: "muted",
  })]);
  const workReportingBody = currentSpace ? createPageBody(reportingSections) : emptyBody();
  const leftNavigationBody = activeTab === WORK_REPORTING_NAVIGATION_KEY
    ? createWorkReportPeriodNavigationBody(workReportingState)
    : activeTab === "tasks"
      ? assignedNavigation.assignedNavigationBody ?? spaceNavigationBody
      : spaceNavigationBody;
  const rightBody = currentSpace
    ? createPageBody([
      ...(spaceMetricsSection ? [spaceMetricsSection] : []),
      activeTab === "tasks" ? assignedNavigation.assignedBodySection ?? workPlanSection : workPlanSection,
    ])
    : emptyBody();
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
        setActiveTab(WORK_REPORTING_NAVIGATION_KEY); workReportingState.updatePeriodType(child);
      } else if (child === "kr" || child === "final") {
        setActiveTab("reports"); setGoalReportStage(child);
      } else if (child === WORK_KPI_NAVIGATION_KEY || child === WORK_GANTT_NAVIGATION_KEY) {
        setActiveTab(child);
      } else if (child === "owned"
        || (currentSpace?.targetType === "personal" && (child === "assigned" || child === "collaboration"))
        || (currentSpace?.targetType === "department" && child === "collaboration")) {
        setActiveTab("tasks"); setWorkTasksChildView(child);
      }
    },
    variant: compactNavigation ? "small" : "large",
    ariaLabel: "工作视图",
  }) : undefined;
  const body = activeTab === "settings"
    ? settingsBody
    : activeTab === WORK_KPI_NAVIGATION_KEY
      ? createSpaceWorkbenchBody({ left: kpiNavigationBody, right: kpiBody, label: "KPI 周期计划", ratio: [0.3, 0.7] })
      : activeTab === "gantt"
        ? ganttBody
        : activeTab === "reports"
          ? reportsBody
          : activeTab === WORK_REPORTING_NAVIGATION_KEY
            ? createSpaceWorkbenchBody({ left: leftNavigationBody, right: workReportingBody, label: "汇报周期", ratio: [0.24, 0.76] })
            : activeTab === "tasks" && currentSpace?.targetType === "department" && scopedWorkTasksChildView === "collaboration"
              ? createSpaceWorkbenchBody({ left: collaborationState.leftNavigationBody, right: collaborationState.rightBody, label: "协作事项", ratio: [0.3, 0.7] })
              : createSpaceWorkbenchBody({ left: leftNavigationBody, right: rightBody, label: "工作空间", ratio: [0.3, 0.7] });
  return { pageNavigation, body };
}
export function responsiveWorkNavigationItems(items: NavigationItem[]) {
  const compactLabels: Record<string, string> = {
    tasks: "计划", "work-reporting": "汇报", reports: "考核", gantt: "甘特", kpi: "KPI",
    settings: "设置", kr: "期初目标", final: "考核结果", governance: "管控", "kpi-definitions": "指标库",
  };
  return items.map((item) => ({
    ...item,
    compactLabel: compactLabels[item.key] ?? item.label,
    children: item.children?.map((child) => ({ ...child, compactLabel: compactLabels[child.key] ?? child.label })),
  }));
}
function workAgentNavigationLabel(space: WorkTaskSpace | null, plan: WorkPlan | null) {
  const spaceContext = space ? `${space.name} [${space.targetType}:${space.targetId}]` : "未选择空间";
  const planContext = plan ? `${plan.title} [plan:${plan.id}]` : "未选择计划";
  return `Work 空间：${spaceContext} · 计划：${planContext}`.slice(0, 120);
}
export function createSurfaceForm(
  surface: FormSurfaceProps,
  layout: CreateSurfaceFormSpec["layout"] = { columns: 3, density: "compact" },
): CreateSurfaceFormSpec {
  if (surface.kind !== "fields") throw new Error("Work 新建表单必须使用 fields FormSurface");
  return { items: surface.content.items, layout };
}
