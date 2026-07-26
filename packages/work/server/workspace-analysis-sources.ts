import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
} from "@workspace/platform/server/workspace-analysis-read-model";
import type { WorkspaceAnalysisNestedValueRow } from "@workspace/platform/server/workspace-analysis-nested-values";

import type { toMeetingSummaryDto } from "./meeting-dto";
import type { listProjectMembers } from "./project-members";
import type { listProjects } from "./projects";
import type { listWorkPlans } from "./work-plans";
import type { getWorkItems } from "./works";
import {
  WORK_DEPARTMENT_COLLABORATION_ENABLING_DEPARTMENTS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_EXECUTOR_POSITIONS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_ITEMS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_PLANS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_RESPONSIBLE_POSITIONS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATIONS_ANALYSIS_SOURCE,
  WORK_KPI_DEFINITION_SCORING_RULE_VALUES_ANALYSIS_SOURCE,
  WORK_KPI_DEFINITIONS_ANALYSIS_SOURCE,
} from "./workspace-analysis-collaboration-kpi-sources";
import { WORK_ASSIGNED_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-assigned-sources";
import {
  WORK_REPORT_ITEMS_ANALYSIS_SOURCE,
  WORK_REPORTS_ANALYSIS_SOURCE,
} from "./workspace-analysis-report-sources";
import { WORK_PERIOD_COLLECTION_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-period-collection-sources";
import { WORK_PROJECT_GANTT_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-project-gantt-sources";
import { WORK_MEETING_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-meeting-detail-sources";
import { WORK_PROJECT_PLAN_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-project-plan-detail-sources";
import { WORK_KPI_SCORECARD_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-kpi-scorecard-sources";
import { WORK_KPI_RESULT_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-kpi-result-sources";

type WorkItemRow = Awaited<ReturnType<typeof getWorkItems>>[number];
type WorkPlanRow = Awaited<ReturnType<typeof listWorkPlans>>[number];
type ProjectRow = Awaited<ReturnType<typeof listProjects>>["projects"][number];
type ProjectMemberRow = Awaited<ReturnType<typeof listProjectMembers>>["entries"][number];
type MeetingRow = ReturnType<typeof toMeetingSummaryDto>;
type WorkItemEvidenceRow = WorkItemRow["evidenceTasks"][number] & {
  readonly workItemId: number;
  readonly planId: number | null;
  readonly targetType: string;
  readonly targetId: number;
  readonly itemType: string;
  readonly status: string;
};
type WorkItemParticipantRow = WorkItemRow["participants"][number] & {
  readonly planId: number | null;
  readonly targetType: string;
  readonly targetId: number;
};
type ProjectEnablingDepartmentRow = {
  readonly projectId: number;
  readonly projectCode: string | null;
  readonly projectName: string;
  readonly departmentId: number;
  readonly departmentCode: string;
  readonly departmentName: string;
};
type MeetingParticipantRow = MeetingRow["participants"][number] & {
  readonly meetingId: number;
  readonly meetingTitle: string;
  readonly meetingStartAt: string;
};
type WorkPlanApprovalSnapshotValueRow = WorkspaceAnalysisNestedValueRow & {
  readonly rowKey: string;
  readonly planId: number;
  readonly planTitle: string;
  readonly targetType: string;
  readonly targetId: number;
  readonly snapshotKind: "objective" | "kr";
  readonly parseStatus: "parsed" | "empty" | "invalid";
};

const field = (
  valueKind: WorkspaceAnalysisReadModelField["valueKind"],
  label: string,
  description: string,
  options: Partial<Pick<WorkspaceAnalysisReadModelField, "sensitivity" | "exportPolicy" | "capabilities">> = {},
): WorkspaceAnalysisReadModelField => ({
  classification: "field",
  valueKind,
  label,
  description,
  sensitivity: options.sensitivity ?? "internal",
  exportPolicy: options.exportPolicy ?? "allowed",
  ...(options.capabilities ? { capabilities: options.capabilities } : {}),
});

const id = (label: string, description: string) => field("integer", label, description, {
  capabilities: { groupable: true, aggregateOperations: ["count", "distinctCount"] },
});
const confidential = (kind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field(kind, label, description, { sensitivity: "confidential" })
);
const narrative = (label: string, description: string, sensitivity: "internal" | "confidential" = "internal") => (
  field("text", label, description, { sensitivity, capabilities: { groupable: false } })
);
const omit = (
  reason: Extract<WorkspaceAnalysisReadModelFieldClassification, { classification: "omit" }>["reason"],
  description: string,
) => ({ classification: "omit", reason, description } as const);
const child = (sourceKey: string, description: string) => ({ classification: "childSource", sourceKey, description } as const);

const TARGET_SCOPES = {
  personal: { mode: "target", description: "只读取目标个人工作空间。", query: { targetType: "scopeType", targetId: "scopeId" } },
  department: { mode: "target", description: "只读取目标部门工作空间。", query: { targetType: "scopeType", targetId: "scopeId" } },
  project: { mode: "target", description: "只读取目标项目工作空间。", query: { targetType: "scopeType", targetId: "scopeId" } },
} as const;

const VIEWER_SCOPES = {
  personal: { mode: "viewer", description: "展示当前查看人原业务页面可见的数据，不归属到个人空间。", query: { requesterId: "requesterId" } },
  department: { mode: "viewer", description: "展示当前查看人原业务页面可见的数据，不归属到目标部门。", query: { requesterId: "requesterId" } },
  project: { mode: "viewer", description: "展示当前查看人原业务页面可见的数据，不归属到目标项目。", query: { requesterId: "requesterId" } },
} as const;

const STANDARD_LIMITS = {
  maxRows: 5_000,
  maxGroups: 500,
  maxPageSize: 250,
  maxPages: 20,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

export const WORK_ITEMS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkItemRow>()({
  sourceKey: "work.items",
  version: 1,
  label: "工作节点",
  description: "以一条 WorkItem 公开读模型为粒度，严格绑定当前个人、部门或项目工作空间。",
  apiPath: "/api/modules/work/tasks",
  rowsPath: "works",
  totalPath: "total",
  scopes: TARGET_SCOPES,
  parameters: [
    { key: "planId", queryKey: "planId", label: "工作计划", description: "只读取指定工作计划中的节点。", kind: "integer" },
    { key: "category", queryKey: "category", label: "类别", description: "工作节点类别。", kind: "text" },
    { key: "periodType", queryKey: "periodType", label: "周期类型", description: "工作节点所属周期类型。", kind: "text" },
    { key: "periodStart", queryKey: "periodStart", label: "周期开始", description: "工作节点所属周期的开始日期。", kind: "date" },
    { key: "includeArchived", queryKey: "includeArchived", label: "包含归档", description: "是否包含已归档节点。", kind: "boolean" },
  ],
  fields: {
    id: id("节点 ID", "工作节点稳定标识。"),
    planId: id("计划 ID", "所属工作计划标识。"),
    targetType: field("text", "空间类型", "personal、department 或 project。"),
    targetId: id("空间 ID", "目标个人、部门或项目标识。"),
    category: field("text", "类别", "routine 或 non-routine。"),
    itemType: field("text", "节点类型", "objective、key_result 或 task。"),
    content: confidential("text", "内容", "工作节点标题或主要内容。"),
    description: narrative("说明", "工作节点补充说明。", "confidential"),
    importance: field("integer", "重要度", "工作节点重要度。", { capabilities: { groupable: true } }),
    urgency: field("integer", "紧急度", "工作节点紧急度。", { capabilities: { groupable: true } }),
    status: field("text", "状态", "active、paused 或 done。"),
    krStartValue: field("number", "KR 起始值", "关键结果起始值。"),
    krTargetValue: field("number", "KR 目标值", "关键结果目标值。"),
    krCurrentValue: field("number", "KR 当前值", "关键结果当前值。"),
    krUnit: field("text", "KR 单位", "关键结果计量单位。"),
    routineTaskType: field("text", "日常任务类型", "standing 或 task。"),
    routineRecurrenceType: field("text", "重复类型", "日、周、月、季度或年度重复规则。"),
    routineRecurrenceTime: field("text", "重复时间", "日常任务的重复执行时间。"),
    routineRecurrenceWeekday: field("integer", "周几", "周重复规则中的星期序号。", { capabilities: { groupable: true } }),
    routineRecurrenceMonthDay: field("integer", "月内日期", "月重复规则中的日期。", { capabilities: { groupable: true } }),
    routineRecurrenceQuarterDay: field("integer", "季内日期", "季度重复规则中的日期。", { capabilities: { groupable: true } }),
    routineRecurrenceYearMonth: field("integer", "年度月份", "年度重复规则中的月份。", { capabilities: { groupable: true } }),
    routineRecurrenceYearDay: field("integer", "年度日期", "年度重复规则中的日期。", { capabilities: { groupable: true } }),
    ownerEmployeeId: id("负责人 ID", "负责人员工主键。"),
    ownerEmployeeNumber: confidential("text", "负责人工号", "负责人业务工号。"),
    ownerEmployeeName: confidential("text", "负责人", "负责人姓名。"),
    collaborationId: id("协作 ID", "部门协作记录标识。"),
    collaborationTitle: confidential("text", "协作事项", "部门协作标题。"),
    collaborationResponsibleDepartmentId: id("协作负责部门 ID", "协作事项负责部门标识。"),
    collaborationResponsibleDepartmentName: field("text", "协作负责部门", "协作事项负责部门名称。"),
    actualStartDate: field("date", "实际开始", "实际开始日期。"),
    actualEndDate: field("date", "实际结束", "实际结束日期。"),
    plannedStartDate: field("date", "计划开始", "计划开始日期。"),
    plannedEndDate: field("date", "计划结束", "计划结束日期。"),
    isMilestone: field("boolean", "里程碑", "是否为里程碑节点。"),
    milestoneDate: field("date", "里程碑日期", "里程碑目标日期。"),
    completedAt: field("date", "完成时间", "节点完成时间。"),
    periodType: field("text", "周期类型", "节点所属周期类型。"),
    periodStart: field("date", "周期开始", "节点所属周期开始日期。"),
    periodEnd: field("date", "周期结束", "节点所属周期结束日期。"),
    sourceType: field("text", "来源类型", "department、project、meeting 或 other。"),
    sourceKind: field("text", "来源子类", "来源的业务子类型。"),
    sourceMeetingId: id("来源会议 ID", "来源会议标识。"),
    sourceMeetingTitle: confidential("text", "来源会议", "来源会议标题。"),
    sourceMeetingStartAt: field("date", "来源会议日期", "来源会议开始日期。"),
    sourceMeetingDecisionId: id("来源决议 ID", "来源会议决议标识。"),
    sourceMeetingDecisionTitle: confidential("text", "来源决议", "来源会议决议标题。"),
    sourceMeetingDecisionKind: field("text", "决议类型", "来源会议决议类型。"),
    sourceMeetingActionCandidateId: id("行动建议 ID", "来源会议行动建议标识。"),
    sourceMeetingActionCandidateTitle: confidential("text", "行动建议", "来源会议行动建议标题。"),
    sourceDepartmentId: id("来源部门 ID", "来源部门标识。"),
    sourceDepartmentName: field("text", "来源部门", "来源部门名称。"),
    sourceDepartmentCode: field("text", "来源部门编码", "来源部门业务编码。"),
    linkedProjectId: id("关联项目 ID", "关联项目标识。"),
    linkedProjectName: confidential("text", "关联项目", "关联项目名称。"),
    linkedProjectCode: field("text", "项目编码", "关联项目业务编码。"),
    linkedProjectPhaseId: id("项目阶段 ID", "关联项目阶段标识。"),
    linkedProjectPhaseName: confidential("text", "项目阶段", "关联项目阶段名称。"),
    parentWorkItemId: id("父节点 ID", "同计划父工作节点标识。"),
    parentWorkItemContent: confidential("text", "父节点", "同计划父工作节点内容。"),
    parentPeriodWorkItemId: id("上期父节点 ID", "跨周期父工作节点标识。"),
    parentPeriodWorkItemContent: confidential("text", "上期父节点", "跨周期父工作节点内容。"),
    parentPeriodWorkItemType: field("text", "上期父节点类型", "跨周期父节点的节点类型。"),
    parentPeriodWorkItemCycleLabel: field("text", "上期父节点周期", "跨周期父节点所属周期。"),
    parentPeriodWorkItemTargetType: field("text", "上期父节点空间类型", "跨周期父节点所属空间类型。"),
    parentPeriodWorkItemTargetId: id("上期父节点空间 ID", "跨周期父节点所属空间标识。"),
    parentPeriodWorkItemKrTargetValue: field("number", "上期 KR 目标值", "跨周期父 KR 目标值。"),
    parentPeriodWorkItemKrCurrentValue: field("number", "上期 KR 当前值", "跨周期父 KR 当前值。"),
    parentPeriodWorkItemKrUnit: field("text", "上期 KR 单位", "跨周期父 KR 计量单位。"),
    previousPeriodWorkItemId: id("前序节点 ID", "前一周期工作节点标识。"),
    previousPeriodWorkItemContent: confidential("text", "前序节点", "前一周期工作节点内容。"),
    previousPeriodWorkItemCycleLabel: field("text", "前序节点周期", "前一周期工作节点所属周期。"),
    responsibilityReferenceId: id("职责引用 ID", "执行职责引用标识。"),
    responsibilityNodeId: id("职责节点 ID", "岗位职责节点标识。"),
    responsibilityLabel: confidential("text", "关联职责", "执行职责展示名称。"),
    responsibilityPathLabel: confidential("text", "职责路径", "执行职责层级路径。"),
    responsibilityTitle: confidential("text", "职责标题", "执行职责标题快照。"),
    responsibilityContent: narrative("职责内容", "执行职责内容快照。", "confidential"),
    responsibilityLockedEmployeeId: id("职责员工 ID", "职责引用锁定的员工标识。"),
    responsibilityPositionId: id("职责岗位 ID", "职责引用锁定的岗位标识。"),
    responsibilityPositionName: confidential("text", "职责岗位", "职责引用锁定的岗位名称。"),
    evidenceTaskIds: omit("derivedDuplicate", "证据任务 ID 已由证据明细关系表达。"),
    evidenceTasks: child("work.item-evidence", "KR 证据为一对多关系，需拆成稳定子读模型。"),
    isArchived: field("boolean", "已归档", "节点是否已归档。"),
    isPrivate: field("boolean", "私密标记", "节点在公开 DTO 中的私密标记。", { sensitivity: "confidential" }),
    sortOrder: field("integer", "排序", "节点在同级中的排序值。"),
    createdAt: field("date", "创建时间", "节点创建时间。"),
    participants: child("work.item-participants", "参与人为一对多关系，需拆成稳定子读模型。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 20 },
  limits: STANDARD_LIMITS,
});

export const WORK_PLANS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkPlanRow>()({
  sourceKey: "work.plans",
  version: 1,
  label: "工作计划",
  description: "以一条 WorkPlan 公开读模型为粒度，严格绑定当前个人、部门或项目工作空间。",
  apiPath: "/api/modules/work/tasks/plans",
  rowsPath: "plans",
  totalPath: "total",
  scopes: TARGET_SCOPES,
  parameters: [
    { key: "kind", queryKey: "kind", label: "计划类型", description: "okr 或 routine。", kind: "text" },
    { key: "includeArchived", queryKey: "includeArchived", label: "包含归档", description: "是否包含已归档计划。", kind: "boolean" },
  ],
  fields: {
    id: id("计划 ID", "工作计划稳定标识。"), targetType: field("text", "空间类型", "计划所属空间类型。"), targetId: id("空间 ID", "计划所属空间标识。"),
    kind: field("text", "计划类型", "okr 或 routine。"), title: confidential("text", "计划名称", "工作计划名称。"), description: narrative("计划说明", "工作计划说明。", "confidential"),
    status: field("text", "状态", "active 或 done。"), isArchived: field("boolean", "已归档", "计划是否已归档。"), okrStage: field("text", "OKR 阶段", "公开 DTO 中的兼容治理阶段。"),
    maintenance: omit("controlPlane", "页面维护能力矩阵不是业务分析事实。"), governance: omit("controlPlane", "动态治理运行态不是稳定分析字段。"),
    objectiveSubmittedAt: field("date", "目标提交时间", "目标申报提交时间。"), objectiveApprovedAt: field("date", "目标确认时间", "目标申报确认时间。"), objectiveApprovedByUserId: id("目标确认人 ID", "目标确认用户标识。"),
    krReviewOpensAt: field("date", "结果开放时间", "KR 结果评审开放时间。"), krSubmittedAt: field("date", "结果提交时间", "KR 结果提交时间。"), krApprovedAt: field("date", "结果确认时间", "KR 结果确认时间。"), krApprovedByUserId: id("结果确认人 ID", "KR 结果确认用户标识。"),
    ownerEmployeeId: id("负责人 ID", "计划负责人员工标识。"), ownerEmployeeNumber: confidential("text", "负责人工号", "计划负责人业务工号。"), ownerEmployeeName: confidential("text", "负责人", "计划负责人姓名。"),
    collaborationId: id("协作 ID", "部门协作记录标识。"), collaborationTitle: confidential("text", "协作事项", "部门协作标题。"), collaborationResponsibleDepartmentId: id("协作负责部门 ID", "协作负责部门标识。"), collaborationResponsibleDepartmentName: field("text", "协作负责部门", "协作负责部门名称。"),
    isSystemGenerated: field("boolean", "系统生成", "计划是否由周期系统生成。"), okrCycleId: id("周期 ID", "OKR 周期标识。"), okrCycleCode: field("text", "周期编码", "OKR 周期业务编码。"), okrCycleLabel: field("text", "周期", "OKR 周期名称。"),
    okrControlScopeType: field("text", "OKR 管控范围类型", "计划绑定的 OKR 管控范围类型。"), okrControlScopeId: field("text", "OKR 管控范围 ID", "计划绑定的 OKR 管控范围标识。"), governanceMode: field("text", "治理模式", "计划采用的治理模式。"), governanceRevision: id("治理修订号", "治理绑定的当前修订号。"), governanceActionKey: field("text", "治理动作键", "计划绑定的治理动作键。"), governanceWorkflowPolicyId: id("流程策略 ID", "治理流程策略标识。"), governanceWorkflowVersion: id("流程策略版本", "治理流程策略版本号。"), governanceActionContractVersion: id("动作契约版本", "治理动作契约版本号。"), governanceOkrControlVersion: id("OKR 管控版本", "OKR 管控配置版本号。"), governanceBindingSource: field("text", "治理绑定来源", "治理绑定的来源类型。"), governanceBoundAt: field("date", "治理绑定时间", "治理绑定完成时间。"),
    sourcePlanId: id("来源计划 ID", "历史来源计划标识。"), sourcePlanTitle: confidential("text", "来源计划", "历史来源计划名称。"), sourcePlanCycleLabel: field("text", "来源计划周期", "来源计划所属周期。"),
    parentPeriodPlanId: id("上级周期计划 ID", "上级周期计划标识。"), parentPeriodPlanTitle: confidential("text", "上级周期计划", "上级周期计划名称。"), parentPeriodPlanCycleLabel: field("text", "上级计划周期", "上级周期计划所属周期。"),
    alignmentSourceType: field("text", "承接来源类型", "plan、objective 或 key_result。"), alignmentSourcePlanId: id("承接计划 ID", "承接来源计划标识。"), alignmentSourcePlanTitle: confidential("text", "承接计划", "承接来源计划名称。"), alignmentSourcePlanTargetType: field("text", "承接计划空间类型", "承接来源计划所属空间类型。"), alignmentSourcePlanTargetId: id("承接计划空间 ID", "承接来源计划所属空间标识。"), alignmentSourcePlanCycleLabel: field("text", "承接计划周期", "承接来源计划所属周期。"),
    alignmentSourceWorkItemId: id("承接节点 ID", "承接来源工作节点标识。"), alignmentSourceWorkItemContent: confidential("text", "承接节点", "承接来源工作节点内容。"), alignmentSourceWorkItemTargetType: field("text", "承接节点空间类型", "承接来源节点所属空间类型。"), alignmentSourceWorkItemTargetId: id("承接节点空间 ID", "承接来源节点所属空间标识。"), alignmentSourceWorkItemCycleLabel: field("text", "承接节点周期", "承接来源节点所属周期。"), alignmentSourceWorkItemPlanTitle: confidential("text", "承接节点计划", "承接来源节点所属计划。"), alignmentSourceWorkItemKrTargetValue: field("number", "承接 KR 目标值", "承接来源 KR 目标值。"), alignmentSourceWorkItemKrUnit: field("text", "承接 KR 单位", "承接来源 KR 计量单位。"),
    previousPeriodPlanId: id("前序计划 ID", "前一周期计划标识。"), previousPeriodPlanTitle: confidential("text", "前序计划", "前一周期计划名称。"), previousPeriodPlanCycleLabel: field("text", "前序计划周期", "前一周期计划所属周期。"),
    objectiveApprovalSnapshotJson: child("work.plan-approval-snapshot-values", "目标审批快照由规范化路径和值子读模型表达。"), krApprovalSnapshotJson: child("work.plan-approval-snapshot-values", "结果审批快照由规范化路径和值子读模型表达。"),
    periodType: field("text", "周期类型", "计划所属周期类型。"), actualStartDate: field("date", "实际开始", "计划实际开始日期。"), actualEndDate: field("date", "实际结束", "计划实际结束日期。"), plannedStartDate: field("date", "计划开始", "计划开始日期。"), plannedEndDate: field("date", "计划结束", "计划结束日期。"), isMilestone: field("boolean", "里程碑", "计划是否为里程碑。"), milestoneDate: field("date", "里程碑日期", "计划里程碑日期。"),
    sourceType: field("text", "来源类型", "计划兼容来源类型。"), sourceKind: field("text", "来源子类", "计划兼容来源子类。"), sourceMeetingId: id("来源会议 ID", "来源会议标识。"), sourceMeetingTitle: confidential("text", "来源会议", "来源会议标题。"), sourceMeetingStartAt: field("date", "来源会议日期", "来源会议开始日期。"), sourceMeetingDecisionId: id("来源决议 ID", "来源会议决议标识。"), sourceMeetingDecisionTitle: confidential("text", "来源决议", "来源会议决议标题。"), sourceMeetingDecisionKind: field("text", "决议类型", "来源会议决议类型。"), sourceMeetingActionCandidateId: id("行动建议 ID", "来源会议行动建议标识。"), sourceMeetingActionCandidateTitle: confidential("text", "行动建议", "来源会议行动建议标题。"), sourceDepartmentId: id("来源部门 ID", "来源部门标识。"), sourceDepartmentName: field("text", "来源部门", "来源部门名称。"), sourceDepartmentCode: field("text", "来源部门编码", "来源部门业务编码。"), linkedProjectId: id("关联项目 ID", "关联项目标识。"), linkedProjectName: confidential("text", "关联项目", "关联项目名称。"), linkedProjectCode: field("text", "项目编码", "关联项目业务编码。"), linkedProjectPhaseId: id("项目阶段 ID", "关联项目阶段标识。"), linkedProjectPhaseName: confidential("text", "项目阶段", "关联项目阶段名称。"),
    itemCount: field("integer", "节点数", "计划直属节点数量。"), itemStatusCounts: omit("derivedDuplicate", "状态汇总可从 work.items 按计划聚合。"), sortOrder: field("integer", "排序", "计划排序值。"), createdAt: field("date", "创建时间", "计划创建时间。"), updatedAt: field("date", "更新时间", "计划最后更新时间。"),
    actionRuntimes: omit("controlPlane", "动态动作运行态用于页面控制，不是业务分析事实。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 20 },
  limits: STANDARD_LIMITS,
});

export const WORK_PLAN_APPROVAL_SNAPSHOT_VALUES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkPlanApprovalSnapshotValueRow>()({
  sourceKey: "work.plan-approval-snapshot-values",
  version: 1,
  label: "工作计划审批快照字段",
  description: "以一条计划审批快照路径和值为粒度，规范化公开计划 DTO 中的目标与结果审批快照，并严格绑定当前工作空间。",
  apiPath: "/api/modules/work/tasks/plans",
  rowsPath: "plans.approvalSnapshotValues",
  totalPath: "total",
  scopes: TARGET_SCOPES,
  parameters: [
    { key: "kind", queryKey: "kind", label: "计划类型", description: "okr 或 routine。", kind: "text" },
    { key: "includeArchived", queryKey: "includeArchived", label: "包含归档", description: "是否包含已归档计划。", kind: "boolean" },
  ],
  fields: {
    rowKey: field("text", "明细行键", "由计划、快照类型和字段路径组成的稳定行键。"),
    planId: id("计划 ID", "审批快照所属工作计划标识。"),
    planTitle: confidential("text", "计划名称", "审批快照所属工作计划名称。"),
    targetType: field("text", "空间类型", "审批快照所属工作空间类型。"),
    targetId: id("空间 ID", "审批快照所属个人、部门或项目标识。"),
    snapshotKind: field("text", "快照类型", "objective 表示目标审批快照，kr 表示结果审批快照。"),
    parseStatus: field("text", "解析状态", "parsed 表示合法 JSON，empty 表示空字符串，invalid 表示非法 JSON。"),
    path: field("text", "字段路径", "审批快照中的确定性字段路径。"),
    valueKind: field("text", "值类型", "字段值的原始标量类型或空容器类型。"),
    textValue: confidential("text", "文本值", "字段值的无损文本表示；数字和布尔值同时保留专用列。"),
    numberValue: confidential("number", "数值", "字段原值为数字时的数值列，否则为空。"),
    booleanValue: confidential("boolean", "布尔值", "字段原值为布尔值时的布尔列，否则为空。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 20 },
  limits: STANDARD_LIMITS,
});

export const WORK_PROJECTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ProjectRow>()({
  sourceKey: "work.projects",
  version: 1,
  label: "可见项目",
  description: "以一条项目公开读模型为粒度，沿用当前查看人的项目对象级可见范围。",
  apiPath: "/api/modules/work/projects",
  rowsPath: "projects",
  totalPath: "total",
  scopes: VIEWER_SCOPES,
  parameters: [
    { key: "keyword", queryKey: "keyword", label: "关键词", description: "按项目公开读模型字段搜索。", kind: "text" },
    { key: "archived", queryKey: "archived", label: "归档项目", description: "读取归档项目而非当前项目。", kind: "boolean" },
  ],
  fields: {
    id: id("项目 ID", "项目稳定标识。"), version: id("项目版本", "项目公开读模型中的版本号。"), code: field("text", "项目编码", "项目业务编码。"), name: confidential("text", "项目名称", "项目名称。"), createdBy: id("创建人 ID", "项目创建用户标识。"),
    permissions: omit("controlPlane", "当前查看人的页面权限矩阵不是项目事实。"), actionPermissions: omit("controlPlane", "当前查看人的动作权限矩阵不是项目事实。"),
    description: narrative("项目说明", "项目说明。", "confidential"), projectType: field("text", "项目类型", "公司、部门或其他项目。"), status: field("text", "项目状态", "pending、active 或 done。"), projectLevel: field("text", "项目级别", "普通、重点或特殊。"), plan: narrative("项目计划", "项目计划说明。", "confidential"), goal: narrative("项目目标", "项目目标说明。", "confidential"), milestones: narrative("项目里程碑", "项目里程碑说明。", "confidential"),
    budgetAmount: confidential("currency", "预算金额", "项目预算金额。"), budgetNote: narrative("预算说明", "项目预算说明。", "confidential"), riskNote: narrative("风险说明", "项目风险说明。", "confidential"), remark: narrative("备注", "项目备注。", "confidential"),
    isArchived: field("boolean", "已归档", "项目是否已归档。"), archivedAt: field("date", "归档时间", "项目归档时间。"), leadingDepartmentId: id("归口部门 ID", "项目归口部门标识。"), leadingDepartmentName: field("text", "归口部门", "项目归口部门名称。"), leadingDepartmentCode: field("text", "归口部门编码", "项目归口部门业务编码。"),
    enablingDepartments: child("work.project-enabling-departments", "赋能部门为一对多关系，需拆成稳定子读模型。"), enablingDepartmentIds: omit("derivedDuplicate", "赋能部门 ID 已由赋能部门子读模型表达。"), workspaceEnabled: field("boolean", "项目空间", "项目空间是否启用。"),
    plannedStartDate: field("date", "计划开始", "项目计划开始日期。"), plannedEndDate: field("date", "计划结束", "项目计划结束日期。"), actualStartDate: field("date", "实际开始", "项目实际开始日期。"), actualEndDate: field("date", "实际结束", "项目实际结束日期。"), completionPercent: field("percent", "完成度", "项目公开读模型中的完成百分比。"), employeeCount: field("integer", "项目成员数", "项目成员关系数量。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 2 },
  limits: { ...STANDARD_LIMITS, maxRows: 500, maxPages: 2 },
});

export const WORK_PROJECT_MEMBERS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ProjectMemberRow>()({
  sourceKey: "work.project-members",
  version: 1,
  label: "项目成员",
  description: "以一条项目成员公开读模型为粒度，只读取当前目标项目及其原对象级可见范围。",
  apiPath: "/api/modules/work/projects/members",
  rowsPath: "entries",
  totalPath: "total",
  scopes: { project: { mode: "target", description: "只读取目标项目的成员。", query: { projectId: "scopeId" } } },
  parameters: [{ key: "keyword", queryKey: "keyword", label: "关键词", description: "按员工、项目或角色搜索。", kind: "text" }],
  fields: {
    id: id("成员关系 ID", "项目成员关系版本记录标识。"), version: id("成员关系版本", "项目成员公开读模型中的乐观并发版本号。"), membershipUid: field("text", "成员关系 UID", "跨版本稳定的项目成员关系标识。"), sequence: id("成员关系序号", "同一成员关系内的有效版本序号。"), recordState: field("text", "记录状态", "成员关系版本的 confirmed、superseded 或 cancelled 状态。"), temporalState: field("text", "时间状态", "成员关系相对查询业务日的当前、未来或历史分类。"), employeeId: id("员工 ID", "成员员工主键。"), employeeNumber: confidential("text", "工号", "成员业务工号。"), employeeName: confidential("text", "姓名", "成员姓名。"), projectId: id("项目 ID", "所属项目标识。"), projectName: confidential("text", "项目", "所属项目名称。"), role: field("text", "RASCI 角色", "成员在项目中的角色。"), startDate: field("date", "开始日期", "成员参与项目的开始日期。"), endDate: field("date", "结束日期", "成员参与项目的结束日期。"), confirmationStatus: field("text", "确认状态", "pending 或 confirmed。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 2 },
  limits: { ...STANDARD_LIMITS, maxRows: 500, maxPages: 2 },
});

export const WORK_MEETINGS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<MeetingRow>()({
  sourceKey: "work.meetings",
  version: 1,
  label: "可见会议",
  description: "以一条会议摘要公开读模型为粒度，沿用当前查看人的会议对象级可见范围。",
  apiPath: "/api/modules/work/meetings",
  rowsPath: "meetings",
  totalPath: "total",
  scopes: VIEWER_SCOPES,
  parameters: [{ key: "typeId", queryKey: "typeId", label: "会议类型", description: "只读取指定会议类型。", kind: "integer" }],
  fields: {
    id: id("会议 ID", "会议稳定标识。"), typeId: id("会议类型 ID", "会议类型标识。"), typeName: field("text", "会议类型", "会议类型名称。"), title: confidential("text", "会议标题", "会议标题。"), description: narrative("会议说明", "会议说明。", "confidential"), startAt: field("date", "开始时间", "会议开始时间。"), endAt: field("date", "结束时间", "会议结束时间。"), location: confidential("text", "地点", "会议地点。"), visibility: field("text", "可见范围", "会议可见范围。"), status: field("text", "状态", "会议状态。"), ownerUserId: id("负责人用户 ID", "会议负责人用户标识。"), ownerName: confidential("text", "负责人", "会议负责人姓名。"), secretaryUserId: id("记录人用户 ID", "会议记录人用户标识。"), secretaryName: confidential("text", "记录人", "会议记录人姓名。"), participantCount: field("integer", "参会人数", "会议参会人数量。"), counts: omit("derivedDuplicate", "议程、纪要、提案、决议和行动数应由对应明细读模型聚合。"), participants: child("work.meeting-participants", "参会人为一对多关系，需拆成稳定子读模型。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 1 },
  limits: { ...STANDARD_LIMITS, maxRows: 200, maxPageSize: 200, maxPages: 1 },
});

export const WORK_ITEM_EVIDENCE_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkItemEvidenceRow>()({
  sourceKey: "work.item-evidence",
  version: 1,
  label: "工作节点 KR 证据",
  description: "以一条工作节点 KR 证据关系为粒度，复用目标工作空间的对象级可见性。",
  apiPath: "/api/modules/work/tasks",
  rowsPath: "evidenceTasks",
  totalPath: "total",
  scopes: TARGET_SCOPES,
  parameters: [
    { key: "planId", queryKey: "planId", label: "工作计划", description: "只读取指定工作计划中的节点证据。", kind: "integer" },
    { key: "category", queryKey: "category", label: "类别", description: "父工作节点类别。", kind: "text" },
    { key: "periodType", queryKey: "periodType", label: "周期类型", description: "父工作节点所属周期类型。", kind: "text" },
    { key: "periodStart", queryKey: "periodStart", label: "周期开始", description: "父工作节点所属周期开始日期。", kind: "date" },
    { key: "includeArchived", queryKey: "includeArchived", label: "包含归档", description: "是否包含已归档父节点。", kind: "boolean" },
  ],
  fields: {
    workItemId: id("工作节点 ID", "证据所属工作节点标识。"),
    planId: id("计划 ID", "证据所属工作计划标识。"),
    targetType: field("text", "空间类型", "证据所属工作节点空间类型。"),
    targetId: id("空间 ID", "证据所属个人、部门或项目标识。"),
    itemType: field("text", "节点类型", "证据所属节点类型。"),
    status: field("text", "节点状态", "证据所属节点当前状态。"),
    taskWorkItemId: id("证据任务 ID", "作为 KR 证据的任务工作节点标识。"),
    note: narrative("证据说明", "KR 证据关系说明。", "confidential"),
    sortOrder: field("integer", "排序", "证据在父节点中的排序值。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 20 },
  limits: STANDARD_LIMITS,
});

export const WORK_ITEM_PARTICIPANTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<WorkItemParticipantRow>()({
  sourceKey: "work.item-participants",
  version: 1,
  label: "工作节点参与人",
  description: "以一条工作节点参与人关系为粒度，复用目标工作空间的对象级可见性。",
  apiPath: "/api/modules/work/tasks",
  rowsPath: "participants",
  totalPath: "total",
  scopes: TARGET_SCOPES,
  parameters: [
    { key: "planId", queryKey: "planId", label: "工作计划", description: "只读取指定工作计划中的参与人。", kind: "integer" },
    { key: "category", queryKey: "category", label: "类别", description: "父工作节点类别。", kind: "text" },
    { key: "periodType", queryKey: "periodType", label: "周期类型", description: "父工作节点所属周期类型。", kind: "text" },
    { key: "periodStart", queryKey: "periodStart", label: "周期开始", description: "父工作节点所属周期开始日期。", kind: "date" },
    { key: "includeArchived", queryKey: "includeArchived", label: "包含归档", description: "是否包含已归档父节点。", kind: "boolean" },
  ],
  fields: {
    id: id("参与关系 ID", "工作节点参与人关系标识。"),
    workItemId: id("工作节点 ID", "参与人所属工作节点标识。"),
    planId: id("计划 ID", "参与人所属工作计划标识。"),
    targetType: field("text", "空间类型", "参与人所属工作节点空间类型。"),
    targetId: id("空间 ID", "参与人所属个人、部门或项目标识。"),
    name: confidential("text", "参与人", "参与人姓名。"),
    wxUserId: field("text", "企业微信用户 ID", "参与人的企业微信用户标识。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    createdAt: field("date", "加入时间", "参与关系创建时间。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 20 },
  limits: STANDARD_LIMITS,
});

export const WORK_PROJECT_ENABLING_DEPARTMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ProjectEnablingDepartmentRow>()({
  sourceKey: "work.project-enabling-departments",
  version: 1,
  label: "项目赋能部门",
  description: "以一个可见项目与一个赋能部门的关系为粒度，复用项目列表的对象级可见范围。",
  apiPath: "/api/modules/work/projects",
  rowsPath: "enablingDepartments",
  totalPath: "total",
  scopes: VIEWER_SCOPES,
  parameters: [
    { key: "keyword", queryKey: "keyword", label: "关键词", description: "按项目公开读模型字段搜索。", kind: "text" },
    { key: "archived", queryKey: "archived", label: "归档项目", description: "读取归档项目而非当前项目。", kind: "boolean" },
  ],
  fields: {
    projectId: id("项目 ID", "赋能关系所属项目标识。"),
    projectCode: field("text", "项目编码", "赋能关系所属项目业务编码。"),
    projectName: confidential("text", "项目", "赋能关系所属项目名称。"),
    departmentId: id("赋能部门 ID", "赋能部门标识。"),
    departmentCode: field("text", "赋能部门编码", "赋能部门业务编码。"),
    departmentName: field("text", "赋能部门", "赋能部门名称。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 2 },
  limits: { ...STANDARD_LIMITS, maxRows: 500, maxPages: 2 },
});

export const WORK_MEETING_PARTICIPANTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<MeetingParticipantRow>()({
  sourceKey: "work.meeting-participants",
  version: 1,
  label: "会议参会人",
  description: "以一条可见会议参会关系为粒度，复用会议列表的对象级可见范围。",
  apiPath: "/api/modules/work/meetings",
  rowsPath: "participants",
  totalPath: "total",
  scopes: VIEWER_SCOPES,
  parameters: [{ key: "typeId", queryKey: "typeId", label: "会议类型", description: "只读取指定会议类型。", kind: "integer" }],
  fields: {
    meetingId: id("会议 ID", "参会关系所属会议标识。"),
    meetingTitle: confidential("text", "会议", "参会关系所属会议标题。"),
    meetingStartAt: field("date", "会议开始时间", "参会关系所属会议开始时间。"),
    id: id("参会关系 ID", "会议参会关系标识。"),
    userId: id("参会用户 ID", "参会用户标识。"),
    userName: confidential("text", "参会人", "参会人姓名。"),
    role: field("text", "参会角色", "owner、secretary 或 participant。"),
    canVote: field("boolean", "可投票", "参会人是否具备投票资格。"),
    attendanceStatus: field("text", "出席状态", "参会人的出席状态。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 5 },
  limits: { ...STANDARD_LIMITS, maxRows: 1_000, maxPageSize: 200, maxPages: 5 },
});

export const WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  ...WORK_ASSIGNED_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_ITEMS_ANALYSIS_SOURCE,
  WORK_ITEM_EVIDENCE_ANALYSIS_SOURCE,
  WORK_ITEM_PARTICIPANTS_ANALYSIS_SOURCE,
  WORK_PLANS_ANALYSIS_SOURCE,
  WORK_PLAN_APPROVAL_SNAPSHOT_VALUES_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATIONS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_ENABLING_DEPARTMENTS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_RESPONSIBLE_POSITIONS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_EXECUTOR_POSITIONS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_PLANS_ANALYSIS_SOURCE,
  WORK_DEPARTMENT_COLLABORATION_ITEMS_ANALYSIS_SOURCE,
  WORK_KPI_DEFINITIONS_ANALYSIS_SOURCE,
  WORK_KPI_DEFINITION_SCORING_RULE_VALUES_ANALYSIS_SOURCE,
  ...WORK_KPI_SCORECARD_ANALYSIS_SOURCE_REGISTRATIONS,
  ...WORK_KPI_RESULT_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_REPORTS_ANALYSIS_SOURCE,
  WORK_REPORT_ITEMS_ANALYSIS_SOURCE,
  ...WORK_PERIOD_COLLECTION_ANALYSIS_SOURCE_REGISTRATIONS,
  ...WORK_PROJECT_GANTT_ANALYSIS_SOURCE_REGISTRATIONS,
  ...WORK_PROJECT_PLAN_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_PROJECTS_ANALYSIS_SOURCE,
  WORK_PROJECT_ENABLING_DEPARTMENTS_ANALYSIS_SOURCE,
  WORK_PROJECT_MEMBERS_ANALYSIS_SOURCE,
  WORK_MEETINGS_ANALYSIS_SOURCE,
  WORK_MEETING_PARTICIPANTS_ANALYSIS_SOURCE,
  ...WORK_MEETING_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS,
] as const;
