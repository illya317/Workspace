import type { WorkspacePackageRegistration } from "@workspace/core";
import type { RelationRegistration } from "./server/relation-targets";
import { FINANCE_MODULE_REGISTRY_FRAGMENT } from "./module-registry-finance-operational-analytics";
import { HR_RUNTIME_REGISTRY_FRAGMENT } from "./module-registry-hr-runtime";
import { HR_RELATION_REGISTRATIONS } from "./module-registry-hr-relations";
import { WORK_RUNTIME_REGISTRY_FRAGMENT } from "./module-registry-work-runtime";
import { apiResourceGuards, assistantIntegrationApiRoutes, systemApiRoutes, validateModuleRegistry } from "./module-registry-utils";
import { listWorkflowManagementResourceRegistrations } from "./workflow-management-resources";
import { WORK_OKR_CONTROL_CAPABILITY_KEY } from "./work-reporting-policy";
export type RelationAwareWorkspacePackageRegistration = Omit<WorkspacePackageRegistration, "fkRegistrations"> & { relationRegistrations?: RelationRegistration[] };
const WORK_RELATION_REGISTRATIONS = [
  { key: "work.plan.items", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "WorkItem", field: "planId" }, target: "workPlan", targetLabel: "所属计划", nullable: false, lifecycle: { targetDelete: "confirm_cascade", targetArchive: "confirm_cascade", targetRestore: "auto_cascade_owned", sourceRelationChange: "retain" }, adapterKey: "work.plan.items", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.plan.kpi-assignments", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "WorkKpiAssignment", field: "workPlanId" }, target: "workPlan", targetLabel: "所属计划", nullable: false, lifecycle: { targetDelete: "confirm_cascade", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.plan.kpi-assignments", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.kpi-assignment.item", scope: "work", usage: "governance", semantics: "reference", source: { entity: "WorkKpiAssignment", field: "workItemId" }, target: "workItem", targetLabel: "KPI 工作项", nullable: false, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.kpi-assignment.item", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.kpi.assignment.results", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "WorkKpiResultSnapshot", field: "assignmentId" }, target: "workKpiAssignment", targetLabel: "KPI 分配", nullable: false, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.kpi.assignment.results", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.kpi.assignment.derived", scope: "work", usage: "governance", semantics: "reference", source: { entity: "WorkKpiAssignment", field: "sourceAssignmentId" }, target: "workKpiAssignment", targetLabel: "承接来源 KPI", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.kpi.assignment.derived", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.kr-evidence.kr", scope: "work", usage: "governance", semantics: "reference", source: { entity: "WorkKrEvidence", field: "krWorkItemId" }, target: "workItem", targetLabel: "关键结果", nullable: false, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.kr-evidence.kr", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.kr-evidence.task", scope: "work", usage: "governance", semantics: "reference", source: { entity: "WorkKrEvidence", field: "taskWorkItemId" }, target: "workItem", targetLabel: "证据任务", nullable: false, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.kr-evidence.task", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.meeting-action.work-item", scope: "work", usage: "governance", semantics: "reference", source: { entity: "MeetingActionCandidate", field: "linkedWorkItemId" }, target: "workItem", targetLabel: "关联工作项", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.meeting-action.work-item", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.meeting-action.work-plan", scope: "work", usage: "governance", semantics: "reference", source: { entity: "MeetingActionCandidate", field: "linkedWorkPlanId" }, target: "workPlan", targetLabel: "关联计划", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.meeting-action.work-plan", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.plan-alignment.source-item", scope: "work", usage: "governance", semantics: "reference", source: { entity: "WorkPlanAlignment", field: "sourceWorkItemId" }, target: "workItem", targetLabel: "承接来源工作项", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.plan-alignment.source-item", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.item.participants", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "WorkParticipant", field: "workItemId" }, target: "workItem", targetLabel: "所属工作项", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.item.owned-details", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.item.responsibility-reference", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "WorkResponsibilityReference", field: "workItemId" }, target: "workItem", targetLabel: "所属工作项", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.item.owned-details", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.plan.alignment-details", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "WorkPlanAlignment", field: "childPlanId" }, target: "workPlan", targetLabel: "所属计划", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.plan.owned-details", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.report-item.work-item", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "WorkReportItem", field: "workItemId" }, target: "workItem", targetLabel: "快照工作项", nullable: true, lifecycle: { targetDelete: "retain", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.report-item.work-item", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.report-item.work-plan", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "WorkReportItem", field: "workPlanId" }, target: "workPlan", targetLabel: "快照计划", nullable: true, lifecycle: { targetDelete: "retain", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.report-item.work-plan", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.plan.governance-history", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "WorkPlanGovernanceEvent", field: "workPlanId" }, target: "workPlan", targetLabel: "治理历史计划", nullable: false, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.plan.governance-history", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.projects.leadingDepartment", scope: "work", source: { entity: "Project", field: "leadingDepartmentId" }, target: "department", targetLabel: "归口部门", nullable: true, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.enablingDepartment", scope: "work", source: { entity: "ProjectEnablingDepartment", field: "departmentId" }, target: "department", targetLabel: "赋能部门", nullable: false, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.parent", scope: "work", source: { entity: "Project", field: "parentProjectId" }, target: "project", targetLabel: "上级项目", nullable: true, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.employee", scope: "work", source: { entity: "EmployeeProject", field: "employeeId" }, target: "employee", nullable: false, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.enablingDepartmentEmployee", scope: "work", source: { entity: "EmployeeProject", field: "employeeId" }, target: "employee", targetLabel: "赋能部门成员", nullable: false, permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.project", scope: "work", usage: "both", semantics: "owned_child", source: { entity: "EmployeeProject", field: "projectId" }, target: "project", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.project.owned-children", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.supersedes", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "EmployeeProject", field: "supersedesId" }, target: "employeeProject", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.projects.member.supersedes", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.created-by-change", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "EmployeeProject", field: "createdByChangeId" }, target: "projectMembershipChange", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.projects.member.created-by-change", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member.terminal-change", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "EmployeeProject", field: "terminalChangeId" }, target: "projectMembershipChange", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.projects.member.terminal-change", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member-change.employee", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "ProjectMembershipChange", field: "employeeId" }, target: "employee", nullable: false, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.projects.member-change.employee", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.member-change.project", scope: "work", usage: "governance", semantics: "snapshot", source: { entity: "ProjectMembershipChange", field: "projectId" }, target: "project", nullable: false, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.projects.member-change.project", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.enabling-department.project", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "ProjectEnablingDepartment", field: "projectId" }, target: "project", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.project.owned-children", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.phase.project", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "ProjectPlanPhase", field: "projectId" }, target: "project", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.project.owned-children", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.dependency.project", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "ProjectPlanDependency", field: "projectId" }, target: "project", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.project.owned-children", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.baseline.project", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "ProjectPlanBaseline", field: "projectId" }, target: "project", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.project.owned-children", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.projects.work-assignee.project", scope: "work", usage: "governance", semantics: "owned_child", source: { entity: "ProjectWorkAssignee", field: "projectId" }, target: "project", nullable: false, lifecycle: { targetDelete: "auto_cascade_owned", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.project.owned-children", permission: { resourceKey: "work.projects", action: "entry" } },
  { key: "work.tasks.owner.employee", scope: "work", source: { entity: "WorkItem", field: "ownerEmployeeId" }, target: "employee", targetLabel: "负责人", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.collaboration", scope: "work", source: { entity: "Any", field: "collaborationId" }, target: "departmentCollaboration", targetLabel: "部门协作", nullable: true, targetArchivePolicy: "block", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.owner.position", scope: "work", source: { entity: "WorkResponsibilityReference", field: "lockedPositionId" }, target: "position", targetLabel: "关联岗位", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.item.responsibility-group", scope: "work", source: { entity: "WorkItem", field: "responsibilityNodeId" }, target: "positionResponsibilityNode", targetLabel: "职责大类", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.item.responsibility", scope: "work", source: { entity: "WorkItem", field: "responsibilityNodeId" }, target: "positionResponsibilityNode", targetLabel: "关联职责", nullable: false, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.linked.project", scope: "work", usage: "both", semantics: "reference", source: { entity: "WorkItem", field: "linkedProjectId" }, target: "project", targetLabel: "关联项目", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.linked.project", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.linked.project-phase", scope: "work", usage: "both", semantics: "reference", source: { entity: "WorkItem", field: "linkedProjectPhaseId" }, target: "projectPlanPhase", targetLabel: "关联项目阶段", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.linked.project-phase", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.plan.linked.project", scope: "work", usage: "governance", semantics: "reference", source: { entity: "WorkPlan", field: "linkedProjectId" }, target: "project", targetLabel: "关联项目", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.plan.linked.project", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.plan.linked.project-phase", scope: "work", usage: "governance", semantics: "reference", source: { entity: "WorkPlan", field: "linkedProjectPhaseId" }, target: "projectPlanPhase", targetLabel: "关联项目阶段", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.plan.linked.project-phase", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.source.meeting", scope: "work", source: { entity: "WorkItem", field: "sourceMeetingId" }, target: "meeting", targetLabel: "来源会议", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.source.department", scope: "work", source: { entity: "Any", field: "sourceDepartmentId" }, target: "department", targetLabel: "来源部门", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.okr.cycle", scope: "work", source: { entity: "WorkPlan", field: "okrCycleId" }, target: "workOkrCycle", targetLabel: "OKR 周期", nullable: false, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.source.plan", scope: "work", usage: "both", semantics: "reference", source: { entity: "WorkPlan", field: "sourcePlanId" }, target: "workPlan", targetLabel: "来源 OKR 计划", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.source.plan", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.parent.plan", scope: "work", usage: "both", semantics: "hierarchy", source: { entity: "WorkPlan", field: "parentPeriodPlanId" }, target: "workPlan", targetLabel: "上级计划", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.parent.plan", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.plan.alignment", scope: "work", usage: "both", semantics: "reference", source: { entity: "WorkPlanAlignment", field: "sourcePlanId" }, target: "workPlan", targetLabel: "承接来源", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.plan.alignment", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.plan.upper-alignment", scope: "work", source: { entity: "WorkPlanAlignment", field: "sourcePlanId" }, target: "workPlan", targetLabel: "上级", nullable: true, permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.assigned.alignment.item", scope: "work", source: { entity: "WorkItem", field: "parentPeriodWorkItemId" }, target: "workItem", targetLabel: "承接内容", nullable: true, targetArchivePolicy: "block", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.previous.plan", scope: "work", usage: "both", semantics: "reference", source: { entity: "WorkPlan", field: "previousPeriodPlanId" }, target: "workPlan", targetLabel: "前序计划", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.previous.plan", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.parent.item", scope: "work", usage: "both", semantics: "hierarchy", source: { entity: "WorkItem", field: "parentPeriodWorkItemId" }, target: "workItem", targetLabel: "上级节点", nullable: true, targetArchivePolicy: "block", lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.parent.item", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.item.parent", scope: "work", usage: "both", semantics: "hierarchy", source: { entity: "WorkItem", field: "parentWorkItemId" }, target: "workItem", targetLabel: "所属目标/常设职责", nullable: true, targetArchivePolicy: "block", lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.item.parent", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.tasks.previous.item", scope: "work", usage: "both", semantics: "reference", source: { entity: "WorkItem", field: "previousPeriodWorkItemId" }, target: "workItem", targetLabel: "前序节点", nullable: true, targetArchivePolicy: "block", lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "work.tasks.previous.item", permission: { resourceKey: "work.tasks", action: "entry" } },
  { key: "work.meetings.participant.user", scope: "work", source: { entity: "MeetingParticipant", field: "userId" }, target: "user", targetLabel: "参会账号", nullable: false, permission: { resourceKey: "work.meetings", action: "read" } },
] satisfies RelationRegistration[];
const ADMINISTRATION_RELATION_REGISTRATIONS = [
  { key: "administration.contracts.owning.company", scope: "administration", usage: "both", semantics: "reference", source: { entity: "Contract", field: "owningCompanyId" }, target: "company", targetLabel: "归属公司", nullable: true, defaultLifecycleScope: "active", lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "administration.contracts.owning.company", permission: { resourceKey: "administration.contracts", action: "read" } },
  { key: "administration.contracts.owner.department", scope: "administration", usage: "both", semantics: "reference", source: { entity: "Contract", field: "ownerDepartmentId" }, target: "department", targetLabel: "归口部门", nullable: true, defaultLifecycleScope: "active", lifecycle: { targetDelete: "block", targetArchive: "block", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "administration.contracts.owner.department", permission: { resourceKey: "administration.contracts", action: "read" } },
  { key: "administration.contracts.party.a", scope: "administration", usage: "both", semantics: "reference", source: { entity: "Contract", field: "partyAId" }, target: "party", targetLabel: "甲方主体", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "administration.contracts.party.a", permission: { resourceKey: "administration.contracts", action: "read" } },
  { key: "administration.contracts.party.b", scope: "administration", usage: "both", semantics: "reference", source: { entity: "Contract", field: "partyBId" }, target: "party", targetLabel: "乙方主体", nullable: true, lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "administration.contracts.party.b", permission: { resourceKey: "administration.contracts", action: "read" } },
  { key: "administration.contracts.handler.employee", scope: "administration", usage: "both", semantics: "reference", source: { entity: "Contract", field: "handlerEmployeeId" }, target: "employee", targetLabel: "经办人", nullable: true, defaultLifecycleScope: "all", lifecycle: { targetDelete: "block", targetArchive: "retain", targetRestore: "retain", sourceRelationChange: "retain" }, adapterKey: "administration.contracts.handler.employee", permission: { resourceKey: "administration.contracts", action: "read" } },
] satisfies RelationRegistration[];
const FINANCE_RELATION_REGISTRATIONS = [{ key: "finance.accounts.parent", scope: "finance", source: { entity: "FinanceAccount", field: "parentId" }, target: "financeAccount", targetLabel: "上级科目", nullable: true, permission: { resourceKey: "finance.ledger", action: "read" } }, { key: "finance.groupAccount.parent", scope: "finance", source: { entity: "FinanceGroupAccountRevision", field: "parentGroupAccountId" }, target: "financeGroupAccount", targetLabel: "上级集团科目", nullable: true, permission: { resourceKey: "finance.ledger", action: "read" } }, { key: "finance.assets.category", scope: "finance", source: { entity: "FinanceAssetCard", field: "categoryId" }, target: "financeAssetCategory", targetLabel: "资产分类", nullable: false, permission: { resourceKey: "finance.assets", action: "read" } }, { key: "finance.assets.assetAccount", scope: "finance", source: { entity: "FinanceAssetCard", field: "assetAccountId" }, target: "financeAccount", targetLabel: "资产科目", nullable: true, permission: { resourceKey: "finance.assets", action: "read" } }, { key: "finance.assets.accumulatedAccount", scope: "finance", source: { entity: "FinanceAssetCard", field: "accumulatedAccountId" }, target: "financeAccount", targetLabel: "累计折旧/摊销科目", nullable: true, permission: { resourceKey: "finance.assets", action: "read" } }, { key: "finance.assets.adjustmentAccount", scope: "finance", source: { entity: "FinanceAssetAdjustment", field: "accountId" }, target: "financeAccount", targetLabel: "调整科目", nullable: true, permission: { resourceKey: "finance.assets", action: "read" } }, { key: "finance.assets.expenseAccount", scope: "finance", source: { entity: "FinanceAssetExpenseAllocation", field: "expenseAccountId" }, target: "financeAccount", targetLabel: "费用科目", nullable: true, permission: { resourceKey: "finance.assets", action: "read" } }, { key: "finance.statements.consolidation.entrySource", scope: "finance", source: { entity: "FinanceConsolidationEntryLine", field: "sourceRecordId", valueKind: "semantic" }, target: "financeConsolidationEntrySource", targetLabel: "抵销业务来源", nullable: true, permission: { resourceKey: "finance.statements", action: "read" } }] satisfies RelationRegistration[];
const EXTERNAL_RELATION_REGISTRATIONS = [{ key: "external.role.party", scope: "external", source: { entity: "ExternalPartyRole", field: "partyId" }, target: "party", targetLabel: "法定主体", nullable: false, permission: { resourceKey: "party.identity", action: "read" } }] satisfies RelationRegistration[];
const CAPITAL_SECURITIES_RELATION_REGISTRATIONS = [{ key: "capitalSecurities.company.party", scope: "capitalSecurities", source: { entity: "Company", field: "partyId" }, target: "party", targetLabel: "法定主体", nullable: false, permission: { resourceKey: "capitalSecurities.governance", action: "read" } }, { key: "capitalSecurities.ownership.owner", scope: "capitalSecurities", source: { entity: "OwnershipInterest", field: "ownerPartyId" }, target: "party", targetLabel: "持股方", nullable: false, permission: { resourceKey: "capitalSecurities.governance", action: "read" } }, { key: "capitalSecurities.ownership.issuer", scope: "capitalSecurities", source: { entity: "OwnershipInterest", field: "issuerCompanyId" }, target: "company", targetLabel: "被持股方", nullable: false, permission: { resourceKey: "capitalSecurities.governance", action: "read" } }] satisfies RelationRegistration[];
const DOCS_RELATION_REGISTRATIONS = [] satisfies RelationRegistration[];
// 模块台账：声明模块是谁、挂在哪个页面、归属哪个资源，以及暴露哪些 API contract。
export const registeredModuleDefinitions = [
  {
    packageName: "@workspace/work",
    layer: "domain",
    moduleDef: {
      key: "work",
      label: "工作管理",
      desc: "计划和项目管理",
      href: "/work",
      iconKey: "reports",
      color: "emerald",
      resourceKey: "work",
      resourceSortOrder: 0,
      children: [
        { key: "tasks", label: "工作空间", desc: "个人、部门和项目空间里的计划与执行", href: "/work/me", iconKey: "tasks", color: "emerald", resourceKey: "work.tasks", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/work/tasks"] },
        { key: "projects", label: "项目管理", desc: "组织项目、角色分工、预算和风险", href: "/work/project", iconKey: "projects", color: "emerald", resourceKey: "work.projects", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/work/projects"] },
        { key: "meetings", label: "会议管理", desc: "会议、纪要、表决和决议依据", href: "/work/meeting", iconKey: "meetings", color: "emerald", resourceKey: "work.meetings", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/work/meetings"] },
      ],
    },
    resourceDefs: [
      { key: WORK_OKR_CONTROL_CAPABILITY_KEY, name: "周期与流程配置", kind: "capability", capabilityOwnerKey: "work.tasks", runtimeParentKey: "work.tasks", sortOrder: 0 },
      { key: "work.projects.initiate", name: "项目发起", kind: "capability", capabilityOwnerKey: "work.projects", runtimeParentKey: "work.projects", sortOrder: 0 },
      { key: "work.meetings.viewAll", name: "会议全量查看", kind: "capability", capabilityOwnerKey: "work.meetings", runtimeParentKey: "work.meetings", sortOrder: 0 },
    ],
    routes: [
      { path: "/work/performance", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Performance review uses the Work task execution resource." },
      { path: "/work/me/space", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Personal workspace execution view; back navigation resolves to the personal home." },
      { path: "/work/department", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Department entry shows the organization overview shell." },
      { path: "/work/department/[departmentId]", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Department home view with department overview and scoped operational analytics." },
      { path: "/work/department/[departmentId]/space", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Department workspace execution view." },
      { path: "/work/project/[projectId]", gatePath: "/work/project", resourceKey: "work.projects", notes: "Project management deep link for the selected project." },
      { path: "/work/project/[projectId]/space", gatePath: "/work/me", resourceKey: "work.tasks", notes: "Project workspace execution view." },
      { path: "/work/meetings", gatePath: "/work/meeting", resourceKey: "work.meetings", notes: "Legacy meeting-management URL redirects to /work/meeting." },
    ],
    relationRegistrations: WORK_RELATION_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/work/meetings", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/projects", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/tasks", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/work/tasks/spaces", ["GET", "PUT"]),
      ...apiResourceGuards("/api/modules/work/tasks/reports", ["GET", "PUT"]),
    ],
    apiRoutes: [
      ...WORK_RUNTIME_REGISTRY_FRAGMENT.apiRoutes,
      { method: "POST", pathPrefix: "/api/modules/work/internal/workspace-analysis-sources", access: "internal", notes: "Signed internal RPC with requester authorization; only the Finance caller unit is accepted." },
    ],
    spaceRegistrations: [
      {
        key: "work.tasks",
        label: "任务",
        entryKind: "work-task",
        spaceResourceKind: "tasks",
        resourceKey: "work.tasks",
        app: { moduleKey: "work", childKey: "tasks", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/work/tasks/spaces/:targetType/:targetId/permissions" },
        scopeMode: "standardBusinessSpace",
        targetTypes: ["personal", "department", "committee", "company", "project"],
        permissionTargetTypes: ["department", "committee", "company", "project"],
        naturalManagerSources: {
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["租户配置的委员会负责人岗位"],
          company: ["租户配置的授权管理岗位"],
        },
        notes: "Personal space is natural-only; organization and project spaces use scoped action grants, with project membership remaining an additional access source.",
      },
      {
        key: "work.projects",
        label: "项目",
        entryKind: "work-project",
        spaceResourceKind: "projects",
        resourceKey: "work.projects",
        app: { moduleKey: "work", childKey: "projects", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/work/projects/spaces/:targetType/:targetId/permissions" },
        scopeMode: "standardBusinessSpace",
        naturalManagerSources: {
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["租户配置的委员会负责人岗位"],
          company: ["租户配置的授权管理岗位"],
        },
        notes: "Personal space is natural-only; organization spaces use scoped action grants; object services still enforce project-specific ownership rules.",
      },
    ],
  },
  {
    packageName: "@workspace/hr",
    layer: "domain",
    moduleDef: {
      key: "hr",
      label: "人事管理",
      desc: "花名册、考勤、绩效、人力分析",
      href: "/hr",
      iconKey: "hr",
      color: "blue",
      resourceKey: "hr",
      resourceSortOrder: 1,
      children: [
        { key: "roster", label: "人事基础资料", desc: "员工、雇佣、合同、部门、岗位、EDP", href: "/hr/roster", iconKey: "roster", color: "blue", resourceKey: "hr.roster", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/hr/roster"] },
        { key: "performance", label: "绩效管理", desc: "按个人、部门和项目查看绩效材料与流程", href: "/hr/performance", iconKey: "performance", color: "blue", resourceKey: "hr.performance", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/hr/performance"] },
        { key: "analytics", label: "人力分析", desc: "员工结构、部门架构、岗位分析、人员流动", href: "/hr/analytics", iconKey: "analytics", color: "blue", resourceKey: "hr.analytics", mobileExperience: { strategy: "native" }, noApiReason: "当前分析数据由 roster DTO 派生，暂无独立 API 前缀" },
      ],
    },
    resourceDefs: [
      {
        key: "hr.roster.generated",
        name: "花名册生成资料",
        kind: "capability",
        capabilityOwnerKey: "hr.roster",
        runtimeParentKey: "hr.roster",
        apiPrefixes: ["/api/modules/hr/roster/generated"],
        sortOrder: 0,
      },
    ],
    routes: ["/hr/roster/employees/[id]", { path: "/hr/performance/self", gatePath: "/work/performance", resourceKey: "work.tasks", notes: "HR-owned employee self-review surface entered through the Work task execution route." }],
    relationRegistrations: HR_RELATION_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/hr/performance", ["GET"]),
      ...apiResourceGuards("/api/modules/hr/roster/generated", ["GET"]),
      ...apiResourceGuards("/api/modules/hr/roster"),
    ],
    apiRoutes: [
      ...HR_RUNTIME_REGISTRY_FRAGMENT.apiRoutes,
      { method: "POST", pathPrefix: "/api/modules/hr/internal/workspace-analysis-sources", access: "internal", notes: "Signed internal RPC with requester authorization; only the Finance caller unit is accepted." },
    ],
  },
  {
    packageName: "@workspace/administration",
    layer: "domain",
    relationRegistrations: ADMINISTRATION_RELATION_REGISTRATIONS,
    moduleDef: {
      key: "administration",
      label: "行政管理",
      desc: "合同台账、ERP流程尽调、办公事务",
      href: "/administration",
      iconKey: "admin",
      color: "indigo",
      resourceKey: "administration",
      resourceSortOrder: 2,
      children: [
        {
          key: "contracts",
          label: "合同台账",
          desc: "合同录入、查询、到期预警",
          href: "/administration/contracts",
          iconKey: "contracts",
          color: "indigo",
          resourceKey: "administration.contracts",
          mobileExperience: { strategy: "native" },
          apiPrefixes: ["/api/modules/administration/contracts"],
        },
        { key: "erpDiligence", label: "ERP流程尽调", desc: "销售到回款现状流程、系统与材料采集", href: "/administration/erp-diligence", iconKey: "contracts", color: "indigo", resourceKey: "administration.erpDiligence", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/administration/erp-diligence"] },
      ],
    },
    resourceDefs: [
      { key: "administration.erpDiligence.viewAll", name: "ERP尽调全量查看", kind: "capability", capabilityOwnerKey: "administration.erpDiligence", runtimeParentKey: "administration.erpDiligence", sortOrder: 0 },
    ],
    apiGuards: [
      ...apiResourceGuards("/api/modules/administration/contracts", ["GET", "POST", "PUT", "PATCH", "DELETE"]),
      ...apiResourceGuards("/api/modules/administration/erp-diligence", ["GET", "POST", "PUT", "DELETE"]),
    ],
    apiRoutes: [
      { method: "POST", pathPrefix: "/api/modules/administration/internal/library-source", access: "internal", notes: "Signed caller-bound Administration contract-ledger snapshot transport; only the Library caller unit is accepted." },
      { method: "POST", pathPrefix: "/api/modules/administration/internal/workspace-analysis-sources", access: "internal", notes: "Signed internal RPC with requester authorization; only the Finance caller unit is accepted." },
    ],
  },
  {
    packageName: "@workspace/finance",
    layer: "domain",
    ...FINANCE_MODULE_REGISTRY_FRAGMENT,
    relationRegistrations: FINANCE_RELATION_REGISTRATIONS,
    apiRoutes: [
      ...FINANCE_MODULE_REGISTRY_FRAGMENT.apiRoutes,
      { method: "POST", pathPrefix: "/api/modules/finance/internal/library-source", access: "internal", notes: "Signed caller-bound Finance authoritative snapshot transport; only the Library caller unit is accepted." },
    ],
    apiGuards: [
      ...apiResourceGuards("/api/modules/finance/ledger"), ...apiResourceGuards("/api/modules/finance/assets", ["GET", "POST", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/modules/finance/treasury", ["GET", "POST", "PUT"]), ...apiResourceGuards("/api/modules/finance/tax", ["GET", "POST", "PUT"]),
      ...apiResourceGuards("/api/modules/finance/statements"),
      ...apiResourceGuards("/api/modules/finance/budget", ["GET", "POST"]),
      ...apiResourceGuards("/api/modules/finance/analysis", ["GET"]),
      ...apiResourceGuards("/api/modules/finance/cost", ["GET", "DELETE"]),
    ],
  },
  {
    packageName: "@workspace/production",
    layer: "domain",
    moduleDef: {
      key: "production",
      label: "生产管理",
      desc: "产品主档与批次检验",
      href: "/production",
      iconKey: "production",
      color: "cyan",
      resourceKey: "production",
      resourceSortOrder: 4,
      children: [
        { key: "products", label: "产品主档", desc: "产品、SKU、包装与来源映射", href: "/production/products", iconKey: "production", color: "cyan", resourceKey: "production.products", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/production/products"] },
        { key: "qc", label: "批次检验", desc: "批次创建、检验记录填写、提交复核", href: "/production/qc", iconKey: "qc", color: "cyan", resourceKey: "production.qc", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/production/qc"] },
      ],
    }, routes: [
      "/production/qc/[batchId]/[stageKey]",
      "/production/qc/[batchId]/[stageKey]/[testName]",
    ], apiGuards: [
      ...apiResourceGuards("/api/modules/production/products", ["GET", "POST", "PATCH"]),
      ...apiResourceGuards("/api/modules/production/qc", ["GET", "POST", "PATCH", "DELETE"]),
    ],
    apiRoutes: [
      { method: "POST", pathPrefix: "/api/modules/production/qc/cache", access: "internal", notes: "Server-side QC template cache rebuild; not callable as a user-facing business API." },
      { method: "POST", pathPrefix: "/api/modules/production/internal/workspace-analysis-sources", access: "internal", notes: "Signed internal RPC with requester authorization; only the Finance caller unit is accepted." },
    ],
  },
  {
    packageName: "@workspace/inventory",
    layer: "domain",
    moduleDef: {
      key: "inventory",
      label: "存货管理",
      desc: "批次、出入库、盘点和财务计价",
      href: "/inventory",
      iconKey: "inventory",
      color: "cyan",
      resourceKey: "inventory",
      resourceSortOrder: 5,
      children: [
        { key: "operations", label: "库存运营", desc: "产品库存、批次流水、盘点、导入与成本结转", href: "/inventory/operations", iconKey: "ledger", color: "cyan", resourceKey: "inventory.operations", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/inventory/operations"] },
        { key: "receipts", label: "成品入库报单", desc: "车间投料、产量、包装折合与财务复核", href: "/inventory/receipts", iconKey: "cost", color: "cyan", resourceKey: "inventory.receipts", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/inventory/receipts"] },
      ],
    },
    apiGuards: [
      ...apiResourceGuards("/api/modules/inventory/operations", ["GET", "POST"]),
      ...apiResourceGuards("/api/modules/inventory/receipts", ["GET", "POST", "PATCH", "DELETE"]),
    ],
    apiRoutes: [{ method: "POST", pathPrefix: "/api/modules/inventory/internal/closing-inspection", access: "internal", notes: "Signed read-only Inventory closing inspection; only the Finance caller unit is accepted." }, { method: "POST", pathPrefix: "/api/modules/inventory/internal/workspace-analysis-sources", access: "internal", notes: "Signed internal RPC with requester authorization; only the Finance caller unit is accepted." }],
  },
  {
    packageName: "@workspace/external",
    layer: "domain", relationRegistrations: EXTERNAL_RELATION_REGISTRATIONS,
    moduleDef: {
      key: "external",
      label: "外部关系",
      desc: "客户、供应商与关联方主数据",
      href: "/external",
      iconKey: "customers",
      color: "orange",
      resourceKey: "external",
      resourceSortOrder: 5,
      lifecycleStatus: "workspace-owned",
      children: [
        { key: "customers", label: "客户管理", desc: "单位与个人客户的主体、联系和结算信息", href: "/external/customers", iconKey: "users", color: "orange", resourceKey: "external.customers", mobileExperience: { strategy: "native" }, lifecycleStatus: "workspace-owned", apiPrefixes: ["/api/modules/external/customers"] },
        { key: "suppliers", label: "供应商管理", desc: "单位与个人供应商的主体、联系和结算信息", href: "/external/suppliers", iconKey: "suppliers", color: "orange", resourceKey: "external.suppliers", mobileExperience: { strategy: "native" }, lifecycleStatus: "workspace-owned", apiPrefixes: ["/api/modules/external/suppliers"] },
        { key: "relatedParties", label: "关联方", desc: "从客户和供应商中登记关联方并维护披露关系性质", href: "/external/related-parties", iconKey: "investors", color: "orange", resourceKey: "external.relatedParties", mobileExperience: { strategy: "native" }, lifecycleStatus: "workspace-owned", apiPrefixes: ["/api/modules/external/related-parties"] },
      ],
    },
    apiGuards: [
      ...apiResourceGuards("/api/modules/external/customers", ["GET", "POST", "PATCH", "DELETE"]),
      ...apiResourceGuards("/api/modules/external/suppliers", ["GET", "POST", "PATCH", "DELETE"]), ...apiResourceGuards("/api/modules/external/related-parties", ["GET", "POST", "DELETE"]),
    ],
    apiRoutes: [
      { method: "POST", pathPrefix: "/api/modules/external/internal/workspace-analysis-sources", access: "internal", notes: "Signed internal RPC with requester authorization; only the Finance caller unit is accepted." },
    ],
  },
  {
    packageName: "@workspace/capital-securities",
    layer: "domain",
    relationRegistrations: CAPITAL_SECURITIES_RELATION_REGISTRATIONS,
    moduleDef: {
      key: "capitalSecurities",
      label: "资本证券",
      desc: "投资人关系、治理架构与资本事务",
      href: "/capital-securities",
      iconKey: "investors",
      color: "amber",
      resourceKey: "capitalSecurities",
      resourceSortOrder: 6,
      lifecycleStatus: "workspace-owned",
      children: [
        { key: "investors", label: "投资人关系", desc: "股东关系、历史追溯与 Captable", href: "/capital-securities/investors", iconKey: "investors", color: "amber", resourceKey: "capitalSecurities.investors", mobileExperience: { strategy: "native" }, lifecycleStatus: "workspace-owned", apiPrefixes: ["/api/modules/capitalSecurities/investors"] },
        { key: "governance", label: "治理架构", desc: "治理组织、公司信息与股权关系查阅", href: "/capital-securities/governance", iconKey: "company", color: "amber", resourceKey: "capitalSecurities.governance", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/capitalSecurities/governance"] },
      ],
    },
    apiGuards: [
      ...apiResourceGuards("/api/modules/capitalSecurities/investors", ["GET"], { migrationNote: "Legacy camelCase module URL; migrate to /api/modules/capital-securities/investors." }),
      ...apiResourceGuards("/api/modules/capitalSecurities/governance", ["GET", "POST", "PUT"], {
        migrationNote: "Legacy camelCase module URL; migrate to /api/modules/capital-securities/governance.",
      }),
    ],
    apiRoutes: [
      { method: "POST", pathPrefix: "/api/modules/capitalSecurities/internal/library-source", access: "internal", migrationNote: "Legacy camelCase module URL; migrate to /api/modules/capital-securities/internal/library-source.", notes: "Signed caller-bound Capital Securities authoritative snapshot transport; only the Library caller unit is accepted." },
      { method: "POST", pathPrefix: "/api/modules/capitalSecurities/internal/workspace-analysis-sources", access: "internal", migrationNote: "Legacy camelCase module URL; migrate to /api/modules/capital-securities/internal/workspace-analysis-sources.", notes: "Signed internal RPC with requester authorization; only the Finance caller unit is accepted." },
    ],
  },
  {
    packageName: "@workspace/platform:docs",
    layer: "platform",
    moduleDef: {
      key: "docs",
      label: "文档中心",
      desc: "员工手册、操作指南、规章制度",
      href: "/docs",
      iconKey: "docs",
      color: "purple",
      resourceKey: "docs",
      resourceSortOrder: 7,
      apiPrefixes: ["/api/modules/docs"],
      children: [
        { key: "company", label: "公司管理", desc: "员工手册、管理手册与权限授权手册", href: "/docs/company", iconKey: "company", color: "purple", resourceKey: "docs.company", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/docs/company"] },
        { key: "editor", label: "模板编辑器", desc: "模板空间、纸面编辑、字段公式和 DOCX 导出", href: "/docs/editor", iconKey: "docs", color: "purple", resourceKey: "docs.editor", mobileExperience: { strategy: "native", overrides: [{ pathPrefix: "/docs/editor/templates", strategy: "landscape", reason: "模板画布需要同时保留结构、字段和纸面预览，详情编辑采用横屏工作台。" }] }, apiPrefixes: ["/api/modules/docs/editor"] },
      ],
    },
    routes: ["/docs/editor/templates/[templateId]"],
    relationRegistrations: DOCS_RELATION_REGISTRATIONS,
    apiGuards: [
      ...apiResourceGuards("/api/modules/docs", ["GET"]),
      ...apiResourceGuards("/api/modules/docs/company", ["GET"]),
      { method: "GET", pathPrefix: "/api/modules/docs/editor" },
      { method: "POST", pathPrefix: "/api/modules/docs/editor", notes: "Template create uses docs-editor service delegation to resolve the concrete target template space." },
      { method: "PUT", pathPrefix: "/api/modules/docs/editor" },
      { method: "PATCH", pathPrefix: "/api/modules/docs/editor" },
      { method: "DELETE", pathPrefix: "/api/modules/docs/editor" },
    ],
    spaceRegistrations: [
      {
        key: "docs.editor",
        label: "模板",
        entryKind: "docs-editor",
        spaceResourceKind: "templates",
        resourceKey: "docs.editor",
        app: { moduleKey: "docs", childKey: "editor", defaultLevel: "L3" },
        api: { permissionsPathTemplate: "/api/modules/docs/editor/spaces/:docsSpaceId/permissions" },
        scopeMode: "standardBusinessSpace",
        naturalManagerSources: {
          department: ["Department.managerPositionId 对应岗位的在职人员"],
          committee: ["租户配置的委员会负责人岗位"],
          company: ["租户配置的授权管理岗位"],
        },
        notes: "Personal space is natural-only; organization spaces resolve the concrete docs space id before calling the permission API.",
      },
    ],
  },
  {
    packageName: "@workspace/library",
    layer: "domain",
    moduleDef: {
      key: "library",
      label: "资料库",
      desc: "内部资料存档",
      href: "/library",
      iconKey: "library",
      color: "orange",
      resourceKey: "library",
      resourceSortOrder: 8,
      children: [
        { key: "basicInfo", label: "基本资料", desc: "资料目录、文件、生成文档和保密等级", href: "/library/basic-info", iconKey: "basicInfo", color: "orange", resourceKey: "library.basicInfo", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/modules/library/basic-info"] },
      ],
    },
    routes: ["/library/basic-info/documents/[id]"],
    apiGuards: [
      ...apiResourceGuards("/api/modules/library/basic-info", ["GET"]),
      ...apiResourceGuards("/api/modules/library/basic-info/documents", ["PATCH", "DELETE"]),
      ...apiResourceGuards("/api/modules/library/basic-info/scan", ["POST"]),
      ...apiResourceGuards("/api/modules/library/basic-info/generated-sources", ["POST"]),
      ...apiResourceGuards("/api/modules/library/basic-info/exports", ["POST"]),
    ],
    apiRoutes: [
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/directories", access: "protected", notes: "Folder creation requires library.basicInfo configure permission." },
      { method: "PATCH", pathPrefix: "/api/modules/library/basic-info/directories", access: "protected", notes: "Folder rename cascades logical placement paths and requires configure permission." },
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/directories/delete", access: "protected", notes: "Only an empty leaf folder can be deleted; configure permission is required." },
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/documents", access: "protected", notes: "File upload creates immutable V1 and starts the Library processing pipeline." },
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/documents/:id/review", access: "protected", notes: "Importer confirms the pending upload after metadata review." },
      { method: "POST", pathPrefix: "/api/modules/library/basic-info/documents/:id/delete", access: "protected", notes: "Configure-only permanent deletion is distinct from archive and cleans managed runtime storage." },
      { method: "POST", pathPrefix: "/api/modules/library/internal/workspace-analysis-sources", access: "internal", notes: "Signed internal RPC with requester authorization; only the Finance caller unit is accepted." },
      { method: "GET", pathPrefix: "/api/modules/library/integrations/onlyoffice/documents", access: "internal", notes: "Library-owned immutable document source; the legacy integration URL redirects here." },
      { method: "GET", pathPrefix: "/api/modules/library/integrations/wecom/agent/artifacts", access: "internal", notes: "Library-owned artifact stream for the Assistant WeCom bridge." },
      { method: "POST", pathPrefix: "/api/modules/library/integrations/wecom/agent/artifacts/cleanup", access: "internal", notes: "HMAC-authenticated Library maintenance endpoint removes expired generated packages while retaining audit rows." },
      { method: "GET", pathPrefix: "/api/modules/library/integrations/wecom/download", access: "public", notes: "Library-owned user-bound download target; the Assistant URL remains a compatibility redirect." },
    ],
  },
  {
    packageName: "@workspace/platform:settings",
    layer: "platform",
    moduleDef: {
      key: "settings",
      label: "设置",
      desc: "个人设置、系统配置",
      href: "/settings",
      iconKey: "settings",
      color: "orange",
      resourceKey: "settings",
      resourceSortOrder: 100,
      children: [
        { key: "account", label: "账号与接入", desc: "账号资料、通知订阅和个人 API 接入", href: "/settings/account", iconKey: "account", color: "blue", resourceKey: "settings.account", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/settings/account"] },
        { key: "admin", label: "系统管理", desc: "用户、权限、资源和管理员配置", href: "/settings/admin", iconKey: "shieldCheck", color: "indigo", resourceKey: "settings.admin", mobileExperience: { strategy: "native" }, pageAccess: "adminManage", apiPrefixes: ["/api/settings/admin"] },
        { key: "api", label: "API 接入", desc: "Open API Client、Scope 授权和调用日志", href: "/settings/api", iconKey: "api", color: "purple", resourceKey: "settings.api", mobileExperience: { strategy: "native" }, apiPrefixes: ["/api/settings/api"] },
        { key: "ui", label: "UI 组件库", desc: "查看核心 UI 组件注册表", href: "/settings/ui", iconKey: "ui", color: "emerald", resourceKey: "settings.ui", mobileExperience: { strategy: "unavailable", reason: "组件注册表是开发与治理工具，手机端不提供入口。" }, noApiReason: "纯客户端组件浏览页面，无服务端 API" },
      ],
    },
    resourceDefs: [
      { key: "party.identity", name: "法定主体治理", kind: "capability", capabilityOwnerKey: "settings.admin", runtimeParentKey: "settings.admin", sortOrder: 0 },
      { key: "settings.account.apiAccess", name: "个人 API 使用", kind: "capability", capabilityOwnerKey: "settings.account", runtimeParentKey: "settings.account", apiPrefixes: ["/api/settings/account/api-key"], sortOrder: 0 },
      { key: "settings.api.manage", name: "Open API Client 管理", kind: "capability", capabilityOwnerKey: "settings.api", runtimeParentKey: "settings.api", apiPrefixes: ["/api/settings/api/open/clients"], sortOrder: 0 },
      ...listWorkflowManagementResourceRegistrations(),
    ],
    routes: ["/settings/api/hr-generated"],
    apiRoutes: [
      { method: "GET", pathPrefix: "/api/settings/version", access: "public", notes: "Public build/version metadata; returns no user or business-resource data." },
      { method: "GET", pathPrefix: "/api/settings/account/api-key", access: "protected", migrationNote: "Legacy settings account API key URL; migrate to /api/modules/settings/account/api-access/key." },
      { method: "POST", pathPrefix: "/api/settings/account/api-key", access: "protected", migrationNote: "Legacy settings account API key URL; migrate to /api/modules/settings/account/api-access/key." },
      { method: "GET", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
      { method: "POST", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
      { method: "PUT", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
      { method: "PATCH", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
      { method: "DELETE", pathPrefix: "/api/settings/account", access: "protected", migrationNote: "Legacy settings account URL; migrate to /api/modules/settings/account.", notes: "Current-session self-service account APIs; all logged-in users receive default settings.account entry access." },
    ],
    apiGuards: [
      ...apiResourceGuards("/api/modules/settings/account/notification-subscriptions", ["GET", "PUT", "DELETE"]),
      ...apiResourceGuards("/api/settings/admin", ["GET", "POST", "PUT", "PATCH", "DELETE"], {
        migrationNote: "Legacy settings URL; migrate to /api/modules/settings/admin.",
      }),
      ...apiResourceGuards("/api/settings/api", ["GET"], {
        migrationNote: "Legacy settings URL; migrate to /api/modules/settings/api.",
      }),
      ...apiResourceGuards("/api/settings/api/open/clients", ["POST", "PUT"], {
        migrationNote: "Legacy settings Open API client URL; migrate to /api/modules/settings/api/manage/clients.",
      }),
    ],
  },
  {
    packageName: "@workspace/platform:agent",
    layer: "platform",
    moduleDef: {
      key: "agent",
      label: "智能体",
      desc: "智能体 API、能力清单和变更提案",
      href: "/agent",
      iconKey: "assistant",
      color: "purple",
      presentation: "headless",
      noPageReason: "不再提供独立 Agent 管理页面，仅保留工具栏助手与 API 能力",
      resourceKey: "agent",
      resourceSortOrder: 90,
    },
    resourceDefs: [
      { key: "agent.assistant", name: "Agent 助手调用", kind: "capability", capabilityOwnerKey: "settings.account", runtimeParentKey: "agent", apiPrefixes: ["/api/agent"], sortOrder: 0 },
    ],
    apiRoutes: assistantIntegrationApiRoutes(),
  },
  {
    packageName: "@workspace/platform:system",
    layer: "platform",
    routes: [
      { path: "/", access: "public", notes: "Root redirects to the current default page or login." },
      { path: "/login", access: "public", notes: "Login page must be reachable without a session." },
      { path: "/portal", access: "authenticated", notes: "Authenticated application landing page; resource navigation is filtered inside the shell." },
      { path: "/module-disabled", access: "authenticated", notes: "Disabled-module explanation page reached after a resource gate redirects." },
    ],
    apiRoutes: systemApiRoutes(),
  },
] satisfies RelationAwareWorkspacePackageRegistration[];
export const registeredModules = registeredModuleDefinitions
  .map((definition) => definition.moduleDef?.key)
  .filter((key): key is string => Boolean(key));
validateModuleRegistry(registeredModuleDefinitions, registeredModules);
export const registeredDomainPackageNames = registeredModuleDefinitions
  .filter((definition) => definition.layer === "domain")
  .map((definition) => definition.packageName);
export function getRegisteredModuleDefinition(packageName: string): RelationAwareWorkspacePackageRegistration {
  const definition = registeredModuleDefinitions.find((item) => item.packageName === packageName);
  if (!definition) {
    throw new Error(`Module package is not registered: ${packageName}`);
  }
  return definition;
}
