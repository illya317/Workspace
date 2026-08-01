import type { SourceCapabilityFactory } from "./capability-declaration-contract";

export function createProductCapabilityDeclarations(capability: SourceCapabilityFactory) {
  return [
    capability("finance", "entry", "L1 接入与组合层", {
      kind: "entry",
      rootPrefixes: ["app/(modules)/finance/", "app/api/modules/finance/"],
    }),
    capability("finance", "assets", "资产", {
      prefixes: ["server/assets/", "ui/assets/", "types/assets", "constants/assets", "server/domain/asset-"],
    }),
    capability("finance", "budget", "预算", {
      prefixes: ["server/budget/", "ui/budget/", "types/budget", "constants/budget", "server/domain/budget-"],
    }),
    capability("finance", "close", "关账", {
      prefixes: ["server/close/", "types/close", "server/domain/close-"],
    }),
    capability("finance", "cost", "成本", {
      prefixes: ["server/cost/", "ui/cost/", "types/cost", "constants/cost", "server/domain/cost-"],
    }),
    capability("finance", "ledger", "总账与重分类", {
      prefixes: [
        "server/ledger/", "ui/ledger/", "types/ledger", "constants/ledger",
        "server/domain/ledger-", "server/domain/group-", "server/domain/counterparty-",
        "server/schedules/", "types/auxiliary-reclass", "types/group-account", "types/reclass",
      ],
    }),
    capability("finance", "ledger-group-accounts", "集团科目与映射", {
      parentKey: "ledger",
      prefixes: ["server/ledger/group-accounts/", "types/group-account"],
      files: [
        "ui/ledger/GroupAccountTab.tsx", "ui/ledger/companyAccountPresentation.ts",
        "ui/ledger/groupAccountCatalogCreate.ts", "ui/ledger/groupAccountCatalogPresentation.ts",
        "ui/ledger/groupAccountConsolidationRule.ts", "ui/ledger/groupAccountMappingPresentation.ts",
        "ui/ledger/groupAccountToolbarItems.ts", "ui/ledger/useGroupAccountReclassRule.ts",
      ],
    }),
    capability("finance", "ledger-reclassification", "余额与辅助重分类", {
      parentKey: "ledger",
      prefixes: [
        "server/ledger/balance-reclass/", "server/ledger/reclass-results/",
        "server/ledger/reclass-rules/", "server/ledger/reclassify/", "server/schedules/",
        "types/auxiliary-reclass", "types/reclass",
      ],
      files: [
        "ui/ledger/ReclassTab.tsx", "ui/ledger/reclassRulePresentation.test.ts",
        "ui/ledger/reclassRulePresentation.ts", "ui/ledger/reclassWorkbench.ts",
      ],
    }),
    capability("finance", "statements", "报表与合并", {
      prefixes: [
        "server/statements/", "ui/statements/", "types/statements", "constants/statements",
        "server/domain/statement-", "server/domain/consolidation-", "server/group-policy-",
        "types/consolidated-", "types/consolidation-",
        "types/statement-",
      ],
    }),
    capability("finance", "statement-consolidation", "合并流程与工作底稿", {
      parentKey: "statements",
      prefixes: [
        "server/statements/consolidat", "server/domain/consolidation-", "server/group-policy-",
        "types/consolidated-", "types/consolidation-", "ui/statements/Consolidat",
        "ui/statements/consolidat",
      ],
    }),
    capability("finance", "consolidation-lifecycle", "合并批次与来源生命周期", {
      parentKey: "statement-consolidation",
      prefixes: [
        "server/statements/consolidation-batch", "server/statements/consolidation-company-directory",
        "server/statements/consolidation-dto", "server/statements/consolidation-fingerprint",
        "server/statements/consolidation-lifecycle", "server/statements/consolidation-overview",
        "server/statements/consolidation-preparation", "server/statements/consolidation-readiness",
        "server/statements/consolidation-replay", "server/statements/consolidation-scope",
        "server/statements/consolidation-snapshot", "server/statements/consolidation-source",
        "ui/statements/ConsolidationPreparation", "ui/statements/consolidation-overview",
        "ui/statements/consolidation-period",
      ],
    }),
    capability("finance", "statement-exchange-translation", "汇率、折算与汇兑", {
      parentKey: "statement-consolidation",
      prefixes: [
        "server/statements/chinamoney-", "server/statements/exchange-",
        "server/statements/consolidation-frozen-rates", "server/statements/consolidation-rate-applications",
        "server/statements/consolidation-remittance-fx-entries", "server/statements/consolidated-output-fx",
        "server/statements/consolidated-output-translation", "ui/statements/consolidation-fx-summary",
      ],
    }),
    capability("finance", "tax", "税务", {
      prefixes: ["server/tax/", "ui/tax/", "types/tax", "constants/tax", "server/domain/tax-"],
    }),
    capability("finance", "treasury", "资金", {
      prefixes: [
        "server/treasury/", "ui/treasury/", "types/treasury", "constants/treasury",
        "server/domain/treasury-", "types/fund-flow",
      ],
    }),
    capability("finance", "analysis", "财务分析", {
      prefixes: [
        "server/analysis/", "ui/analysis/", "server/workspace-analysis-",
        "types/analysis", "constants/analysis",
        "server/domain/operational-analysis-", "types/management-analysis", "types/operational-analysis",
      ],
    }),
    capability("finance", "import", "财务导入", {
      prefixes: ["import/", "server/import/", "server/domain/readable-import-"],
    }),
    capability("finance", "shared-ui", "财务共享界面", {
      files: [
        "ui/formatters.test.ts", "ui/formatters.ts", "ui/workbook-download.test.ts", "ui/workbook-download.ts",
      ],
      prefixes: ["ui/components/", "ui/navigation/"],
    }),
    capability("finance", "shared-contracts", "财务公共契约", {
      files: [
        "README.md", "business-temporal.ts", "index.ts", "module.ts", "package.json",
        "server/domain/shared-validation.ts",
        "constants/index.ts", "server/index.ts", "server/workbook-formula-contract.test.ts",
        "server/workbook-formula-contract.ts", "types/index.ts", "ui/index.ts", "tsconfig.json",
      ],
      interfaceFiles: ["server/domain/shared-validation.ts"],
    }),

    capability("work", "entry", "L1 接入与组合层", {
      kind: "entry",
      rootPrefixes: ["app/(modules)/work/", "app/api/modules/work/"],
    }),
    capability("work", "meetings", "会议", { prefixes: ["server/meetings/", "ui/meetings/"] }),
    capability("work", "projects", "项目", {
      files: ["ui/tabs/ProjectTab.tsx"],
      prefixes: [
        "server/project-", "server/projects.", "server/projects/", "server/domain/project-", "server/work-project-",
        "ui/project/", "ui/tabs/project/",
      ],
    }),
    capability("work", "project-notifications", "项目通知治理", {
      parentKey: "projects",
      prefixes: ["server/project-notification-", "server/domain/project-notification-"],
    }),
    capability("work", "project-planning", "项目阶段与计划", {
      parentKey: "projects",
      prefixes: ["server/projects/plan/"],
    }),
    capability("work", "project-membership", "项目成员与空间", {
      parentKey: "projects",
      prefixes: [
        "server/project-access-", "server/project-member", "server/project-space-",
        "server/project-spaces.", "server/domain/project-member", "server/domain/project-space-",
      ],
    }),
    capability("work", "project-governance", "项目治理与生命周期", {
      parentKey: "projects",
      prefixes: [
        "server/project-approval", "server/project-normalization", "server/project-preferences",
        "server/projects.", "server/work-project-", "server/domain/project-approval",
      ],
    }),
    capability("work", "tasks", "任务与工作项", {
      files: [
        "ui/works/WorkApprovalDisplay.ts", "ui/works/WorkApprovalGoalLabels.ts",
        "ui/works/WorkApprovalInboxDetail.tsx", "ui/works/WorkApprovalRevisionDisplay.ts",
        "ui/works/WorkTaskDetail.tsx", "ui/works/WorkTaskFields.tsx", "ui/works/WorkTaskTable.tsx",
        "ui/works/WorkToolbar.ts", "ui/works/WorksClient.tsx", "ui/works/WorksPage.tsx",
        "ui/works/api.ts", "ui/works/model-paths.test.ts", "ui/works/model.ts",
        "ui/works/space-paths.ts", "ui/works/types.ts", "ui/works/useWorks.ts",
        "ui/works/WorkSpaceSidebar.tsx", "ui/works/WorkSpaceTopNavigation.ts",
        "ui/works/work-completion-options.ts", "ui/works/work-space-sidebar-sort.test.ts",
        "ui/works/work-item-outline-cell.ts", "ui/works/work-status-filter.test.ts",
        "ui/works/work-status-filter.ts", "ui/works/works-client-helpers.tsx",
      ],
      prefixes: [
        "server/task-", "server/work-task-", "server/work-item-", "server/works.",
        "server/domain/work-completion-", "server/domain/work-item-", "server/domain/work-participant-",
      ],
    }),
    capability("work", "task-approvals", "任务审批与修订", {
      parentKey: "tasks",
      prefixes: ["server/task-approval", "server/task-approvals.", "server/task-reports."],
      files: [
        "ui/works/WorkApprovalDisplay.ts", "ui/works/WorkApprovalGoalLabels.ts",
        "ui/works/WorkApprovalInboxDetail.tsx", "ui/works/WorkApprovalRevisionDisplay.ts",
      ],
    }),
    capability("work", "task-execution", "任务执行与工作项", {
      parentKey: "tasks",
      prefixes: [
        "server/work-item-", "server/work-task-", "server/works.",
        "server/domain/work-completion-", "server/domain/work-item-", "server/domain/work-participant-",
      ],
      files: [
        "ui/works/WorkTaskDetail.tsx", "ui/works/WorkTaskFields.tsx", "ui/works/WorkTaskTable.tsx",
        "ui/works/work-completion-options.ts", "ui/works/work-item-outline-cell.ts",
        "ui/works/work-status-filter.test.ts", "ui/works/work-status-filter.ts",
      ],
    }),
    capability("work", "task-spaces", "任务空间", {
      parentKey: "tasks",
      prefixes: ["server/task-space"],
    }),
    capability("work", "task-workbench", "任务工作台组合", {
      kind: "orchestrator",
      parentKey: "tasks",
      files: [
        "ui/works/WorkSpaceSidebar.tsx", "ui/works/WorkSpaceTopNavigation.ts",
        "ui/works/WorkToolbar.ts", "ui/works/WorksClient.tsx", "ui/works/WorksPage.tsx",
        "ui/works/useWorks.ts", "ui/works/works-client-helpers.tsx",
      ],
    }),
    capability("work", "task-workbench-model", "任务工作台模型", {
      parentKey: "task-workbench",
      files: [
        "ui/works/api.ts", "ui/works/model-paths.test.ts", "ui/works/model.ts",
        "ui/works/space-paths.ts", "ui/works/types.ts",
        "ui/works/work-space-sidebar-sort.test.ts", "ui/works/work-status-filter.test.ts",
        "ui/works/work-status-filter.ts",
      ],
    }),
    capability("work", "plans-goals-kpi", "计划、目标与绩效", {
      parentKey: "tasks",
      files: [
        "ui/works/InitialGoalPreview.tsx", "ui/works/WorkKpiApi.test.ts",
        "ui/works/WorkKpiApi.ts", "ui/works/WorkKpiPanel.tsx",
        "ui/works/WorkKpiSurfaceBuilders.ts", "ui/works/WorkKpiTypes.ts",
        "ui/works/WorkOkrPlanSurface.tsx", "ui/works/WorkOkrSettingsPanel.tsx",
        "ui/works/WorkPeriodScheduleCompactSourceCell.tsx", "ui/works/WorkPeriodScheduleMatrix.test.ts",
        "ui/works/WorkPeriodScheduleMatrix.tsx", "ui/works/WorkPlanCommands.ts",
        "ui/works/WorkPlanFields.tsx", "ui/works/WorkPlanGanttSection.tsx",
        "ui/works/WorkPlanSections.tsx", "ui/works/initial-goal-preview-model.ts",
        "ui/works/period-collection-types.ts", "ui/works/useOkrStageControls.ts",
        "ui/works/useWorkPlanGanttView.ts", "ui/works/useWorkPlanPagination.ts",
        "ui/works/work-okr-settings-draft.ts", "ui/works/work-okr-settings-types.ts",
        "ui/works/work-period-schedule-create-modal.ts", "ui/works/work-plan-future-filter.test.ts",
        "ui/works/work-plan-future-filter.ts", "ui/works/work-plan-gantt-model.ts",
        "ui/works/work-plan-navigation-order.ts", "ui/works/work-plan-pagination.test.ts",
        "ui/works/work-plan-pagination.ts", "ui/works/work-plan-period-filter.test.ts",
        "ui/works/work-plan-period-filter.ts", "ui/works/work-target-presentation.ts",
      ],
      prefixes: [
        "server/work-plan-", "server/work-plans.", "server/work-okr-", "server/work-kpi-",
        "server/work-kr-", "server/work-period-", "ui/gantt/",
        "server/domain/work-kpi-", "server/domain/work-kr-", "server/domain/work-okr-",
        "server/domain/work-performance-", "server/domain/work-period-", "server/domain/work-plan-",
        "server/domain/work-system-", "server/work-assigned-", "server/work-goal-", "server/work-pilot-",
      ],
    }),
    capability("work", "plan-scheduling", "计划与周期排程", {
      parentKey: "plans-goals-kpi",
      prefixes: [
        "server/work-plan-", "server/work-plans.", "server/work-period-", "ui/gantt/",
        "server/domain/work-period-", "server/domain/work-plan-", "server/work-pilot-",
      ],
      files: [
        "ui/works/WorkPeriodScheduleCompactSourceCell.tsx", "ui/works/WorkPeriodScheduleMatrix.test.ts",
        "ui/works/WorkPeriodScheduleMatrix.tsx", "ui/works/WorkPlanCommands.ts",
        "ui/works/WorkPlanFields.tsx", "ui/works/WorkPlanGanttSection.tsx",
        "ui/works/WorkPlanSections.tsx", "ui/works/period-collection-types.ts",
        "ui/works/useWorkPlanGanttView.ts", "ui/works/useWorkPlanPagination.ts",
        "ui/works/work-period-schedule-create-modal.ts", "ui/works/work-plan-future-filter.test.ts",
        "ui/works/work-plan-future-filter.ts", "ui/works/work-plan-gantt-model.ts",
        "ui/works/work-plan-navigation-order.ts", "ui/works/work-plan-pagination.test.ts",
        "ui/works/work-plan-pagination.ts", "ui/works/work-plan-period-filter.test.ts",
        "ui/works/work-plan-period-filter.ts",
      ],
    }),
    capability("work", "okr-governance", "OKR 与结果治理", {
      parentKey: "plans-goals-kpi",
      prefixes: [
        "server/work-assigned-", "server/work-goal-", "server/work-kr-", "server/work-okr-",
        "server/domain/work-kr-", "server/domain/work-okr-", "server/domain/work-performance-",
        "server/domain/work-system-",
      ],
      files: [
        "ui/works/InitialGoalPreview.tsx", "ui/works/WorkOkrPlanSurface.tsx",
        "ui/works/WorkOkrSettingsPanel.tsx", "ui/works/initial-goal-preview-model.ts",
        "ui/works/useOkrStageControls.ts", "ui/works/work-okr-settings-draft.ts",
        "ui/works/work-okr-settings-types.ts", "ui/works/work-target-presentation.ts",
      ],
    }),
    capability("work", "kpi-scorecards", "KPI 与计分卡", {
      parentKey: "plans-goals-kpi",
      prefixes: ["server/work-kpi-", "server/domain/work-kpi-"],
      files: [
        "ui/works/WorkKpiApi.test.ts", "ui/works/WorkKpiApi.ts", "ui/works/WorkKpiPanel.tsx",
        "ui/works/WorkKpiSurfaceBuilders.ts", "ui/works/WorkKpiTypes.ts",
      ],
    }),
    capability("work", "reporting-analysis", "汇报与分析", {
      parentKey: "tasks",
      files: [
        "work-report-periods.ts", "ui/works/WorkReportPayload.ts",
        "ui/works/WorkReportPeriods.test.ts", "ui/works/WorkReportPeriods.ts",
        "ui/works/WorkReportingSections.ts", "ui/works/WorkReportingSettingsSection.ts",
        "ui/works/WorkReportsPanel.tsx",
      ],
      prefixes: [
        "server/report-", "server/work-report-", "server/workspace-analysis-", "server/domain/work-report-",
        "server/weekly-report-",
        "server/domain/work-reporting-",
      ],
    }),
    capability("work", "workspace-analysis-sources", "工作区分析来源组合", {
      parentKey: "reporting-analysis",
      prefixes: ["server/workspace-analysis-"],
    }),
    capability("work", "workspace-analysis-runtime", "工作区分析执行组合", {
      kind: "orchestrator",
      parentKey: "workspace-analysis-sources",
      files: [
        "server/workspace-analysis-parameter-detail-executor.ts",
        "server/workspace-analysis-source-executor.ts",
        "server/workspace-analysis-sources.ts",
      ],
    }),
    capability("work", "collaboration", "协作与责任范围", {
      parentKey: "tasks",
      files: [
        "server/access.ts", "ui/works/AssignedDepartmentWorkSection.tsx",
        "ui/works/DepartmentCollaborationForm.ts", "ui/works/DepartmentCollaborationPanel.tsx",
        "ui/works/useAssignedWorkNavigation.tsx", "ui/works/useResponsibilityChoices.ts",
        "ui/works/work-responsibility-fields.ts",
      ],
      prefixes: [
        "server/business-space-", "server/department-", "server/work-collaboration-",
        "server/work-owner-", "server/work-responsibility-", "server/work-source-",
        "server/work-superior-",
        "server/domain/department-", "server/domain/work-responsibility-",
      ],
    }),
    capability("work", "shared-ui", "工作共享界面", {
      files: ["ui/index.ts"],
      prefixes: ["ui/home/"],
    }),
    capability("work", "shared-contracts", "工作公共契约", {
      kind: "orchestrator",
      files: [
        "business-temporal.ts", "index.ts", "module.ts", "package.json", "server/fk-registry.ts",
        "server/index.ts", "server/schemas.ts", "server/standard-space-seeds.ts",
        "server/workflow-todo-provider.ts", "tsconfig.json",
      ],
      prefixes: ["constants/", "types/", "import/"],
    }),
    capability("work", "mutation-impact", "变更影响传播", {
      files: ["server/work-mutation-impact.ts"],
      prefixes: ["server/work-mutation-impact-", "server/domain/work-mutation-impact-"],
    }),

    capability("hr", "entry", "L1 接入与组合层", {
      kind: "entry",
      rootPrefixes: ["app/(modules)/hr/", "app/api/modules/hr/", "app/api/open/v1/hr/"],
    }),
    capability("hr", "library-export", "人事资料输出", {
      files: ["server/library-source.ts"],
    }),
    capability("hr", "analysis", "人事分析", {
      files: ["server/analysis.ts"],
      prefixes: ["server/analysis/", "ui/analytics/"],
    }),
    capability("hr", "employment-lifecycle", "员工与雇佣生命周期", {
      files: [
        "server/domain/page-draft-validation.test.ts",
        "server/domain/page-draft-validation.ts",
      ],
      prefixes: [
        "employee-", "employment-", "server/agreement-", "server/contract-", "server/contracts.",
        "server/employee-", "server/employees.", "server/employment-", "server/employments.",
        "server/social-insurance-", "ui/profile/",
        "server/domain/contract-", "server/domain/employee-", "server/domain/employment-",
        "server/contracts-capacity.", "server/employments-department-scope.", "server/roster-",
        "server/roster.", "ui/generated/", "utils/contract-", "utils/employment-",
      ],
    }),
    capability("hr", "employee-records", "员工档案与花名册", {
      parentKey: "employment-lifecycle",
      prefixes: [
        "employee-", "server/employee-", "server/employees.", "server/roster-", "server/roster.",
        "server/domain/employee-", "ui/profile/", "ui/generated/",
      ],
    }),
    capability("hr", "employment-agreements", "劳动合同与附件", {
      parentKey: "employment-lifecycle",
      prefixes: [
        "server/agreement-", "server/contract-", "server/contracts.",
        "server/domain/contract-", "server/employment-agreement", "utils/contract-",
      ],
    }),
    capability("hr", "social-insurance", "社会保险", {
      parentKey: "employee-records",
      prefixes: ["server/social-insurance-"],
      files: ["server/employee-social-insurance.ts"],
    }),
    capability("hr", "organization", "组织、部门与岗位", {
      prefixes: [
        "server/department-", "server/departments.", "server/edp-", "server/edps.",
        "server/organization-", "server/position-", "server/positions.", "ui/organization/",
        "ui/tabs/department-position/", "utils/department-",
        "server/domain/department-", "server/domain/organization-", "server/domain/position-",
      ],
    }),
    capability("hr", "positions", "职位与组织归属", {
      parentKey: "organization",
      prefixes: ["server/position-", "server/positions.", "server/domain/position-"],
    }),
    capability("hr", "position-descriptions", "职位说明书", {
      parentKey: "positions",
      prefixes: [
        "server/edp-", "server/edps.", "server/position-description",
        "server/position-report-", "server/domain/position-report-",
      ],
      files: ["ui/tabs/department-position/use-position-description-templates.ts"],
    }),
    capability("hr", "organization-structure", "组织结构版本", {
      parentKey: "organization",
      prefixes: ["server/organization-", "server/domain/organization-", "ui/organization/"],
    }),
    capability("hr", "performance", "绩效", {
      prefixes: [
        "server/performance-", "server/performance.", "server/performance/",
        "server/domain/performance-", "ui/performance/",
      ],
    }),
    capability("hr", "data-quality", "人事数据质量", {
      files: ["server/audit-entities.ts"],
      prefixes: ["server/data-quality-", "server/data-quality.", "server/domain/audit-", "ui/audit/"],
    }),
    capability("hr", "code-governance", "人事编码治理", {
      files: ["ui/code-helpers.ts"],
      prefixes: ["server/domain/code-governance-", "ui/code/"],
    }),
    capability("hr", "shared-ui", "人事共享界面", {
      files: [
        "ui/HRClient.tsx", "ui/fk-keys.ts", "ui/index.ts", "ui/roster-surface.ts",
        "server/autocomplete-config.ts", "server/autocomplete.ts", "server/hr-tab-list-capacity.test.ts",
        "ui/tabs/DepartmentPositionTab.tsx", "ui/tabs/EditableTable.tsx", "ui/tabs/GenericTableTab.tsx",
        "ui/tabs/generic-table-columns.ts", "ui/tabs/generic-table-export.ts",
      ],
      prefixes: ["ui/components/", "ui/hooks/"],
    }),
    capability("hr", "shared-contracts", "人事公共契约与支撑", {
      files: [
        "README.md", "business-temporal.test.ts", "business-temporal.ts", "index.ts", "module.ts",
        "package.json", "server/field-reference-adapter.ts", "server/field-validation.ts",
        "server/fk-registry.ts", "server/hr-crud.ts", "server/index.ts",
        "server/reference-count-adapter.ts", "server/reference-guards.ts", "server/route-commands.ts",
        "server/schemas.ts", "tsconfig.json", "utils/identity.ts", "utils/index.ts",
      ],
      prefixes: ["constants/", "types/", "import/"],
    }),

    capability("core", "shared-contracts", "核心公共契约", {
      kind: "orchestrator",
      files: [
        "README.md", "action-glyph-contract.ts", "index.ts", "module-contract.ts", "package.json",
        "page-style-preview.ts", "surface-navigation-contract.ts", "tsconfig.json", "ui-registry.ts",
      ],
      interfaceFiles: [
        "action-glyph-contract.ts", "index.ts", "module-contract.ts", "page-style-preview.ts",
        "surface-navigation-contract.ts", "ui-registry.ts",
      ],
    }),
    capability("core", "hooks", "通用交互 Hooks", {
      prefixes: ["hooks/"],
      interfaceFiles: ["hooks/index.ts", "hooks/useScrollToIndexedItem.ts"],
    }),
    capability("core", "period", "期间语义", {
      prefixes: ["period/"],
      interfaceFiles: ["period/index.ts"],
    }),
    capability("core", "routing", "部署单元路由", {
      prefixes: ["routing/"],
      interfaceFiles: ["routing/index.ts"],
    }),
    capability("core", "search", "通用搜索", {
      prefixes: ["search/"],
      interfaceFiles: ["search/index.ts"],
    }),
    capability("core", "ui-surfaces", "核心界面契约", {
      prefixes: ["ui/"],
    }),
    capability("core", "surface-runtime", "UI Surface 运行时", {
      parentKey: "ui-surfaces",
      prefixes: ["ui/"],
      interfaceFiles: [
        "ui/CreateSurface.tsx", "ui/DataSurface.types.ts", "ui/FormSurface.tsx", "ui/InputSurface.tsx",
        "ui/MobileExperienceBoundary.tsx", "ui/NavigationSurface.tsx", "ui/NavigationSurface.types.ts",
        "ui/SurfaceContractTypes.ts", "ui/internal/action/ActionControls.tsx",
        "ui/internal/action/ActionGlyphs.tsx", "ui/internal/action/CreateActionControls.tsx",
        "ui/internal/common/Badge.tsx", "ui/internal/common/CommandButton.tsx",
        "ui/internal/common/DisclosureRecordCard.tsx", "ui/internal/common/DropdownSurface.tsx",
        "ui/internal/common/FloatingPortalSurface.tsx", "ui/internal/common/SplitWorkspaceMasterContext.tsx",
        "ui/internal/common/card-utils.ts", "ui/internal/common/interactionTokens.ts",
        "ui/internal/common/text-overflow.ts", "ui/internal/create/CreateSurfaceAnchorContext.tsx",
        "ui/internal/form/FormStyles.ts", "ui/internal/input/CalendarDateInput.tsx",
        "ui/internal/input/CalendarDatePopover.tsx", "ui/internal/input/FieldShell.tsx",
        "ui/internal/input/InputSurfaceTypes.ts", "ui/internal/input/RemovableTag.tsx",
        "ui/internal/input/adaptive-control-width.ts", "ui/internal/input/field-context.tsx",
        "ui/internal/input/input-surface-choice-renderers.tsx", "ui/internal/page/PageSurface.commands.tsx",
        "ui/services/FeedbackProvider.tsx", "ui/services/PageAssistantProvider.tsx",
      ],
    }),
    capability("core", "surface-data-input", "数据、表单与输入运行时", {
      parentKey: "surface-runtime",
      files: [
        "ui/DataSurface.tsx", "ui/DataSurface.types.ts", "ui/FormSurface.tsx",
        "ui/FormSurface.types.ts", "ui/InputSurface.tsx", "ui/Toolbar.tsx",
      ],
      prefixes: [
        "ui/internal/data/", "ui/internal/form/", "ui/internal/input/", "ui/internal/toolbar/",
      ],
      interfaceFiles: [
        "ui/DataSurface.tsx", "ui/DataSurface.types.ts", "ui/FormSurface.tsx",
        "ui/FormSurface.types.ts", "ui/InputSurface.tsx", "ui/Toolbar.tsx",
        "ui/internal/form/FormField.tsx", "ui/internal/form/FormStyles.ts",
        "ui/internal/input/CalendarDateInput.tsx", "ui/internal/input/CalendarDatePopover.tsx",
        "ui/internal/input/FieldShell.tsx", "ui/internal/input/InputSurfaceTypes.ts",
        "ui/internal/input/RemovableTag.tsx", "ui/internal/input/adaptive-control-width.ts",
        "ui/internal/input/field-context.tsx", "ui/internal/input/input-surface-choice-renderers.tsx",
      ],
    }),
    capability("core", "surface-layout-feedback", "页面布局、内容与反馈运行时", {
      parentKey: "surface-runtime",
      files: [
        "ui/BodySurface.tsx", "ui/BodySurface.types.ts", "ui/CreateSurface.tsx",
        "ui/CreateSurface.types.ts", "ui/DocumentSurface.tsx", "ui/FeedbackProvider.tsx",
        "ui/MobileExperienceBoundary.tsx", "ui/NavigationSurface.tsx",
        "ui/NavigationSurface.types.ts", "ui/PageSurface.tsx", "ui/PageSurface.types.ts",
        "ui/PaperInputSurface.tsx", "ui/PaperInputSurface.types.ts",
      ],
      prefixes: [
        "ui/internal/action/", "ui/internal/body/", "ui/internal/common/", "ui/internal/create/",
        "ui/internal/page/", "ui/internal/paper/",
      ],
      interfaceFiles: [
        "ui/CreateSurface.tsx", "ui/CreateSurface.types.ts", "ui/MobileExperienceBoundary.tsx",
        "ui/NavigationSurface.tsx", "ui/NavigationSurface.types.ts",
        "ui/internal/action/ActionControls.tsx", "ui/internal/action/ActionGlyphs.tsx",
        "ui/internal/action/CreateActionControls.tsx", "ui/internal/common/Badge.tsx",
        "ui/internal/common/CommandButton.tsx", "ui/internal/common/DetailModal.tsx",
        "ui/internal/common/DisclosureRecordCard.tsx", "ui/internal/common/DropdownSurface.tsx",
        "ui/internal/common/FloatingPortalSurface.tsx", "ui/internal/common/SplitWorkspaceMasterContext.tsx",
        "ui/internal/common/SurfaceFrameContextParts.tsx", "ui/internal/common/card-utils.ts",
        "ui/internal/common/interactionTokens.ts", "ui/internal/common/text-overflow.ts",
        "ui/internal/create/CreateSurfaceAnchorContext.tsx", "ui/internal/page/PageSurface.commands.tsx",
      ],
    }),
    capability("core", "table-filtering", "表格与筛选", {
      parentKey: "surface-data-input",
      files: ["ui/internal/input/FieldValueFilter.tsx", "ui/internal/input/SearchInput.tsx"],
      prefixes: ["ui/internal/data/", "ui/internal/toolbar/"],
      interfaceFiles: ["ui/internal/toolbar/toolbar-styles.ts"],
    }),
    capability("core", "field-references", "字段引用与选择", {
      parentKey: "surface-data-input",
      files: [
        "ui/NavigationContextSelector.tsx", "ui/SelectorSurface.tsx", "ui/SelectorSurface.types.ts",
        "ui/selector-tree-expansion.ts", "ui/internal/input/FkFieldInput.tsx",
        "ui/internal/input/SearchableOptionInput.tsx", "ui/internal/input/autocomplete-list-styles.ts",
        "ui/internal/input/autocomplete-option-display.ts",
      ],
      prefixes: ["ui/internal/selection/"],
      interfaceFiles: [
        "ui/SelectorSurface.tsx", "ui/SelectorSurface.types.ts",
        "ui/internal/input/FkFieldInput.tsx", "ui/internal/input/SearchableOptionInput.tsx",
        "ui/internal/selection/SelectionGrid.tsx", "ui/internal/selection/SelectionParts.tsx",
        "ui/internal/selection/SelectorCard.tsx",
      ],
    }),
    capability("core", "visualization", "可视化", {
      parentKey: "surface-runtime",
      files: ["ui/VisualizationSurface.tsx", "ui/VisualizationSurfaceTypes.ts"],
      prefixes: ["ui/internal/visualization/"],
      interfaceFiles: ["ui/VisualizationSurface.tsx"],
    }),
    capability("core", "showcase", "核心界面样例组合", {
      kind: "orchestrator",
      prefixes: ["showcase/"],
    }),

  ] as const;
}
